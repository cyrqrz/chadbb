export type EventStatus = 'draft' | 'published' | 'closed'
export type EventRecord = {
  id: string; owner_id: string; type: 'baby_shower'; status: EventStatus
  title: string; public_description: string; starts_at: string | null
  private_address: string; private_instructions: string; cover_path: string | null
  version: number; created_at: string; updated_at: string
}
export type EventDraft = Pick<EventRecord, 'title' | 'public_description' | 'private_address' | 'private_instructions' | 'cover_path'> & { localDate: string }
export const statusLabels: Record<EventStatus, string> = { draft: 'Rascunho', published: 'Publicado', closed: 'Encerrado' }

export function toLocalDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function toDraft(event: EventRecord): EventDraft {
  return { title: event.title, public_description: event.public_description, private_address: event.private_address,
    private_instructions: event.private_instructions, cover_path: event.cover_path, localDate: toLocalDate(event.starts_at) }
}
export function validateDraft(draft: EventDraft, published = false, now = Date.now()): string | null {
  if (draft.title.length > 120 || draft.public_description.length > 2000 || draft.private_address.length > 500 || draft.private_instructions.length > 2000) return 'Revise o tamanho dos campos.'
  const time = draft.localDate ? new Date(draft.localDate).getTime() : null
  if (time !== null && !Number.isFinite(time)) return 'Informe uma data válida.'
  if (published && (!draft.title.trim() || time === null || time <= now)) return 'Para publicar, informe um título e uma data futura.'
  return null
}
export function validateImage(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use uma imagem JPEG, PNG ou WebP.'
  if (!file.size || file.size > 5 * 1024 * 1024) return 'A imagem deve ter até 5 MB e não pode estar vazia.'
  return null
}
