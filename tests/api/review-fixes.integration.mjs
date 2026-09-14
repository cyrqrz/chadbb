import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { localConfig, localDatabase, fixture, edge } from '../support/local.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
let config, db
const fixtures = []
before(async () => { config = localConfig(); db = await localDatabase(config) })
after(async () => { for (const f of fixtures) await f.cleanup(); await db?.end() })
async function created() { const f = await fixture(config); fixtures.push(f); return f }
const rates = async () => new Map((await db.query('select key_hash, requests from private.guest_rate')).rows.map(r => [r.key_hash, r.requests]))

test('revisão 1: X-Forwarded-For forjado não escolhe a cota de IP', async () => {
  const token = randomBytes(32).toString('hex')
  const forged = ['203.0.113.99', '198.51.100.23']
  try {
    for (const address of forged) {
      assert.equal((await edge(config, token, 'exchange', {}, { 'X-Forwarded-For': address })).status, 401)
    }
    const used = await db.query('select count(*) n from private.guest_rate where key_hash = any($1::text[])', [forged.map(a => hash(`ip:${a}`))])
    assert.equal(used.rows[0].n, '0', 'nenhuma cota criada para o endereço enviado pelo cliente')
  } finally {
    await db.query('delete from private.guest_rate where key_hash = any($1::text[])', [[hash(`token:${token}`), ...forged.map(a => hash(`ip:${a}`))]])
  }
})

test('revisão 1: pedido recusado pela cota de IP não consome a cota global', async () => {
  const probe = randomBytes(32).toString('hex')
  const before = await rates()
  assert.equal((await edge(config, probe, 'exchange')).status, 401)
  const changed = [...(await rates())].filter(([key, requests]) => before.get(key) !== requests && ![hash('global'), hash(`token:${probe}`)].includes(key))
  assert.equal(changed.length, 1, 'uma única cota de IP em uso')
  const ipKey = changed[0][0]
  const token = randomBytes(32).toString('hex')
  try {
    let blocked = false
    for (let attempt = 0; attempt < 3 && !blocked; attempt++) {
      await db.query("update private.guest_rate set requests=1200, window_start=date_trunc('minute', clock_timestamp()) where key_hash=$1", [ipKey])
      const globalBefore = (await rates()).get(hash('global'))
      const response = await edge(config, token, 'exchange')
      if (response.status !== 429) continue
      blocked = true
      assert.equal((await rates()).get(hash('global')), globalBefore, 'global intacta')
      assert.equal((await rates()).get(hash(`token:${token}`)), undefined, 'cota da credencial não consultada')
    }
    assert.ok(blocked, 'IP bloqueado')
  } finally {
    await db.query('delete from private.guest_rate where key_hash = any($1::text[])', [[ipKey, hash(`token:${probe}`), hash(`token:${token}`)]])
  }
})

test('revisão 3: Edge devolve PURCHASE_ALREADY_DECLARED e preserva a compra informada', async () => {
  const f = await created()
  const access = (await edge(config, f.invite.token, 'exchange')).data
  const send = (action, payload) => edge(config, access.session_token, action, { ...payload, request_id: randomUUID() })
  const item = access.snapshot.items.find(i => i.diaper_size === 'P')
  assert.equal((await send('reserve', { item_id: item.id, quantity: 2, version: null })).status, 200)
  assert.equal((await send('purchase', { item_id: item.id, version: 1 })).status, 200)
  const change = await send('reserve', { item_id: item.id, quantity: 3, version: 2 })
  assert.equal(change.status, 409); assert.equal(change.data.error, 'PURCHASE_ALREADY_DECLARED')
  const dashboard = await f.call('organizer_invitations', { p_event_id: f.event.id })
  assert.deepEqual(dashboard.reservations.map(r => [r.status, r.quantity]), [['purchase_declared', 2]])
})

test('revisão 6: falha do servidor vira 503 retentável; dado malformado continua 400', async () => {
  const f = await created()
  const access = (await edge(config, f.invite.token, 'exchange')).data
  const malformed = await edge(config, access.session_token, 'reserve', { item_id: 'nao-e-uuid', quantity: 1, version: null, request_id: randomUUID() })
  assert.equal(malformed.status, 400); assert.equal(malformed.data.error, 'INVALID_PAYLOAD')
  try {
    await db.query('revoke execute on function public.guest_action(text,text,jsonb) from service_role')
    const failed = await edge(config, access.session_token, 'read')
    assert.equal(failed.status, 503); assert.equal(failed.data.error, 'TEMPORARILY_UNAVAILABLE')
  } finally {
    await db.query('grant execute on function public.guest_action(text,text,jsonb) to service_role')
  }
  assert.equal((await edge(config, access.session_token, 'read')).status, 200)
})
