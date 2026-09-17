export type EventStatus = 'draft' | 'published' | 'closed'
export type EventRecord = {
  id: string; owner_id: string; type: 'baby_shower'; status: EventStatus
  title: string; public_description: string; starts_at: string | null; ends_at: string | null
  private_address: string; private_instructions: string; cover_path: string | null
  personal_data_purged_at: string | null
  version: number; created_at: string; updated_at: string
}
export type EventDraft = Pick<EventRecord, 'title' | 'public_description' | 'private_address' | 'private_instructions' | 'cover_path'> & { localDate: string; localEndDate: string }
export const statusLabels: Record<EventStatus, string> = { draft: 'Rascunho', published: 'Publicado', closed: 'Encerrado' }

// O id do evento vem do endereço, que qualquer um pode digitar ou colar errado.
// Um texto que não é uuid faz o Postgres responder 400, e a tela acaba culpando
// a conexão do convidado; aqui isso vira "evento não encontrado", que é a verdade.
export const isEventId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

// Início e término são sempre digitados e exibidos no horário de Brasília,
// independentemente do navegador. O prazo de retenção é calculado só no banco.
export const EVENT_TIME_ZONE = 'America/Sao_Paulo'
const zoneFormat = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function wallClock(time: number) {
  const p = Object.fromEntries(zoneFormat.formatToParts(new Date(time)).map(part => [part.type, part.value]))
  return { text: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, utc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) }
}
export function toLocalDate(value: string | null) {
  return value ? wallClock(new Date(value).getTime()).text : ''
}
// Só apresentação (“faltam N dias”): dias de calendário no horário de Brasília.
export function daysUntil(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const day = (time: number) => { const { text } = wallClock(time); return Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10)) }
  return Math.round((day(new Date(value).getTime()) - day(now)) / 86_400_000)
}
export function fromLocalDate(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  let time = wall
  // Duas correções cobrem mudança de offset entre o palpite e o horário real.
  for (let i = 0; i < 2; i++) time += wall - wallClock(time).utc
  return wallClock(time).text === local ? new Date(time).toISOString() : null
}
export function toDraft(event: EventRecord): EventDraft {
  return { title: event.title, public_description: event.public_description, private_address: event.private_address,
    private_instructions: event.private_instructions, cover_path: event.cover_path, localDate: toLocalDate(event.starts_at), localEndDate: toLocalDate(event.ends_at) }
}
export function validateDraft(draft: EventDraft, published = false, now = Date.now()): string | null {
  if (draft.title.length > 120 || draft.public_description.length > 2000 || draft.private_address.length > 500 || draft.private_instructions.length > 2000) return 'Revise o tamanho dos campos.'
  const parse = (local: string) => local ? Date.parse(fromLocalDate(local) ?? '') : null
  const time = parse(draft.localDate)
  const end = parse(draft.localEndDate)
  if ((time !== null && !Number.isFinite(time)) || (end !== null && !Number.isFinite(end))) return 'Informe uma data válida.'
  if (end !== null && (time === null || end <= time)) return 'O término deve ser depois do início.'
  if (published && (!draft.title.trim() || time === null || time <= now || end === null)) return 'Para publicar, informe um título, uma data futura e o término.'
  return null
}
export function validateImage(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use uma imagem JPEG, PNG ou WebP.'
  if (!file.size || file.size > 5 * 1024 * 1024) return 'A imagem deve ter até 5 MB e não pode estar vazia.'
  return null
}
