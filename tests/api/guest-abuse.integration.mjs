import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { localConfig, localDatabase } from '../support/local.mjs'
let config
before(() => { config = localConfig() })
async function call(body, { origin = 'http://localhost:5173', method = 'POST', contentType = 'application/json', credential } = {}) {
  const response = await fetch(`${config.API_URL}/functions/v1/guest`, {
    // Casos rejeitados antes de ler o body não compartilham conexão HTTP.
    method, headers: { Connection: 'close', Origin: origin, 'Content-Type': contentType, apikey: config.PUBLISHABLE_KEY,
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
  const content = await response.text()
  return { status: response.status, headers: response.headers, json: async () => JSON.parse(content) }
}
test('resgatado da main: preflight, origem e método', async () => {
  const preflight = await call(undefined, { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)
  // Kong local adiciona CORS global; a barreira de origem é o POST 403 abaixo.
  assert.ok(['*', 'http://localhost:5173'].includes(preflight.headers.get('access-control-allow-origin')))
  const denied = await call({ action: 'read' }, { origin: 'https://evil.example' })
  assert.equal(denied.status, 403); assert.equal((await denied.json()).error, 'ORIGIN_DENIED')
  assert.equal(denied.headers.get('cache-control'), 'no-store')
  assert.equal((await call(undefined, { method: 'GET' })).status, 405)
})
test('resgatado da main: tipo, JSON, tamanho em bytes e credencial inválidos', async () => {
  assert.equal((await call({ action: 'read' }, { contentType: 'text/plain' })).status, 415)
  assert.equal((await call('{')).status, 400)
  for (const padding of ['x'.repeat(16385), 'á'.repeat(8193)]) {
    const response = await call({ action: 'read', padding })
    assert.equal(response.status, 413); assert.equal((await response.json()).error, 'INVALID_PAYLOAD')
  }
  assert.equal((await call({ action: 'read' }, { credential: 'invalido' })).status, 401)
})
test('limite por IP persiste e bloqueia mesmo trocando a credencial', async () => {
  const db = await localDatabase(config)
  const token = randomBytes(32).toString('hex')
  const hash = value => createHash('sha256').update(value).digest('hex')
  let ipHash
  try {
    // Descobre apenas o hash da origem efetivamente fornecida pelo gateway local.
    // Pré-carrega a fronteira para não disparar 1200 requisições nem depender da duração do minuto.
    const before = new Map((await db.query('select * from private.guest_rate')).rows.map(r => [r.key_hash, r.requests]))
    assert.equal((await call({ action: 'exchange', token })).status, 401)
    const changed = (await db.query('select * from private.guest_rate')).rows.filter(r =>
      ![hash('global'), hash(`token:${token}`)].includes(r.key_hash) && before.get(r.key_hash) !== r.requests)
    assert.equal(changed.length, 1, 'uma única cota de IP foi incrementada')
    ipHash = changed[0].key_hash
    // Se cruzar a fronteira do minuto, a tentativa seguinte volta a preparar a janela.
    let blocked = false
    for (let attempt = 0; attempt < 3; attempt++) {
      await db.query("update private.guest_rate set requests=1200,window_start=date_trunc('minute',clock_timestamp()) where key_hash=$1", [ipHash])
      const response = await call({ action: 'exchange', token: randomBytes(32).toString('hex') })
      if (response.status === 429) {
        assert.equal((await response.json()).error, 'RATE_LIMITED'); blocked = true; break
      }
      assert.equal(response.status, 401)
    }
    assert.ok(blocked, 'IP bloqueado com nova credencial')
    const row = (await db.query('select requests from private.guest_rate where key_hash=$1', [ipHash])).rows[0]
    assert.equal(row.requests, 1201)
  } finally {
    if (ipHash) await db.query('delete from private.guest_rate where key_hash=$1', [ipHash])
    await db.query('delete from private.guest_rate where key_hash=$1', [hash(`token:${token}`)])
    await db.end()
  }
})
