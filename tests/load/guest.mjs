import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { localConfig, fixture, edge } from '../support/local.mjs'
// Dados fictícios e serviços locais, protegidos pelas validações do helper.
const config = localConfig()
const f = await fixture(config)
const samples = []
try {
  const guests = await Promise.all(Array.from({ length: 50 }, async (_, index) => {
    const invite = index === 0 ? f.invite : await f.call('organizer_invitations', {
      p_event_id: f.event.id, p_action: 'create', p_payload: { name: `Carga ${index}`, kind: 'individual', capacity: 1 },
    })
    const access = await edge(config, invite.token, 'exchange')
    assert.equal(access.status, 200)
    const token = access.data.session_token
    const item = access.data.snapshot.items.find(i => i.category === 'mimo')
    const reserved = await edge(config, token, 'reserve', { item_id: item.id, quantity: 1, version: null, request_id: randomUUID() })
    assert.equal(reserved.status, 200)
    return { token, item: item.id, version: 1 }
  }))
  // Cinco ondas de 50 clientes em uma rede, consultando a cada cinco segundos.
  for (let round = 0; round < 5; round++) {
    const started = performance.now()
    await Promise.all(guests.map(async (guest, index) => {
      const write = index % 10 === 0
      const before = performance.now()
      const response = await edge(config, guest.token, write ? 'reserve' : 'read', write ? {
        item_id: guest.item, quantity: round + 2, version: guest.version, request_id: randomUUID(),
      } : {})
      samples.push({ action: write ? 'reserve' : 'read', ms: performance.now() - before })
      assert.equal(response.status, 200)
      if (write) guest.version++
    }))
    if (round < 4) await new Promise(resolve => setTimeout(resolve, Math.max(0, 5000 - (performance.now() - started))))
  }
  function stats(values) {
    const sorted = values.map(s => s.ms).sort((a, b) => a - b)
    return { requests: sorted.length, p50_ms: Math.round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
      p95_ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]), max_ms: Math.round(sorted.at(-1)) }
  }
  console.log(JSON.stringify({ scope: 'local, 50 convidados, 27 itens, 50 reservas, 5 ondas/5s',
    total: stats(samples), read: stats(samples.filter(s => s.action === 'read')), reserve: stats(samples.filter(s => s.action === 'reserve')) }, null, 2))
} finally { await f.cleanup() }
