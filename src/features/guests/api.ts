import { readPublicConfig } from '../../lib/config'
import { getClient } from '../events/api'
import type { Category, DiaperSize } from '../gifts/model'
export type ResponseChoice = 'pending' | 'yes' | 'no' | 'maybe'
export type Reservation = { id: string; quantity: number; version: number; status: 'reserved' | 'purchase_declared' | 'cancelled' }
export type GuestItem = { id: string; title: string; description: string; category: Category; diaper_size: DiaperSize | null; limit: number | null; committed: number; own: Reservation | null }
export type Snapshot = {
  invitation: { name: string; kind: 'individual' | 'family'; capacity: number; response: ResponseChoice; attending: number; version: number }
  event: { id: string; title: string; description: string; starts_at: string; address: string; instructions: string; cover_path: string | null; status: string }
  items: GuestItem[]
}
export type Invitation = Snapshot['invitation'] & { id: string; revoked: boolean; expires_at: string }
export type Dashboard = { invitations: Invitation[]; items: GuestItem[]; reservations: { name: string; title: string; category: Category; diaper_size: DiaperSize | null; quantity: number; status: string }[] }
export const responseLabels: Record<ResponseChoice, string> = { pending: 'Sem resposta', yes: 'Vai participar', no: 'Não poderá ir', maybe: 'Talvez' }
export async function invitations(eventId: string, action = 'list', payload: Record<string, unknown> = {}) {
  const { data, error } = await getClient().rpc('organizer_invitations', { p_event_id: eventId, p_action: action, p_payload: payload })
  if (error) throw error
  return data
}
export class GuestError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function guestCall(token: string, action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<{ snapshot: Snapshot; session_token?: string }> {
  const config = readPublicConfig(import.meta.env)
  if (config.status !== 'ready') throw new Error('BACKEND_UNAVAILABLE')
  const response = await fetch(`${config.config.url}/functions/v1/guest`, {
    method: 'POST', signal, cache: 'no-store', headers: { 'Content-Type': 'application/json', apikey: config.config.key, ...(action === 'exchange' ? {} : { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ action, ...(action === 'exchange' ? { token } : { payload }) }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) throw new GuestError(data?.error ?? 'TEMPORARILY_UNAVAILABLE', data === null && response.status < 500 ? 503 : response.status)
  return data
}
export function guestMessage(error: unknown) {
  const messages: Record<string, string> = {
    GUEST_SESSION_INVALID: 'Este acesso expirou ou foi revogado. Reabra o convite original ou procure a organização.',
    INSUFFICIENT_QUANTITY: 'Essa quantidade não está mais disponível. Consulte o saldo atualizado e escolha novamente.',
    RESERVATION_VERSION_CONFLICT: 'Sua escolha mudou em outra sessão. Revise os dados atualizados antes de salvar.',
    RESPONSE_VERSION_CONFLICT: 'Sua resposta mudou em outra sessão. Revise os dados antes de confirmar.',
    EVENT_CLOSED: 'O evento está encerrado. Novas confirmações e reservas não estão disponíveis.',
    RATE_LIMITED: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
    RSVP_INVALID_RESPONSE: 'Escolha uma resposta e informe a quantidade de pessoas que vão participar.',
    ATTENDING_ABOVE_CAPACITY: 'A quantidade de pessoas ultrapassa o limite deste convite.',
    INVALID_PAYLOAD: 'Confira os campos e a quantidade de pessoas permitida no convite.',
    INVALID_GIFT_QUANTITY: 'Informe uma quantidade inteira entre 1 e 1.000.',
    PURCHASE_ALREADY_DECLARED: 'Você já informou a compra deste presente. Para mudar, cancele a escolha e escolha de novo.',
    TEMPORARILY_UNAVAILABLE: 'O serviço está temporariamente indisponível. Sua tentativa foi guardada: tente novamente em instantes.',
  }
  return error instanceof Error && messages[error.message] || 'Não foi possível confirmar a operação. Confira a conexão e tente novamente.'
}
