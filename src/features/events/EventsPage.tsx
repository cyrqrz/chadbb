import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvent, deleteEvent, eventKeys, listEvents } from './api'
import type { EventRecord } from './model'
import { pendingSteps, statusLabels } from './model'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { ErrorState, LoadingState, RefreshStatus, SlowRefresh } from '../../components/States'
import { useAuth } from '../auth/context'
import { Button, Pagination, StatusBadge } from '../../components/ui'

export function EventsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  // Contador para o foco voltar ao aviso também na segunda exclusão seguida.
  const [deleted, setDeleted] = useState({ title: '', count: 0 })
  const notice = useRef<HTMLParagraphElement>(null)
  const navigate = useNavigate()
  const cache = useQueryClient()
  const query = useQuery({ queryKey: [...eventKeys.all, session?.user.id, page], queryFn: () => listEvents(page), ...live })
  // O card excluído some: o foco vai para o aviso em vez de cair no início da página.
  useEffect(() => { if (deleted.count) notice.current?.focus() }, [deleted])
  function onDeleted(title: string) {
    if (page > 0 && query.data?.events.length === 1) setPage(page - 1)
    setDeleted(current => ({ title, count: current.count + 1 }))
  }
  const create = useMutation({ mutationFn: createEvent, onSuccess: async event => {
    await cache.invalidateQueries({ queryKey: eventKeys.all })
    navigate(`/eventos/${event.id}/dados`, { state: { created: true } })
  } })
  const loadError = useLastError(query.error)
  function submit(e: FormEvent) { e.preventDefault(); if (!create.isPending) create.mutate(title) }
  // Primeiro uso: sem nenhum evento, o formulário já vem aberto no lugar do aviso vazio.
  const firstUse = query.data?.count === 0 && page === 0
  const form = (autoFocus: boolean) => <form onSubmit={submit} className="mt-6 space-y-4"><label className="field">Nome do evento<input autoFocus={autoFocus} maxLength={120} placeholder="Chá de bebê da família" value={title} onChange={e => setTitle(e.target.value)} /></label><p className="text-sm text-stone-600">Depois você completa os detalhes, vê a prévia e publica.</p><button className="button" disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar evento'}</button>{create.error && <p role="alert" className="error">{errorMessage(create.error)}</p>}</form>
  return <section className="page">
    <div className="flex flex-wrap items-center justify-between gap-6"><div><p className="eyebrow">Organize com carinho</p><h1 className="page-title">Seus eventos</h1><SlowRefresh fetching={query.isFetching} /></div>{!firstUse && <button className="button" onClick={() => setCreating(!creating)}>{creating ? 'Fechar formulário' : 'Novo evento'}</button>}</div>
    {creating && !firstUse && <div className="card mt-8">{form(true)}</div>}
    {query.isPending && !(failedLast(query) && loadError) ? <LoadingState>Carregando eventos…</LoadingState> : !query.data ? <div className="mt-10"><ErrorState title="Não foi possível carregar seus eventos." message={errorMessage(loadError)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div> : <>
      {deleted.title && <div className="mt-8"><p ref={notice} tabIndex={-1} role="status" className="state state-success">Evento “{deleted.title}” excluído.</p></div>}
      {query.isError && <RefreshStatus fetching={query.isFetching} failed onRetry={() => void query.refetch()} />}
      {query.data.events.length === 0 ? <div className="card mt-10"><h2 className="text-xl font-semibold">Seu primeiro encontro começa aqui.</h2><p className="mt-3 text-stone-600">Dê um nome ao evento para começar a preparar o chá de bebê.</p>{form(false)}</div> :
        <div className="stagger mt-10 grid gap-5 md:grid-cols-2">{query.data.events.map(event => <EventCard key={event.id} event={event} onDeleted={onDeleted} />)}</div>}
      <Pagination page={page} count={query.data.count} pageSize={12} onChange={setPage} label="Paginação dos eventos" />
    </>}
  </section>
}

const eventDate = (event: EventRecord) => event.starts_at ? new Date(event.starts_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : 'Data a definir'

// Publicado: o card inteiro é o link. Rascunho e encerrado: o link cobre o
// conteúdo e “Excluir evento” fica abaixo do divisor, com confirmação no card.
function EventCard({ event, onDeleted }: { event: EventRecord; onDeleted: (title: string) => void }) {
  const cache = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const confirmId = useId()
  const question = useRef<HTMLParagraphElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  // Trava síncrona: o clique duplo chega antes de o botão ficar ocupado.
  const sending = useRef(false)
  const title = event.title || 'Evento sem título'
  const pending = pendingSteps(event).length
  // Já excluído ou mudado em outra aba: a lista é reconsultada para mostrar o estado real.
  const remove = useMutation({ mutationFn: () => deleteEvent(event), onSettled: () => { sending.current = false }, onError: async cause => {
    if (['EVENT_NOT_FOUND', 'EVENT_VERSION_CONFLICT'].includes((cause as Error).message)) await cache.invalidateQueries({ queryKey: eventKeys.all })
  }, onSuccess: async () => {
    onDeleted(title)
    await cache.invalidateQueries({ queryKey: eventKeys.all })
  } })
  useEffect(() => { if (confirming) question.current?.focus() }, [confirming])
  const content = <>
    <header className="card-header">
      <div className="card-badges"><StatusBadge tone={event.status === 'published' ? 'success' : 'neutral'}>{statusLabels[event.status]}</StatusBadge>{pending > 0 && <StatusBadge tone="warning">{pending === 1 ? '1 etapa pendente' : `${pending} etapas pendentes`}</StatusBadge>}</div>
      <h2 className="card-title text-h2" id={`${confirmId}-titulo`}>{title}</h2>
      <p className="card-description">{eventDate(event)}</p>
    </header>
    <span className="text-link mt-auto self-start">Ver detalhes →</span>
  </>
  if (event.status === 'published') return <Link className="card card-link card-stack" to={`/eventos/${event.id}`}>{content}</Link>
  function cancel() { setConfirming(false); remove.reset(); trigger.current?.focus() }
  return <article className="card card-stack" aria-labelledby={`${confirmId}-titulo`}>
    <Link className="card-stack card-main" to={`/eventos/${event.id}`}>{content}</Link>
    <div className="card-actions">
      <button ref={trigger} type="button" className="btn-danger btn-sm" aria-expanded={confirming} aria-controls={confirmId}
        aria-label={`Excluir evento ${title}`} onClick={() => confirming ? cancel() : setConfirming(true)}>Excluir evento</button>
      {confirming && <div id={confirmId} className="card-disclosure">
        <p ref={question} tabIndex={-1}>Excluir “{title}”? Convites, respostas e reservas deste evento serão apagados, e não dá para desfazer.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" className="btn-danger-strong" busy={remove.isPending} onClick={() => { if (sending.current) return; sending.current = true; remove.mutate() }}>{remove.isPending ? 'Excluindo…' : 'Excluir definitivamente'}</Button>
          <Button variant="ghost" disabled={remove.isPending} onClick={cancel}>Cancelar</Button>
        </div>
        {remove.error && <p role="alert" className="error">{errorMessage(remove.error)}</p>}
      </div>}
    </div>
  </article>
}
