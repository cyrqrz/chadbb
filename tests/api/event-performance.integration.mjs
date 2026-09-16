import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { fixture, localConfig, localDatabase } from '../support/local.mjs'

test('T-B5: falha de preparação limpa dados próprios e preserva evento e contador alheios', { timeout: 150000 }, async () => {
  const config = localConfig(), sentinel = await fixture(config)
  const hash = createHash('sha256').update(`token:sentinel-${randomUUID()}`).digest('hex')
  let db
  try {
    db = await localDatabase(config)
    await db.query('insert into private.guest_rate(key_hash,window_start,requests) values($1,clock_timestamp(),7)', [hash])
    const before = await sentinel.call('organizer_invitations', { p_event_id: sentinel.event.id })
    const count = async () => (await db.query("select count(*)::int n from auth.users where email like 'perf-%@example.test'")).rows[0].n
    const baseline = await count()
    const result = spawnSync(process.execPath, ['tests/load/event-performance.mjs', '--local', '--fail-after-setup'], { encoding: 'utf8', timeout: 120000 })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /FAIL: falha injetada após preparação/)
    assert.match(result.stdout, /PASS: limpeza restrita;/)
    assert.equal(await count(), baseline)
    assert.deepEqual(await sentinel.call('organizer_invitations', { p_event_id: sentinel.event.id }), before)
    assert.equal((await db.query('select requests from private.guest_rate where key_hash=$1', [hash])).rows[0]?.requests, 7)
  } finally {
    if (db) await db.query('delete from private.guest_rate where key_hash=$1', [hash])
    await db?.end(); await sentinel.cleanup()
  }
})

test('T-B5: SIGTERM após criar usuário permite limpeza antes de sair', { timeout: 45000 }, async () => {
  const db = await localDatabase(localConfig())
  const count = async () => (await db.query("select count(*)::int n from auth.users where email like 'perf-%@example.test'")).rows[0].n
  try {
    const before = await count()
    const result = spawnSync(process.execPath, ['tests/load/event-performance.mjs', '--local', '--interrupt-after-user'], { encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /FAIL: interrompido/)
    assert.match(result.stdout, /PASS: limpeza restrita;/)
    assert.equal(await count(), before)
  } finally { await db.end() }
})

test('T-B5: dry-run não executa ensaio e ref incorreto é recusado', () => {
  const dry = spawnSync(process.execPath, ['tests/load/event-performance.mjs'], { encoding: 'utf8', timeout: 15000 })
  assert.equal(dry.status, 0); assert.equal(JSON.parse(dry.stdout).max_guest_posts, 420)
  const denied = spawnSync(process.execPath, ['tests/load/event-performance.mjs', '--remote'],
    { encoding: 'utf8', timeout: 15000, env: { ...process.env, CHADBB_PERF_REF: 'invalid' } })
  assert.equal(denied.status, 1); assert.match(denied.stderr, /Nada executado/)
})
