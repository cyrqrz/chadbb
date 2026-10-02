// Link do convite com prévia do próprio convite (desde 02/10): `/c/<evento>/<preview_id>#token`.
// O preview_id é público e não é credencial: `public_invitation_preview` devolve o nome do
// convite, os dados públicos do evento e a arte do convite (ou a do evento), só de convite
// válido de evento publicado. Endereço, respostas e presentes nunca saem daqui.
import { invitePage, param, uuid } from '../../../src/lib/invitePage'
import type { InviteEnv } from '../../../src/lib/invitePage'

type Context = { request: Request; env: InviteEnv; params: { id?: string | string[]; invite?: string | string[] } }

export async function onRequestGet({ request, env, params }: Context) {
  const id = param(params.id), invite = param(params.invite)
  return invitePage(request, env, uuid.test(id) && uuid.test(invite)
    ? { rpc: 'public_invitation_preview', body: { p_event_id: id, p_preview_id: invite } } : null)
}
