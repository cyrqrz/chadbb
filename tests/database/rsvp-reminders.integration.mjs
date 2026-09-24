import { before, after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'

// Cluster exclusivo: não usa Docker, credenciais remotas ou dados do usuário.
let server, admin, directory
const owner = '00000000-0000-4000-8000-000000000071'
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'chadbb-rsvp-db-'))
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  server = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), port, user: 'postgres', password: 'local-test-only',
    persistent: false, initdbFlags: ['--locale=C', '--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} })
  await server.initialise(); await server.start()
  admin = server.getPgClient(); await admin.connect()
  await admin.query(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'))
  const migrations = new URL('../../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await admin.query(await readFile(new URL(name, migrations), 'utf8'))
  }
  await admin.query('insert into auth.users(id,email) values ($1,$2)', [owner, 'organizer@example.test'])
}, { timeout: 60_000 })
after(async () => {
  await admin?.end()
  if (server) await server.stop()
  if (directory) await rm(directory, { recursive: true, force: true })
})
beforeEach(async () => {
  await admin.query("update public.events set status='closed' where status='published'")
  await admin.query('delete from private.rsvp_reminders')
})
async function connection(role) {
  const client = server.getPgClient(); await client.connect()
  if (role) {
    assert.ok(['anon', 'authenticated', 'service_role'].includes(role))
    await client.query(`set role ${role}`)
  }
  return client
}
async function fixture() {
  const event = (await admin.query(`insert into public.events(owner_id,title,status,starts_at,ends_at)
    values ($1,'Evento fictício','published',clock_timestamp()+interval '20 days',clock_timestamp()+interval '20 days 4 hours') returning *`, [owner])).rows[0]
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
  const invite = (await admin.query("select public.organizer_invitations($1,'create',$2) data", [event.id,
    { name: 'Convidado fictício', kind: 'family', capacity: 3 }])).rows[0].data
  const access = await action(invite.token, 'exchange')
  return { event, invite, token: access.session_token }
}
async function action(token, name, payload = {}, client = admin) {
  return (await client.query('select public.guest_action($1,$2,$3) data', [token, name, payload])).rows[0].data
}
function payload(response = 'maybe', version = 1, extra = {}) {
  return { response, attending: response === 'yes' ? 2 : 0, version, request_id: randomUUID(), ...extra }
}
async function maybe(f) {
  const request = payload('maybe', 1, { reminder_email: 'guest@example.test' })
  await action(f.token, 'rsvp', request)
  return request
}
async function cut(f) {
  await admin.query("update public.events set starts_at=clock_timestamp()+interval '9 days', ends_at=clock_timestamp()+interval '9 days 4 hours' where id=$1", [f.event.id])
}
async function claim(client = admin) {
  return (await client.query('select public.rsvp_reminders_claim(20) data')).rows[0].data
}
async function check(job, client = admin) {
  return (await client.query('select public.rsvp_reminder_check($1,$2) data', [job.id, job.lease])).rows[0].data
}
async function complete(job, sent = true) {
  return (await admin.query('select public.rsvp_reminder_complete($1,$2,$3) data', [job.id, job.lease, sent])).rows[0].data
}
async function invitation(f) {
  return (await admin.query('select response,attending,version from private.invitations where id=$1', [f.invite.id])).rows[0]
}
async function overdue(f) {
  await admin.query("update private.rsvp_reminders set confirmation_due_at=clock_timestamp()-interval '1 second' where invitation_id=$1", [f.invite.id])
}

test('worker exclusivo service_role; contatos sem leitura direta nem exposição no snapshot', async () => {
  for (const role of ['anon', 'authenticated']) {
    const client = await connection(role)
    try {
      await assert.rejects(claim(client), { code: '42501' })
      await assert.rejects(client.query('select * from private.rsvp_reminders'), { code: '42501' })
      for (const signature of ['public.rsvp_reminder_check(uuid,uuid)', 'public.rsvp_reminder_complete(uuid,uuid,boolean)']) {
        assert.equal((await admin.query('select has_function_privilege($1,$2,\'execute\') ok', [role, signature])).rows[0].ok, false)
      }
    } finally { await client.end() }
  }
  const service = await connection('service_role')
  try { assert.deepEqual((await claim(service)).jobs, []) } finally { await service.end() }
  const f = await fixture(); await maybe(f)
  const snapshot = (await action(f.token, 'read')).snapshot
  assert.equal(snapshot.rsvp.reminder_email_set, true)
  assert.equal(JSON.stringify(snapshot).includes('guest@example.test'), false)
  const requests = (await admin.query('select payload from private.guest_requests where invitation_id=$1', [f.invite.id])).rows
  assert.equal(JSON.stringify(requests).includes('guest@example.test'), false)
})

test('corte usa relógio SQL; maybe exige email e fecha após dez dias, yes permanece possível', async () => {
  const f = await fixture()
  assert.equal((await action(f.token, 'read')).snapshot.rsvp.maybe_allowed, true)
  await assert.rejects(action(f.token, 'rsvp', payload()))
  await assert.rejects(action(f.token, 'rsvp', payload('maybe', 1, { reminder_email: 'invalid' })))
  await maybe(f)
  assert.equal((await claim()).jobs.length, 0)
  await cut(f)
  const snapshot = (await action(f.token, 'read')).snapshot
  assert.equal(snapshot.rsvp.maybe_allowed, false)
  assert.equal(new Date(snapshot.rsvp.confirmation_due_at) - new Date(snapshot.rsvp.maybe_closes_at), 3 * 86400000)
  await assert.rejects(action(f.token, 'rsvp', payload('maybe', 2)), /RSVP_MAYBE_CLOSED/)
  await action(f.token, 'rsvp', payload('yes', 2))
  assert.equal((await invitation(f)).response, 'yes')
  assert.equal((await admin.query('select count(*)::int n from private.rsvp_reminders where invitation_id=$1', [f.invite.id])).rows[0].n, 0)
})

test('claims concorrentes concedem uma lease; confirmação repetida não envia/converte duas vezes', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  const other = await connection('service_role')
  let jobs
  try { jobs = (await Promise.all([claim(), claim(other)])).flatMap(result => result.jobs) } finally { await other.end() }
  assert.equal(jobs.length, 1)
  const job = jobs[0]
  assert.equal((await check(job)).id, job.id)
  assert.equal(await check({ ...job, lease: randomUUID() }), null)
  assert.equal(await complete({ ...job, lease: randomUUID() }), false)
  assert.equal(await complete(job), true)
  await complete(job)
  assert.equal((await claim()).jobs.length, 0)
  await overdue(f)
  assert.equal((await claim()).expired, 1)
  assert.deepEqual(await invitation(f), { response: 'no', attending: 0, version: 3 })
  assert.equal((await claim()).expired, 0)
  assert.equal((await invitation(f)).version, 3)
})

test('falha de envio não converte; retry conserva prazo/id de envio; envio atrasado tem três dias', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  const job = (await claim()).jobs[0]
  assert.ok(new Date(job.confirmation_due_at).getTime() >= Date.now() + 3 * 86400000 - 2000)
  await complete(job, false)
  await overdue(f)
  assert.equal((await claim()).expired, 0)
  assert.equal((await invitation(f)).response, 'maybe')
  await admin.query("update private.rsvp_reminders set next_attempt_at=clock_timestamp()-interval '1 second',confirmation_due_at=$2 where invitation_id=$1", [f.invite.id, job.confirmation_due_at])
  const retry = (await claim()).jobs[0]
  assert.equal(retry.id, job.id)
  assert.equal(retry.confirmation_due_at, job.confirmation_due_at)
})

test('replay maybe após ausência automática retorna snapshot atual sem ressuscitar resposta', async () => {
  const f = await fixture(); const request = await maybe(f); await cut(f)
  const job = (await claim()).jobs[0]; await complete(job); await overdue(f); await claim()
  const replay = await action(f.token, 'rsvp', request)
  assert.equal(replay.snapshot.invitation.response, 'no')
  assert.equal((await invitation(f)).version, 3)
  await assert.rejects(action(f.token, 'rsvp', { ...request, reminder_email: 'other@example.test' }), /IDEMPOTENCY_CONFLICT/)
})

test('confirmação em transação concorrente não é sobrescrita pelo worker', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  await complete((await claim()).jobs[0]); await overdue(f)
  const confirming = await connection()
  const worker = await connection('service_role')
  try {
    await confirming.query('begin')
    await action(f.token, 'rsvp', payload('yes', 2), confirming)
    const work = claim(worker)
    await confirming.query('commit')
    await work
    assert.equal((await invitation(f)).response, 'yes')
    assert.equal((await claim()).expired, 0)
  } finally { await confirming.query('rollback'); await confirming.end(); await worker.end() }
})

test('reagendamento invalida lease; revogação/exclusão eliminam contato; fechado não envia', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  const job = (await claim()).jobs[0]
  await admin.query("update public.events set starts_at=clock_timestamp()+interval '30 days',ends_at=clock_timestamp()+interval '30 days 4 hours' where id=$1", [f.event.id])
  assert.equal(await check(job), null)
  assert.equal(await complete(job), false)
  assert.equal((await claim()).jobs.length, 0)
  await admin.query("select public.organizer_invitations($1,'revoke',$2)", [f.event.id, { id: f.invite.id }])
  assert.equal((await admin.query('select count(*)::int n from private.rsvp_reminders where invitation_id=$1', [f.invite.id])).rows[0].n, 0)
  const g = await fixture(); await maybe(g); await cut(g)
  await admin.query("update public.events set status='closed' where id=$1", [g.event.id])
  assert.equal((await claim()).jobs.length, 0)
  await admin.query('select private.erase_invitation($1)', [g.invite.id])
  assert.equal((await admin.query('select count(*)::int n from private.rsvp_reminders where invitation_id=$1', [g.invite.id])).rows[0].n, 0)
})

test('aceite tardio garante três dias completos e nunca reduz prazo persistido', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  const job = (await claim()).jobs[0]
  // Simula atraso entre a primeira tentativa e o aceite; a lease permanece válida.
  await admin.query("update private.rsvp_reminders set confirmation_due_at=clock_timestamp()+interval '2 days' where invitation_id=$1", [f.invite.id])
  assert.equal(await complete(job), true)
  const result = (await admin.query(`select confirmation_due_at >= sent_at+interval '3 days' enough_time
    from private.rsvp_reminders where invitation_id=$1`, [f.invite.id])).rows[0]
  assert.equal(result.enough_time, true)
  const g = await fixture(); await maybe(g); await cut(g)
  const next = (await claim()).jobs[0]
  const future = (await admin.query("update private.rsvp_reminders set confirmation_due_at=clock_timestamp()+interval '5 days' where invitation_id=$1 returning confirmation_due_at", [g.invite.id])).rows[0].confirmation_due_at
  await complete(next)
  const saved = (await admin.query('select confirmation_due_at from private.rsvp_reminders where invitation_id=$1', [g.invite.id])).rows[0].confirmation_due_at
  assert.equal(saved.getTime(), future.getTime())
})

test('envio ambíguo não ganha nova chave nem retry depois da janela de 23 horas', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  const first = (await claim()).jobs[0]
  await admin.query(`update private.rsvp_reminders set first_attempt_at=clock_timestamp()-interval '22 hours',
    lease_until=clock_timestamp()-interval '1 minute', next_attempt_at=clock_timestamp()-interval '1 minute'
    where invitation_id=$1`, [f.invite.id])
  const retry = (await claim()).jobs[0]
  assert.equal(retry.id, first.id)
  assert.notEqual(retry.lease, first.lease)
  assert.equal(await complete(first), false)
  await admin.query(`update private.rsvp_reminders set first_attempt_at=clock_timestamp()-interval '23 hours 1 minute',
    lease_until=clock_timestamp()-interval '1 minute', next_attempt_at=clock_timestamp()-interval '1 minute',
    confirmation_due_at=clock_timestamp()-interval '1 minute' where invitation_id=$1`, [f.invite.id])
  assert.deepEqual(await claim(), { jobs: [], expired: 0, dropped: 0 })
  assert.equal((await invitation(f)).response, 'maybe')
})

test('correções: sem lembrete com menos de 3 dias; prazo limitado ao início; evento iniciado apaga o contato', async () => {
  const f = await fixture(); await maybe(f)
  await admin.query("update public.events set starts_at=clock_timestamp()+interval '2 days', ends_at=clock_timestamp()+interval '2 days 4 hours' where id=$1", [f.event.id])
  const tooLate = await claim()
  assert.deepEqual(tooLate.jobs, []); assert.equal(tooLate.dropped, 1)
  assert.equal((await admin.query('select count(*)::int n from private.rsvp_reminders')).rows[0].n, 0)
  assert.equal((await invitation(f)).response, 'maybe')

  const g = await fixture(); await maybe(g)
  await admin.query("update public.events set starts_at=clock_timestamp()+interval '3 days 1 hour', ends_at=clock_timestamp()+interval '3 days 5 hours' where id=$1", [g.event.id])
  const job = (await claim()).jobs[0]
  assert.ok(job)
  const starts = (await admin.query('select starts_at from public.events where id=$1', [g.event.id])).rows[0].starts_at
  assert.ok(new Date(job.confirmation_due_at) <= starts)
  await admin.query("update private.rsvp_reminders set lease_until=lease_until where id=$1", [job.id])
  assert.equal(await complete(job), true)
  const due = (await admin.query('select confirmation_due_at from private.rsvp_reminders where id=$1', [job.id])).rows[0].confirmation_due_at
  assert.ok(due <= starts, 'prazo nunca passa do início')
})

test('correções: recusa permanente apaga o contato; fila presa há 24 horas também', async () => {
  const f = await fixture(); await maybe(f); await cut(f)
  const job = (await claim()).jobs[0]
  assert.equal((await admin.query('select public.rsvp_reminder_reject($1,$2) data', [job.id, job.lease])).rows[0].data, true)
  assert.equal((await admin.query('select count(*)::int n from private.rsvp_reminders where invitation_id=$1', [f.invite.id])).rows[0].n, 0)
  assert.equal((await invitation(f)).response, 'maybe')
  const worker = await connection('authenticated')
  try { await assert.rejects(worker.query('select public.rsvp_reminder_reject($1,$2)', [job.id, job.lease]), /permission denied/) } finally { await worker.end() }

  const g = await fixture(); await maybe(g); await cut(g)
  await claim()
  await admin.query(`update private.rsvp_reminders set first_attempt_at=clock_timestamp()-interval '25 hours', lease_until=clock_timestamp()-interval '1 minute' where invitation_id=$1`, [g.invite.id])
  assert.equal((await claim()).dropped, 1)
})

test('correções: encerrar evento apaga contatos; hash do histórico tem sal; apóstrofo aceito', async () => {
  const f = await fixture()
  await action(f.token, 'rsvp', payload('maybe', 1, { reminder_email: "O'Brien@Example.test" }))
  assert.equal((await admin.query('select email from private.rsvp_reminders where invitation_id=$1', [f.invite.id])).rows[0].email, "o'brien@example.test")
  const stored = (await admin.query("select payload->'payload'->>'reminder_email' h from private.guest_requests where invitation_id=$1 and payload->>'action'='rsvp'", [f.invite.id])).rows[0].h
  const unsalted = (await admin.query("select encode(sha256(convert_to($1,'UTF8')),'hex') h", ["o'brien@example.test"])).rows[0].h
  assert.notEqual(stored, unsalted)
  assert.match(stored, /^[0-9a-f]{64}$/)
  await admin.query("update public.events set status='closed' where id=$1", [f.event.id])
  assert.equal((await admin.query('select count(*)::int n from private.rsvp_reminders where invitation_id=$1', [f.invite.id])).rows[0].n, 0)
})
