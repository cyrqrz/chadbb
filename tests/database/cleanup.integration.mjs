import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import EmbeddedPostgres from 'embedded-postgres'
import { cleanupUsers } from '../support/local.mjs'

let server, admin, directory, config
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'chadbb-cleanup-db-'))
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  server = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), port, user: 'postgres', password: 'local-test-only',
    persistent: false, initdbFlags: ['--locale=C', '--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} })
  await server.initialise(); await server.start()
  config = { DB_URL: `postgresql://postgres:local-test-only@127.0.0.1:${port}/postgres?application_name=cleanup-regression&options=-c%20statement_timeout%3D8000` }
  admin = server.getPgClient(); await admin.connect()
  await admin.query(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'))
  const migrations = new URL('../../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await admin.query(await readFile(new URL(name, migrations), 'utf8'))
  }
}, { timeout: 60_000 })
after(async () => { await admin?.end(); if (server) await server.stop(); if (directory) await rm(directory, { recursive: true, force: true }) })

async function fixture() {
  const owner = randomUUID(); const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
  await admin.query('insert into auth.users(id,email) values ($1,$2)', [owner, `${owner}@example.test`])
  const event = (await admin.query("insert into public.events(owner_id,title,status,starts_at,ends_at) values ($1,'Evento fictício','published',now()+interval '30 days',now()+interval '30 days 4 hours') returning id", [owner])).rows[0].id
  const invitation = (await admin.query("insert into private.invitations(event_id,name,kind,capacity,token_hash,expires_at) values ($1,'Família fictícia','family',3,encode(sha256(convert_to($2,'UTF8')),'hex'),now()+interval '30 days') returning id", [event, token])).rows[0].id
  return { owner, event, invitation, token }
}

async function waitForCleanupBlockedBy(guest) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const result = await admin.query("select exists(select 1 from pg_stat_activity a join pg_locks l on l.pid=a.pid where a.application_name='cleanup-regression' and not l.granted and $1::integer=any(pg_blocking_pids(a.pid))) blocked", [guest.processID])
    if (result.rows[0].blocked) return
    // Polling interval only: the observed PostgreSQL wait establishes ordering.
    await pause(10)
  }
  assert.fail('cleanup não chegou ao bloqueio pelo convidado dentro do prazo')
}

test('cleanup espera convidado em curso sem deadlock e preserva outro usuário', async () => {
  const target = await fixture(); const untouched = await fixture()
  const guest = server.getPgClient(); await guest.connect()
  let cleaning
  try {
    await guest.query("set statement_timeout='8s'")
    await guest.query('begin')
    await guest.query('select id from public.events where id=$1 for share', [target.event])
    // Capture rejection immediately: either participant may be the deadlock victim.
    cleaning = cleanupUsers(config, [target.owner]).then(() => ({ ok: true }), error => ({ error }))
    await waitForCleanupBlockedBy(guest)
    let guestError
    try {
      const access = (await guest.query("select public.guest_action($1,'exchange') result", [target.token])).rows[0].result
      assert.ok(access.session_token)
      await guest.query('commit')
    } catch (error) {
      guestError = error
      await guest.query('rollback')
    }
    const cleanupResult = await cleaning
    assert.equal(guestError, undefined, `guest falhou: ${guestError?.code ?? guestError?.message}`)
    assert.equal(cleanupResult.error, undefined, `cleanup falhou: ${cleanupResult.error?.code ?? cleanupResult.error?.message}`)
    const removed = await admin.query('select (select count(*) from auth.users where id=$1) users,(select count(*) from public.events where id=$2) events,(select count(*) from private.invitations where id=$3) invitations,(select count(*) from private.guest_sessions where invitation_id=$3) sessions', [target.owner, target.event, target.invitation])
    assert.deepEqual(removed.rows[0], { users: '0', events: '0', invitations: '0', sessions: '0' })
    const preserved = await admin.query('select (select count(*) from auth.users where id=$1) users,(select count(*) from public.events where id=$2) events,(select count(*) from private.invitations where id=$3) invitations', [untouched.owner, untouched.event, untouched.invitation])
    assert.deepEqual(preserved.rows[0], { users: '1', events: '1', invitations: '1' })
  } finally {
    await guest.query('rollback'); await guest.end()
    if (cleaning) await cleaning
  }
}, { timeout: 20_000 })
