import { readPublicConfig } from '../../lib/config'
import { supabase } from '../../lib/supabase'
import { fromLocalDate, isEventId } from './model'
import type { EventDraft, EventRecord, SetupStep } from './model'

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
  if (!isEventId(id)) return null
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
export async function setEventStep(event: EventRecord, step: SetupStep, done: boolean) {
  const { data, error } = await getClient().rpc('set_event_step', { p_event_id: event.id, p_version: event.version, p_step: step, p_done: done }).single()
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
// Prévia do link do convite (fase 2): a arte é desenhada no navegador e guardada na pasta
// do evento no bucket público, com nome aleatório (como a capa); o banco guarda qual é a
// atual e devolve a anterior, que é apagada aqui. Falhar não atrapalha salvar/publicar:
// sem arte, o link sai com a prévia genérica.
export async function refreshEventPreview(event: EventRecord) {
  if (event.status === 'closed') return
  const { drawPreviewArt } = await import('./previewArt')
  const art = await drawPreviewArt({ title: event.title, startsAt: event.starts_at, cover: event.cover_path ? coverUrl(event.cover_path) : null })
  const path = `${event.owner_id}/${event.id}/preview-${crypto.randomUUID()}.jpg`
  const storage = getClient().storage.from('event-public')
  const upload = await storage.upload(path, art, { contentType: 'image/jpeg', upsert: false })
  if (upload.error) throw upload.error
  const { data: old, error } = await getClient().rpc('set_event_preview', { p_event_id: event.id, p_path: path })
  if (error) { await storage.remove([path]); throw error }
  if (old) await storage.remove([old as string])
}
// Evento publicado sem arte (ex.: publicado antes da fase 2): gera uma vez por sessão.
const ensured = new Set<string>()
export async function ensureEventPreview(event: EventRecord) {
  if (event.status !== 'published' || ensured.has(event.id)) return
  ensured.add(event.id)
  const { data, error } = await getClient().rpc('public_event_preview', { p_event_id: event.id })
  if (error) { ensured.delete(event.id); throw error }
  if (!(data as { image_path: string | null }[])[0]?.image_path) await refreshEventPreview(event)
}
export function coverUrl(path: string) { return getClient().storage.from('event-public').getPublicUrl(path).data.publicUrl }
export async function uploadCover(event: EventRecord, file: File) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const path = `${event.owner_id}/${event.id}/${crypto.randomUUID()}.${extension}`
  const { error } = await getClient().storage.from('event-public').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}
