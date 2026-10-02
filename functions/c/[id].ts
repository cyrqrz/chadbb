// Link do convite com prévia do evento: `/c/<id-do-evento>#token` (links emitidos antes de
// 02/10). A projeção pública do evento (`public_event_preview`) só tem título, descrição,
// dia e horário e arte de evento publicado. Lógica comum em src/lib/invitePage.ts.
import { invitePage, param, uuid } from '../../src/lib/invitePage'
import type { InviteEnv } from '../../src/lib/invitePage'

type Context = { request: Request; env: InviteEnv; params: { id?: string | string[] } }

export async function onRequestGet({ request, env, params }: Context) {
  const id = param(params.id)
  return invitePage(request, env, uuid.test(id) ? { rpc: 'public_event_preview', body: { p_event_id: id } } : null)
}
