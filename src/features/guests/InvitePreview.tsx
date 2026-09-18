import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent, transitionEvent } from '../events/api'
import { pendingSteps, toDraft, validateDraft } from '../events/model'
import type { EventRecord } from '../events/model'
import { SetupDock } from '../events/SetupDock'
import { invitations } from './api'
import type { Dashboard, Snapshot } from './api'
import { GuestEvent } from './GuestPage'
import { errorMessage } from '../../lib/errors'
import { live } from '../../lib/query'
import { ErrorState, LoadingState } from '../../components/States'
import { BackLink, Button } from '../../components/ui'

// G4: o convite como o convidado vê, com um convidado de exemplo. Usa só dados
// que o organizador já lê (evento e lista); nada é enviado.
export function InvitePreview() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  const panel = useQuery<Dashboard>({ queryKey: ['invitations', session?.user.id, id], queryFn: () => invitations(id), ...live })
  // Rascunho ainda não tem painel de convites: a volta é para os dados do evento.
  const draft = event.data?.status === 'draft'
  const back = draft ? <BackLink to={`/eventos/${id}/dados`}>Voltar à edição</BackLink> : <BackLink to={`/eventos/${id}`}>Voltar ao painel</BackLink>
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
  return <div className={pendingSteps(record).length ? 'page-docked' : undefined}>
    <div className="page preview-bar">
      {back}
      <p className="state state-warning" role="note"><span><strong>Prévia do convite.</strong> É assim que o convidado vê. “Convidado de exemplo” aparece no lugar do nome de cada pessoa, e nada do que você tocar aqui é enviado.</span></p>
      <PublishFromPreview record={record} />
    </div>
    <GuestEvent access={{ token: '', snapshot }} preview />
    <SetupDock event={record} />
  </div>
}

// Fluxo de criação: na prévia do rascunho, o organizador volta para editar ou publica.
function PublishFromPreview({ record }: { record: EventRecord }) {
  const cache = useQueryClient()
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [published, setPublished] = useState(false)
  const notice = useRef<HTMLDivElement>(null)
  // O botão de publicar some: o foco vai para o aviso com o próximo passo.
  useEffect(() => { if (published) notice.current?.focus() }, [published])
  if (published) return <div ref={notice} tabIndex={-1} role="status" className="state state-success flow-notice">
    <p><strong>Evento publicado.</strong> Agora crie os convites e envie os links.</p>
    <Link className="button" to={`/eventos/${record.id}`}>Seguir para convidados e presença</Link>
  </div>
  if (record.status !== 'draft') return null
  const missing = validateDraft(toDraft(record), true)
  const edit = <Link className="secondary" to={`/eventos/${record.id}/dados`}>Editar dados</Link>
  if (missing) return <div className="notice"><p>{missing} Complete os dados para publicar.</p><div className="flow-actions mt-3">{edit}</div></div>
  async function publish() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const next = await transitionEvent(record, 'published')
      cache.setQueryData([...eventKeys.detail(next.id), session?.user.id], next)
      setPublished(true)
      await cache.invalidateQueries({ queryKey: eventKeys.all })
    } catch (cause) {
      // Conflito: pode ser outra aba que já publicou, ou a resposta desta que se perdeu.
      // Se o evento já está publicado, a pessoa vê isso e o próximo passo, não um erro.
      const latest = (cause as Error).message === 'VERSION_CONFLICT' ? await getEvent(record.id).catch(() => null) : null
      if (latest) cache.setQueryData([...eventKeys.detail(latest.id), session?.user.id], latest)
      if (latest?.status === 'published') setPublished(true)
      else setError(cause)
      if (latest) await cache.invalidateQueries({ queryKey: eventKeys.all })
    } finally { setBusy(false) }
  }
  return <div className="flex flex-col items-start gap-3">
    <p>Tudo certo? Publique para começar a enviar os convites.</p>
    <div className="flow-actions">
      <Button busy={busy} onClick={() => void publish()}>{busy ? 'Publicando…' : 'Publicar evento'}</Button>
      {edit}
    </div>
    {error ? <p role="alert" className="error">{(error as Error).message === 'VERSION_CONFLICT' ? 'O evento mudou em outra aba. A prévia foi atualizada: confira e publique de novo.' : errorMessage(error)}</p> : null}
  </div>
}
