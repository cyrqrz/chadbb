import { backend } from '../../lib/supabase'
import type { Person } from './api'
export type GuestInvitation = { label: string; expires_at: string | null; read_only: boolean; event: { title: string; description: string; starts_at: string; address: string; instructions: string; cover_path: string | null }; people: Person[] }
let inviteToken = ''
let session = ''
let expiresAt = 0
let initialization: Promise<void> | undefined
// Chamado antes do React/Auth; fragmento não permanece na URL durante requisições.
export function captureInvitation() {
  if (window.location.pathname !== '/convite') return
  inviteToken = window.location.hash.slice(1)
  window.history.replaceState(null, '', '/convite')
}
export function clearGuest() { session = ''; expiresAt = 0 }
async function request(body: Record<string, unknown>, credential?: string) {
  if (backend.status !== 'ready') throw new Error('BACKEND_UNAVAILABLE')
  const response = await fetch(`${backend.config.url}/functions/v1/guest`, { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', apikey: backend.config.key, ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) {
    if (response.status === 401 || data.error === 'EVENT_NOT_PUBLISHED') clearGuest()
    throw new Error(data.error ?? 'UNAVAILABLE')
  }
  return data
}
export function initializeGuest() {
  // Reabrir o link na mesma aba pode mudar apenas o fragmento, sem recarregar o app.
  if (window.location.hash) {
    captureInvitation()
    clearGuest()
    initialization = undefined
  }
  if (initialization) return initialization
  const token = inviteToken
  inviteToken = ''
  initialization = (async () => {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('REOPEN_INVITATION')
    const result = await request({ action: 'exchange', token })
    session = result.session; expiresAt = new Date(result.expires_at).getTime()
  })()
  return initialization
}
export function guestExpiry() { return expiresAt }
export function hasGuestSession() { return Boolean(session) && expiresAt > Date.now() }
export async function readGuest(): Promise<GuestInvitation> {
  if (!hasGuestSession()) { clearGuest(); throw new Error('REOPEN_INVITATION') }
  return request({ action: 'read' }, session)
}
export async function updateRsvp(person: Person, response: string) {
  if (!hasGuestSession()) { clearGuest(); throw new Error('REOPEN_INVITATION') }
  return request({ action: 'rsvp', person_id: person.id, response, version: person.version }, session)
}
