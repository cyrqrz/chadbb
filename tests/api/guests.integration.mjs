import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localConfig, fixture, edge } from '../support/local.mjs'
let config, f, access
before(async () => { config = localConfig(); f = await fixture(config) })
after(async () => { await f?.cleanup() })
test('Edge real: troca de convite, no-store, projeção privada e origem permitida', async () => {
  const response = await edge(config, f.invite.token, 'exchange', {}, { Origin: 'http://localhost:5173' })
  assert.equal(response.status, 200, JSON.stringify(response.data)); assert.equal(response.cache, 'no-store')
  access = response.data
  assert.equal(access.snapshot.items.length, 27)
  assert.equal(access.snapshot.invitation.capacity, 3)
  assert.equal('owner_id' in access.snapshot.event, false)
  assert.equal('token_hash' in access.snapshot.invitation, false)
  assert.equal((await edge(config, f.invite.token, 'exchange', {}, { Origin: 'https://untrusted.example' })).status, 403)
  assert.equal((await edge(config, 'a'.repeat(64), 'read')).status, 401)
})
test('Edge real: presença, vários pacotes, mimos livres e painel atualizado', async () => {
  const send = (action, payload) => edge(config, access.session_token, action, { ...payload, request_id: randomUUID() })
  const rsvp = await send('rsvp', { response: 'yes', attending: 3, version: 1 })
  assert.equal(rsvp.status, 200)
  const item = access.snapshot.items.find(i => i.diaper_size === 'P')
  const request = { item_id: item.id, quantity: 3, version: null, request_id: randomUUID() }
  assert.equal((await edge(config, access.session_token, 'reserve', request)).status, 200)
  const replay = await edge(config, access.session_token, 'reserve', request)
  assert.equal(replay.data.snapshot.items.find(i => i.id === item.id).committed, 3)
  const treat = access.snapshot.items.find(i => i.title === 'Mamadeira Anti Cólica')
  const gift = await send('reserve', { item_id: treat.id, quantity: 5, version: null })
  assert.equal(gift.status, 200)
  assert.equal(gift.data.snapshot.items.find(i => i.id === treat.id).limit, null)
  assert.equal(gift.data.snapshot.items.find(i => i.id === item.id).committed, 3)
  const dashboard = await f.call('organizer_invitations', { p_event_id: f.event.id })
  assert.equal(dashboard.invitations[0].attending, 3)
  assert.equal(dashboard.reservations.length, 2)
  const overflow = await send('reserve', { item_id: item.id, quantity: 7, version: 1 })
  assert.equal(overflow.status, 409); assert.equal(overflow.data.error, 'INSUFFICIENT_QUANTITY')
})
test('Edge real: revogação bloqueia sessão existente e rotação preserva resposta', async () => {
  await f.call('organizer_invitations', { p_event_id: f.event.id, p_action: 'revoke', p_payload: { id: f.invite.id } })
  assert.equal((await edge(config, access.session_token, 'read')).status, 401)
  const rotated = await f.call('organizer_invitations', { p_event_id: f.event.id, p_action: 'rotate', p_payload: { id: f.invite.id } })
  const fresh = await edge(config, rotated.token, 'exchange')
  assert.equal(fresh.status, 200); assert.equal(fresh.data.snapshot.invitation.attending, 3)
  assert.equal((await edge(config, f.invite.token, 'exchange')).status, 401)
})
test('Edge real: erros de domínio RSVP e teto de reserva chegam sem erro genérico', async () => {
  const rotated = await f.call('organizer_invitations', { p_event_id: f.event.id, p_action: 'rotate', p_payload: { id: f.invite.id } })
  const current = (await edge(config, rotated.token, 'exchange')).data
  for (const [payload, code] of [
    [{ response: 'pending', attending: 0 }, 'RSVP_INVALID_RESPONSE'],
    [{ response: 'yes' }, 'RSVP_INVALID_RESPONSE'],
    [{ response: 'yes', attending: 4 }, 'ATTENDING_ABOVE_CAPACITY'],
  ]) {
    const response = await edge(config, current.session_token, 'rsvp', { ...payload, version: current.snapshot.invitation.version, request_id: randomUUID() })
    assert.equal(response.status, 409); assert.equal(response.data.error, code)
  }
  const item = current.snapshot.items.find(i => i.category === 'mimo' && !i.own)
  const oversized = await edge(config, current.session_token, 'reserve', { item_id: item.id, quantity: 1001, version: null, request_id: randomUUID() })
  assert.equal(oversized.status, 409); assert.equal(oversized.data.error, 'INVALID_GIFT_QUANTITY')
})
