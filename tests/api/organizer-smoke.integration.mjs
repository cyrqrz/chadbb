import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fixture, localConfig, localDatabase } from '../support/local.mjs'

test('smoke isolado: falha intermediária limpa somente seus dados e preserva outro evento', { timeout: 90000 }, async () => {
  const config = localConfig()
  const sentinel = await fixture(config)
  let db
  try {
    db = await localDatabase(config)
    const before = await sentinel.call('organizer_invitations', { p_event_id: sentinel.event.id })
    const count = async () => (await db.query("select count(*)::int n from auth.users where email like 'smoke-organizer-%@example.test'")).rows[0].n
    const baseline = await count()
    const result = spawnSync(process.execPath, ['tests/remote/organizer-smoke.mjs', '--local', '--fail-after-list'],
      { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /FAIL: falha injetada após lista/)
    assert.match(result.stdout, /PASS: limpeza restrita confirmada — users=0 events=0 items=0/)
    assert.equal(await count(), baseline)
    assert.deepEqual(await sentinel.call('organizer_invitations', { p_event_id: sentinel.event.id }), before)
    const actual = await sentinel.owner.from('events').select('*').eq('id', sentinel.event.id).single()
    assert.equal(actual.error, null); assert.deepEqual(actual.data, sentinel.event)
  } finally { await db?.end(); await sentinel.cleanup() }
})

test('smoke isolado: padrão é dry-run e remoto sem ref é recusado', () => {
  const dry = spawnSync(process.execPath, ['tests/remote/organizer-smoke.mjs'], { encoding: 'utf8', timeout: 10000 })
  assert.equal(dry.status, 0)
  assert.match(JSON.parse(dry.stdout).mode, /sem conexões/)
  const denied = spawnSync(process.execPath, ['tests/remote/organizer-smoke.mjs', '--remote'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, CHADBB_SMOKE_REF: 'invalid' } })
  assert.equal(denied.status, 1)
  assert.match(denied.stderr, /nada executado/)
})
