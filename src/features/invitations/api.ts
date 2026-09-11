import { getClient } from '../events/api'

export type ResponseValue = 'pending' | 'yes' | 'no' | 'maybe'
export const responseLabels: Record<ResponseValue, string> = { pending: 'Sem resposta', yes: 'Sim', no: 'Não', maybe: 'Talvez' }
export type Person = { id: string; name: string; response: ResponseValue; version: number }
export type Invitation = { id: string; label: string; expires_at: string | null; revoked_at: string | null; invitation_people: { id: string; name: string; position: number; rsvps: { response: ResponseValue; version: number } }[] }
export const invitationKey = (id: string) => ['invitations', id] as const
export async function listInvitations(eventId: string, page: number) {
  const { data, error, count } = await getClient().from('invitations')
    .select('id,label,expires_at,revoked_at,invitation_people(id,name,position,rsvps(response,version))', { count: 'exact' })
    .eq('event_id', eventId).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19)
  if (error) throw error
  return { invitations: data as unknown as Invitation[], count: count ?? 0 }
}
export async function createInvitation(eventId: string, label: string, names: string[], expires: string | null) {
  const { data, error } = await getClient().rpc('create_family_invitation', { p_event_id: eventId, p_label: label, p_names: names, p_expires_at: expires })
  if (error) throw error
  return data as { id: string; token: string; expires_at: string | null }
}
export async function revokeInvitation(eventId: string, invitationId: string) {
  const { error } = await getClient().rpc('revoke_family_invitation', { p_event_id: eventId, p_invitation_id: invitationId })
  if (error) throw error
}
