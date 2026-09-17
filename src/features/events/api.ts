import { readPublicConfig } from '../../lib/config'
import { supabase } from '../../lib/supabase'
import { fromLocalDate } from './model'
import type { EventDraft, EventRecord } from './model'

export function getClient() {
  if (!supabase) throw new Error('BACKEND_UNAVAILABLE')
  return supabase
}
export const eventKeys = { all: ['events'] as const, detail: (id: string) => ['events', 'detail', id] as const }
export async function listEvents(page: number) {
  const { data, error, count } = await getClient().from('events').select('*', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id').range(page * 12, page * 12 + 11)
  if (error) throw error
  return { events: data as EventRecord[], count: count ?? 0 }
}
export async function getEvent(id: string) {
  const { data, error } = await getClient().from('events').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as EventRecord | null
}
export async function createEvent(title: string) {
  const { data, error } = await getClient().rpc('create_event', { p_title: title }).single()
  if (error) throw error
  return data as EventRecord
}
export async function saveEvent(event: EventRecord, draft: EventDraft) {
  const { data, error } = await getClient().rpc('save_event', {
    p_event_id: event.id, p_version: event.version, p_title: draft.title,
    p_public_description: draft.public_description, p_starts_at: fromLocalDate(draft.localDate),
    p_ends_at: fromLocalDate(draft.localEndDate),
    p_private_address: draft.private_address, p_private_instructions: draft.private_instructions, p_cover_path: draft.cover_path,
  }).single()
  if (error) throw error
  return data as EventRecord
}
export async function transitionEvent(event: EventRecord, status: 'published' | 'closed') {
  const { data, error } = await getClient().rpc('transition_event', { p_event_id: event.id, p_version: event.version, p_status: status }).single()
  if (error) throw error
  return data as EventRecord
}
// Edge `delete-event`: o servidor confere dono, estado (só rascunho e encerrado) e
// versão, e remove os arquivos. `storage_cleanup: 'pending'` também é sucesso.
export async function deleteEvent(event: EventRecord) {
  const config = readPublicConfig(import.meta.env)
  if (config.status !== 'ready') throw new Error('BACKEND_UNAVAILABLE')
  const { data: { session } } = await getClient().auth.getSession()
  if (!session) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 })
  const response = await fetch(`${config.config.url}/functions/v1/delete-event`, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', apikey: config.config.key, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ event_id: event.id, version: event.version }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(data?.error ?? 'TEMPORARILY_UNAVAILABLE'), { status: response.status })
}
export function coverUrl(path: string) { return getClient().storage.from('event-public').getPublicUrl(path).data.publicUrl }
export async function uploadCover(event: EventRecord, file: File) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const path = `${event.owner_id}/${event.id}/${crypto.randomUUID()}.${extension}`
  const { error } = await getClient().storage.from('event-public').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}
