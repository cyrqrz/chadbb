import { describe, expect, it } from 'vitest'
import { availableOf, panelSummary } from '../src/features/guests/api'
import type { Invitation } from '../src/features/guests/api'

const inv = (fields: Partial<Invitation>): Invitation => ({ id: 'x', name: 'Fictício', kind: 'family', capacity: 4, response: 'pending',
  attending: 0, version: 1, revoked: false, expires_at: '2035-01-01T00:00:00Z', ...fields })

describe('panelSummary', () => {
  it('prefere o resumo enviado pelo servidor', () => {
    const summary = { invitations: { total: 1, answered: 0, yes: 0, no: 0, maybe: 0, pending: 1, revoked: 0 }, people_confirmed: 9 }
    expect(panelSummary({ invitations: [inv({ response: 'yes', attending: 2 })], summary })).toBe(summary)
  })
  it('deriva o resumo enquanto o servidor não o envia', () => {
    expect(panelSummary({ invitations: [inv({ response: 'yes', attending: 2 }), inv({ response: 'no' }), inv({ revoked: true })] })).toEqual({
      invitations: { total: 3, answered: 2, yes: 1, no: 1, maybe: 0, pending: 1, revoked: 1 }, people_confirmed: 2,
    })
  })
})

describe('availableOf', () => {
  it('usa o saldo do servidor, inclusive zero e nulo', () => {
    expect(availableOf({ limit: 6, committed: 1, available: 0 })).toBe(0)
    expect(availableOf({ limit: null, committed: 3, available: null })).toBeNull()
  })
  it('deriva o saldo sem ficar negativo e sem limite para mimos', () => {
    expect(availableOf({ limit: 6, committed: 2 })).toBe(4)
    expect(availableOf({ limit: 6, committed: 8 })).toBe(0)
    expect(availableOf({ limit: null, committed: 3 })).toBeNull()
  })
})
