import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent } from '../events/api'
import { invitations } from './api'
import type { Dashboard, Snapshot } from './api'
import { GuestEvent } from './GuestPage'
import { errorMessage } from '../../lib/errors'
import { live } from '../../lib/query'
import { ErrorState, LoadingState } from '../../components/States'
import { BackLink } from '../../components/ui'

// G4: o convite como o convidado vê, com um convidado de exemplo. Usa só dados
// que o organizador já lê (evento e lista); nada é enviado.
export function InvitePreview() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  const panel = useQuery<Dashboard>({ queryKey: ['invitations', session?.user.id, id], queryFn: () => invitations(id), ...live })
  const back = <BackLink to={`/eventos/${id}`}>Voltar ao painel</BackLink>
  const state = (content: ReactNode) => <section className="page">{back}<h1 className="page-title mt-6">Prévia do convite</h1><div className="mt-6">{content}</div></section>
  if (event.isPending || panel.isPending && !panel.isError) return state(<LoadingState>Montando a prévia…</LoadingState>)
  if (event.isError || panel.isError) return state(<ErrorState title="Não foi possível montar a prévia." message={errorMessage(event.error ?? panel.error)} busy={event.isFetching || panel.isFetching} onRetry={() => { void event.refetch(); void panel.refetch() }} />)
  if (!event.data) return state(<p>Evento não encontrado. Confira o endereço e se está na conta correta.</p>)
  const record = event.data
  if (!record.starts_at) return state(<div className="state state-empty"><p>Defina a data do evento em “Dados do evento” para ver a prévia.</p><Link className="secondary" to={`/eventos/${id}/dados`}>Dados do evento</Link></div>)
  const snapshot: Snapshot = {
    invitation: { name: 'Convidado de exemplo', kind: 'family', capacity: 4, response: 'pending', attending: 0, version: 0 },
    event: { id: record.id, title: record.title || 'Evento sem título', description: record.public_description, starts_at: record.starts_at,
      address: record.private_address, instructions: record.private_instructions, cover_path: record.cover_path, status: record.status },
    items: (panel.data?.items ?? []).map(item => ({ ...item, description: '', own: null })),
  }
  return <>
    <div className="page preview-bar">
      {back}
      <p className="state state-warning" role="note"><span><strong>Prévia do convite.</strong> É assim que o convidado vê. “Convidado de exemplo” aparece no lugar do nome de cada pessoa, e nada do que você tocar aqui é enviado.</span></p>
    </div>
    <GuestEvent access={{ token: '', snapshot }} preview />
  </>
}
