import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
import { Button, Pagination, Skeleton, StatusBadge } from '../../components/ui'

// Exclusão com desfazer: o card some na hora, mas o pedido só vai ao servidor
// depois de UNDO_MS. Desfazer dentro do prazo não chega ao servidor. Sair da tela
// pela navegação envia na hora; fechar a aba antes do prazo não exclui (o lado
// seguro). Quando a lixeira de 7 dias (E1, T9) existir, o mesmo aviso passa a
// restaurar da lixeira.
export const UNDO_MS = 10_000
// Depois de excluir, a lista se rearruma: o segundo clique de um clique duplo
// cairia no card que subiu para o lugar (excluindo ou abrindo outro evento). Por
// SETTLE_MS a lista não recebe cliques e o “Desfazer” ignora clique de ponteiro.
const SETTLE_MS = 600
type Pending = { event: EventRecord; title: string }
type Notice = { id: string; title: string; kind: 'pending' | 'deleted' | 'undone' | 'gone' }
const noticeText: Record<Notice['kind'], (title: string) => string> = {
  pending: title => `Evento “${title}” excluído.`,
  deleted: title => `Evento “${title}” excluído.`,
  undone: title => `Exclusão de “${title}” desfeita.`,
  gone: title => `“${title}” já tinha sido excluído em outra aba.`,
}

export function EventsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  // Contador para o foco voltar ao aviso também na segunda exclusão seguida.
  const [focusNotice, setFocusNotice] = useState(0)
  const [failure, setFailure] = useState<{ title: string; cause: unknown } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  // Cards escondidos: a exclusão está no prazo de desfazer ou a caminho do servidor.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [restored, setRestored] = useState<string | null>(null)
  const [settling, setSettling] = useState(0)
  useEffect(() => { if (!settling) return; const done = setTimeout(() => setSettling(0), SETTLE_MS); return () => clearTimeout(done) }, [settling])
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const navigate = useNavigate()
  const cache = useQueryClient()
  const query = useQuery({ queryKey: [...eventKeys.all, session?.user.id, page], queryFn: () => listEvents(page), ...live })
  const latest = useRef({ page, events: query.data?.events })
  useLayoutEffect(() => { latest.current = { page, events: query.data?.events } })
  // O card excluído some: o foco vai para o aviso em vez de cair no início da página.
  useEffect(() => { if (focusNotice) noticeRef.current?.focus() }, [focusNotice])
  const hide = (id: string, on: boolean) => setHidden(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next })
  const update = (id: string, next: Notice | null) => setNotice(current => current?.id === id ? next : current)

  async function commit(item: Pending) {
    if (pendingRef.current === item) { pendingRef.current = null; setPending(null) }
    const { id } = item.event
    try {
      await deleteEvent(item.event)
      const { page, events } = latest.current
      if (page > 0 && events?.filter(row => row.id !== id).length === 0) setPage(page - 1)
      update(id, { id, title: item.title, kind: 'deleted' })
    } catch (cause) {
      // Já excluído em outra aba: some da lista, sem dizer que foi esta tela.
      if ((cause as Error).message === 'EVENT_NOT_FOUND') update(id, { id, title: item.title, kind: 'gone' })
      else { update(id, null); setFailure({ title: item.title, cause }) }
    }
    // Só reaparece (ou some de vez) depois de a lista reconsultada chegar: sem piscar.
    await cache.invalidateQueries({ queryKey: eventKeys.all })
    hide(id, false)
  }
  function schedule(event: EventRecord, title: string) {
    // Uma exclusão por vez no prazo: a anterior segue para o servidor na hora.
    if (pendingRef.current) void commit(pendingRef.current)
    const item = { event, title }
    pendingRef.current = item
    setPending(item)
    hide(event.id, true)
    setFailure(null)
    setNotice({ id: event.id, title, kind: 'pending' })
    setFocusNotice(count => count + 1)
    setSettling(Date.now() + SETTLE_MS)
  }
  function undo() {
    const item = pendingRef.current
    if (!item) return
    pendingRef.current = null
    setPending(null)
    hide(item.event.id, false)
    setNotice({ id: item.event.id, title: item.title, kind: 'undone' })
    setRestored(item.event.id)
  }
  // Saiu da tela pela navegação com exclusão no prazo: envia agora.
  useEffect(() => () => {
    const item = pendingRef.current
    if (!item) return
    pendingRef.current = null
    void deleteEvent(item.event).catch(() => undefined).finally(() => cache.invalidateQueries({ queryKey: eventKeys.all }))
  }, [cache])
  const create = useMutation({ mutationFn: createEvent, onSuccess: async event => {
    await cache.invalidateQueries({ queryKey: eventKeys.all })
    navigate(`/eventos/${event.id}/dados`, { state: { created: true } })
  } })
  const loadError = useLastError(query.error)
  function submit(e: FormEvent) { e.preventDefault(); if (!create.isPending) create.mutate(title) }
  // Primeiro uso: sem nenhum evento, o formulário já vem aberto no lugar do aviso vazio.
  const firstUse = query.data?.count === 0 && page === 0
  const form = (autoFocus: boolean) => <form onSubmit={submit} className="mt-6 space-y-4"><label className="field">Nome do evento<input autoFocus={autoFocus} maxLength={120} placeholder="Chá de bebê da família" value={title} onChange={e => setTitle(e.target.value)} /></label><p className="text-sm text-stone-600">Depois você completa os detalhes, vê a prévia e publica.</p><button className="button" disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar evento'}</button><p className="text-sm text-stone-600">Ao criar um evento, você concorda com os <Link className="text-link" to="/privacidade#organizadores">termos de uso</Link>.</p>{create.error && <p role="alert" className="error">{errorMessage(create.error)}</p>}</form>
  return <section className="page">
    <div className="flex flex-wrap items-center justify-between gap-6"><div><p className="eyebrow">Organize com carinho</p><h1 className="page-title">Seus eventos</h1><SlowRefresh fetching={query.isFetching} /></div>{!firstUse && <button className="button" onClick={() => setCreating(!creating)}>{creating ? 'Fechar formulário' : 'Novo evento'}</button>}</div>
    {creating && !firstUse && <div className="card mt-8">{form(true)}</div>}
    {query.isPending && !(failedLast(query) && loadError) ? <><LoadingState>Carregando eventos…</LoadingState><EventsSkeleton /></> : !query.data ? <div className="mt-10"><ErrorState title="Não foi possível carregar seus eventos." message={errorMessage(loadError)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div> : <>
      {notice && <div className="state state-success undo-notice mt-8">
        <p ref={noticeRef} tabIndex={-1} role="status">{noticeText[notice.kind](notice.title)}</p>
        {pending && pending.event.id === notice.id && <UndoAction key={pending.event.id} title={pending.title} settleUntil={settling} onUndo={undo} onExpire={() => void commit(pending)} />}
      </div>}
      {failure && <p role="alert" className="error mt-8">Não foi possível excluir “{failure.title}”. {errorMessage(failure.cause)}</p>}
      {query.isError && <RefreshStatus fetching={query.isFetching} failed onRetry={() => void query.refetch()} />}
      {query.data.events.length === 0 ? <div className="card mt-10"><h2 className="text-xl font-semibold">Seu primeiro encontro começa aqui.</h2><p className="mt-3 text-stone-600">Dê um nome ao evento para começar a preparar o chá de bebê.</p>{form(false)}</div> :
        <div className={`stagger mt-10 grid gap-5 md:grid-cols-2${settling ? ' pointer-events-none' : ''}`}>{query.data.events.filter(event => !hidden.has(event.id)).map(event =>
          <EventCard key={event.id} event={event} onDelete={schedule} focus={restored === event.id} onFocused={() => setRestored(null)} />)}</div>}
      <Pagination page={page} count={query.data.count} pageSize={12} onChange={setPage} label="Paginação dos eventos" />
    </>}
  </section>
}

const eventDate = (event: EventRecord) => event.starts_at ? new Date(event.starts_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : 'Data a definir'

// G5.2: forma dos cards de evento (selo, título, data), sem esperar dado nenhum.
function EventsSkeleton() {
  return <div className="mt-10 grid gap-5 md:grid-cols-2" aria-hidden="true">{[0, 1].map(i =>
    <div key={i} className="card card-stack"><Skeleton width="30%" height="1.5rem" /><Skeleton width="70%" height="1.75rem" /><Skeleton width="45%" /></div>)}
  </div>
}

// Botão “Desfazer” com contagem visível. A contagem pausa enquanto o ponteiro está
// sobre o aviso ou o foco está no botão, para quem usa teclado ou leitor de tela
// ter o tempo que precisar (WCAG 2.2.1). A contagem é só visual: o leitor de tela
// não a anuncia a cada segundo.
function UndoAction({ title, settleUntil, onUndo, onExpire }: { title: string; settleUntil: number; onUndo: () => void; onExpire: () => void }) {
  const [left, setLeft] = useState(UNDO_MS)
  const [paused, setPaused] = useState({ pointer: false, focus: false })
  const leftRef = useRef(UNDO_MS)
  const expire = useRef(onExpire)
  useLayoutEffect(() => { expire.current = onExpire })
  const stopped = paused.pointer || paused.focus
  useEffect(() => {
    if (stopped) return
    const end = Date.now() + leftRef.current
    const tick = setInterval(() => {
      leftRef.current = Math.max(0, end - Date.now())
      setLeft(leftRef.current)
      if (leftRef.current === 0) { clearInterval(tick); expire.current() }
    }, 200)
    return () => clearInterval(tick)
  }, [stopped])
  return <div className="undo-action" onPointerEnter={() => setPaused(p => ({ ...p, pointer: true }))} onPointerLeave={() => setPaused(p => ({ ...p, pointer: false }))}>
    <Button variant="secondary" size="sm" onClick={e => { if (e.detail > 0 && Date.now() < settleUntil) return; onUndo() }} onFocus={() => setPaused(p => ({ ...p, focus: true }))} onBlur={() => setPaused(p => ({ ...p, focus: false }))}>
      Desfazer<span className="sr-only"> exclusão de “{title}”</span></Button>
    <span className="undo-countdown" aria-hidden="true">{stopped ? 'pausado' : `${Math.ceil(left / 1000)} s`}</span>
  </div>
}

// O link cobre o conteúdo; abaixo do divisor ficam os atalhos. “Editar dados” em
// rascunho e publicado (encerrado não edita). “Excluir” em rascunho e encerrado
// (o servidor recusa publicado): rascunho exclui direto, porque ainda não tem
// convidados; encerrado confirma no card, porque apaga respostas e reservas.
// Os dois casos têm o “Desfazer” do aviso.
function EventCard({ event, onDelete, focus, onFocused }: { event: EventRecord; onDelete: (event: EventRecord, title: string) => void; focus: boolean; onFocused: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const confirmId = useId()
  const question = useRef<HTMLParagraphElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLAnchorElement>(null)
  // Trava síncrona: o clique duplo chega antes de o card sumir.
  const sending = useRef(false)
  const title = event.title || 'Evento sem título'
  const pending = pendingSteps(event).length
  useEffect(() => { if (confirming) question.current?.focus() }, [confirming])
  // Exclusão desfeita: o foco volta para o card restaurado.
  useEffect(() => { if (focus) { main.current?.focus(); onFocused() } }, [focus, onFocused])
  const content = <>
    <header className="card-header">
      <div className="card-badges"><StatusBadge tone={event.status === 'published' ? 'success' : 'neutral'}>{statusLabels[event.status]}</StatusBadge>{pending > 0 && <StatusBadge tone="warning">{pending === 1 ? '1 etapa pendente' : `${pending} etapas pendentes`}</StatusBadge>}</div>
      <h2 className="card-title text-h2" id={`${confirmId}-titulo`}>{title}</h2>
      <p className="card-description">{eventDate(event)}</p>
    </header>
    <span className="text-link mt-auto self-start">Ver detalhes →</span>
  </>
  const editable = event.status !== 'closed'
  const deletable = event.status !== 'published'
  function remove() { if (sending.current) return; sending.current = true; onDelete(event, title) }
  function cancel() { setConfirming(false); trigger.current?.focus() }
  return <article className="card card-stack" aria-labelledby={`${confirmId}-titulo`}>
    <Link ref={main} className="card-stack card-main" to={`/eventos/${event.id}`}>{content}</Link>
    <div className="card-actions card-shortcuts">
      {editable && <Link className="btn-ghost btn-sm" to={`/eventos/${event.id}/dados`}>Editar dados<span className="sr-only"> de {title}</span></Link>}
      {deletable && <button ref={trigger} type="button" className="btn-danger btn-sm" aria-expanded={event.status === 'closed' ? confirming : undefined}
        aria-controls={event.status === 'closed' ? confirmId : undefined} aria-label={`Excluir evento ${title}`}
        onClick={() => event.status === 'closed' ? (confirming ? cancel() : setConfirming(true)) : remove()}>Excluir</button>}
      {confirming && <div id={confirmId} className="card-disclosure">
        <p ref={question} tabIndex={-1}>Excluir “{title}”? Convites, respostas e reservas deste evento serão apagados. Você terá {UNDO_MS / 1000} segundos para desfazer.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" className="btn-danger-strong" onClick={remove}>Sim, excluir</Button>
          <Button variant="ghost" onClick={cancel}>Cancelar</Button>
        </div>
      </div>}
    </div>
  </article>
}
