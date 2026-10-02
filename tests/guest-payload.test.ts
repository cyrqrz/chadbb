import { describe, expect, it } from 'vitest'
import { cleanPayload } from '../supabase/functions/guest/payload'

const request_id = '7d3f1c2e-1111-4a5b-8c9d-0123456789ab'
const item_id = '0b5c9a10-2222-4a5b-8c9d-0123456789ab'

describe('payload da Edge guest', () => {
  it('mantém só as chaves que o front envia em cada ação', () => {
    expect(cleanPayload('reserve', { request_id, item_id, quantity: 2, version: null, lixo: 'x'.repeat(200), __proto__: { a: 1 } }))
      .toEqual({ request_id, item_id, quantity: 2, version: null })
    expect(cleanPayload('rsvp', { request_id, response: 'maybe', attending: 0, version: 3, reminder_email: 'a@b.test', item_id }))
      .toEqual({ request_id, response: 'maybe', attending: 0, version: 3, reminder_email: 'a@b.test' })
    expect(cleanPayload('swap', { request_id, item_id, from_item_id: item_id, version: 1, destination_version: null }))
      .toEqual({ request_id, item_id, from_item_id: item_id, version: 1, destination_version: null })
    expect(cleanPayload('read', { request_id })).toEqual({})
    expect(cleanPayload('exchange', undefined)).toEqual({})
  })
  it('recusa payload que não é objeto e valores compostos ou longos', () => {
    for (const payload of ['texto', 5, [request_id]]) expect(cleanPayload('reserve', payload)).toBeNull()
    expect(cleanPayload('reserve', { request_id, item_id: { $ne: null } })).toBeNull()
    expect(cleanPayload('reserve', { request_id, quantity: [1] })).toBeNull()
    expect(cleanPayload('rsvp', { request_id, reminder_email: 'x'.repeat(255) })).toBeNull()
    expect(cleanPayload('reserve', { request_id, quantity: Number.POSITIVE_INFINITY })).toBeNull()
  })
})
