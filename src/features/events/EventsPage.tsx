import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvent, deleteEvent, eventKeys, listEvents, transitionEvent } from './api'
import type { EventRecord } from './model'
import { pendingSteps, statusLabels } from './model'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { ErrorState, LoadingState, RefreshStatus, SlowRefresh } from '../../components/States'
import { useAuth } from '../auth/context'
import { Button, CheckIcon, Pagination, PencilIcon, PlusIcon, Skeleton, StatusBadge, TrashIcon } from '../../components/ui'

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
// Uma exclusão no prazo de desfazer pode ter um evento (atalho do card) ou vários
// (seleção). `closed`: era publicado e foi encerrado agora — encerrar não tem volta,
// então desfazer devolve o evento já encerrado.
type Item = { event: EventRecord; title: string; closed: boolean }
type Pending = { key: string; items: Item[] }
type Notice = { id: string; items: Item[]; kind: 'pending' | 'deleted' | 'undone' | 'gone' }
const subject = (items: Item[]) => items.length === 1 ? `“${items[0].title}”` : `${items.length} eventos`
const noticeText: Record<Notice['kind'], (items: Item[]) => string> = {
  pending: items => items.length === 1 ? `Evento ${subject(items)} excluído.` : `${items.length} eventos excluídos.`,
  deleted: items => items.length === 1 ? `Evento ${subject(items)} excluído.` : `${items.length} eventos excluídos.`,
  undone: items => `Exclusão de ${subject(items)} desfeita.${!items.some(item => item.closed) ? ''
    : items.length === 1 ? ' O evento continua, mas encerrado: os convites não funcionam mais.' : ' Os que estavam publicados continuam, mas encerrados.'}`,
  gone: items => `${items.length === 1 ? subject(items) : `${items.length} eventos`} já ${items.length === 1 ? 'tinha' : 'tinham'} sido excluído${items.length === 1 ? '' : 's'} em outra aba.`,
}

export function EventsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  // Contador para o foco voltar ao aviso também na segunda exclusão seguida.
  const [focusNotice, setFocusNotice] = useState(0)
  const [failure, setFailure] = useState<{ titles: string[]; cause: unknown; closing?: boolean } | null>(null)
  // Seleção de vários eventos (só da página atual): um único aviso e um único “Desfazer”.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmBatch, setConfirmBatch] = useState(false)
  // Enquanto os publicados são encerrados, nada mais é enviado.
  const [closing, setClosing] = useState(false)
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

  async function commit(batch: Pending) {
    if (pendingRef.current === batch) { pendingRef.current = null; setPending(null) }
    const done: Item[] = [], gone: Item[] = [], failed: { item: Item; cause: unknown }[] = []
    // Um por vez, na ordem da tela: o servidor confere dono, estado e versão de cada um.
    for (const item of batch.items) {
      try { await deleteEvent(item.event); done.push(item) } catch (cause) {
        // Já excluído em outra aba: some da lista, sem dizer que foi esta tela.
        if ((cause as Error).message === 'EVENT_NOT_FOUND') gone.push(item); else failed.push({ item, cause })
      }
    }
    const { page, events } = latest.current
    const removed = new Set([...done, ...gone].map(item => item.event.id))
    if (page > 0 && removed.size && events?.every(row => removed.has(row.id))) setPage(page - 1)
    update(batch.key, done.length ? { id: batch.key, items: done, kind: 'deleted' } : gone.length ? { id: batch.key, items: gone, kind: 'gone' } : null)
    if (failed.length) setFailure({ titles: failed.map(({ item }) => item.title), cause: failed[0].cause })
    // Só reaparece (ou some de vez) depois de a lista reconsultada chegar: sem piscar.
    await cache.invalidateQueries({ queryKey: eventKeys.all })
    for (const item of batch.items) hide(item.event.id, false)
  }
  function schedule(items: Item[]) {
    if (!items.length) return
    // Uma exclusão por vez no prazo: a anterior segue para o servidor na hora.
    if (pendingRef.current) void commit(pendingRef.current)
    const batch = { key: items.map(item => item.event.id).join(','), items }
    pendingRef.current = batch
    setPending(batch)
    for (const item of items) hide(item.event.id, true)
    setNotice({ id: batch.key, items, kind: 'pending' })
    setFocusNotice(count => count + 1)
    setSettling(Date.now() + SETTLE_MS)
  }
  // Publicado: encerra antes (sem volta, como o aviso diz) e só então agenda a exclusão,
  // com a versão encerrada. Se encerrar falhar, aquele evento fica como estava.
  async function remove(entries: { event: EventRecord; title: string }[]): Promise<boolean> {
    setFailure(null)
    const items: Item[] = [], failed: { title: string; cause: unknown }[] = []
    const publishedCount = entries.filter(entry => entry.event.status === 'published').length
    if (publishedCount) setClosing(true)
    for (const { event, title } of entries) {
      if (event.status !== 'published') { items.push({ event, title, closed: false }); continue }
      try { items.push({ event: await transitionEvent(event, 'closed'), title, closed: true }) } catch (cause) { failed.push({ title, cause }) }
    }
    setClosing(false)
    if (failed.length) setFailure({ titles: failed.map(entry => entry.title), cause: failed[0].cause, closing: true })
    schedule(items)
    setSelecting(false); setSelected(new Set()); setConfirmBatch(false)
    if (failed.length) await cache.invalidateQueries({ queryKey: eventKeys.all })
    return items.length > 0
  }
  function undo() {
    const batch = pendingRef.current
    if (!batch) return
    pendingRef.current = null
    setPending(null)
    for (const item of batch.items) hide(item.event.id, false)
    setNotice({ id: batch.key, items: batch.items, kind: 'undone' })
    setRestored(batch.items[0].event.id)
    // Encerrados agora: a lista reconsulta para os cards voltarem já como encerrados.
    if (batch.items.some(item => item.closed)) void cache.invalidateQueries({ queryKey: eventKeys.all })
  }
  // Saiu da tela pela navegação com exclusão no prazo: envia agora.
  useEffect(() => () => {
    const batch = pendingRef.current
    if (!batch) return
    pendingRef.current = null
    void Promise.allSettled(batch.items.map(item => deleteEvent(item.event))).finally(() => cache.invalidateQueries({ queryKey: eventKeys.all }))
  }, [cache])
  function toggleSelecting() { setSelecting(on => !on); setSelected(new Set()); setConfirmBatch(false) }
  function toggle(id: string, on: boolean) { setSelected(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next }); setConfirmBatch(false) }
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
    <div className="flex flex-wrap items-center justify-between gap-6"><div><p className="eyebrow">Organize com carinho</p><h1 className="page-title">Seus eventos</h1><SlowRefresh fetching={query.isFetching} /></div>{!firstUse && <div className="flex flex-wrap gap-3">
      {!!query.data?.events.length && <button type="button" className="secondary" aria-pressed={selecting} onClick={toggleSelecting}><CheckIcon />{selecting ? 'Cancelar seleção' : 'Selecionar'}</button>}
      <button className="button" onClick={() => setCreating(!creating)}>{!creating && <PlusIcon />}{creating ? 'Fechar formulário' : 'Novo evento'}</button>
    </div>}</div>
    {creating && !firstUse && <div className="card mt-8">{form(true)}</div>}
    {query.isPending && !(failedLast(query) && loadError) ? <><LoadingState>Carregando eventos…</LoadingState><EventsSkeleton /></> : !query.data ? <div className="mt-10"><ErrorState title="Não foi possível carregar seus eventos." message={errorMessage(loadError)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div> : <>
      {notice && <div className="state state-success undo-notice mt-8">
        <p ref={noticeRef} tabIndex={-1} role="status">{noticeText[notice.kind](notice.items)}</p>
        {pending && pending.key === notice.id && <UndoAction key={pending.key} subject={subject(pending.items)} settleUntil={settling} onUndo={undo} onExpire={() => void commit(pending)} />}
      </div>}
      {failure && <p role="alert" className="error mt-8">Não foi possível {failure.closing ? 'encerrar' : 'excluir'} {failure.titles.map(title => `“${title}”`).join(', ')}. {errorMessage(failure.cause)}</p>}
      {selecting && !!query.data.events.length && <SelectionBar events={query.data.events.filter(event => selected.has(event.id) && !hidden.has(event.id))} confirming={confirmBatch} busy={closing}
        onAll={() => setSelected(new Set(query.data.events.filter(event => !hidden.has(event.id)).map(event => event.id)))} onClear={() => { setSelected(new Set()); setConfirmBatch(false) }}
        onDelete={() => setConfirmBatch(true)} onCancel={() => setConfirmBatch(false)}
        onConfirm={events => void remove(events.map(event => ({ event, title: event.title || 'Evento sem título' })))} />}
      {query.isError && <RefreshStatus fetching={query.isFetching} failed onRetry={() => void query.refetch()} />}
      {query.data.events.length === 0 ? <div className="card mt-10"><h2 className="text-xl font-semibold">Seu primeiro encontro começa aqui.</h2><p className="mt-3 text-stone-600">Dê um nome ao evento para começar a preparar o chá de bebê.</p>{form(false)}</div> :
        <div className={`stagger mt-10 grid gap-5 md:grid-cols-2${settling ? ' pointer-events-none' : ''}`}>{query.data.events.filter(event => !hidden.has(event.id)).map(event =>
          <EventCard key={event.id} event={event} busy={closing} onDelete={(event, title) => remove([{ event, title }])} focus={restored === event.id} onFocused={() => setRestored(null)}
            selecting={selecting} selected={selected.has(event.id)} onSelect={on => toggle(event.id, on)} />)}</div>}
      <Pagination page={page} count={query.data.count} pageSize={12} onChange={next => { setPage(next); setSelected(new Set()); setConfirmBatch(false) }} label="Paginação dos eventos" />
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
function UndoAction({ subject, settleUntil, onUndo, onExpire }: { subject: string; settleUntil: number; onUndo: () => void; onExpire: () => void }) {
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
      Desfazer<span className="sr-only"> exclusão de {subject}</span></Button>
    <span className="undo-countdown" aria-hidden="true">{stopped ? 'pausado' : `${Math.ceil(left / 1000)} s`}</span>
  </div>
}

// Barra da seleção: quantos estão marcados, marcar todos e excluir. Excluir vários
// sempre confirma; se houver publicados, o aviso diz que encerrar não tem volta.
function SelectionBar({ events, confirming, busy, onAll, onClear, onDelete, onCancel, onConfirm }: {
  events: EventRecord[]; confirming: boolean; busy: boolean; onAll: () => void; onClear: () => void; onDelete: () => void; onCancel: () => void; onConfirm: (events: EventRecord[]) => void
}) {
  const question = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (confirming) question.current?.focus() }, [confirming])
  const published = events.filter(event => event.status === 'published').length
  const count = events.length
  const noun = count === 1 ? '1 evento' : `${count} eventos`
  return <section aria-label="Seleção de eventos" className="card card-stack selection-bar mt-8">
    <div className="card-shortcuts flex">
      <p className="font-semibold" aria-live="polite">{count ? `${noun} selecionado${count === 1 ? '' : 's'}` : 'Marque os eventos que quer excluir.'}</p>
      <div className="flex flex-wrap gap-2 sm:ms-auto">
        <Button variant="ghost" size="sm" onClick={onAll}>Marcar todos</Button>
        {count > 0 && <Button variant="ghost" size="sm" onClick={onClear}>Desmarcar</Button>}
        <Button variant="danger" size="sm" disabled={!count || busy} aria-expanded={confirming} onClick={onDelete}><TrashIcon size={18} />Excluir selecionados</Button>
      </div>
    </div>
    {confirming && count > 0 && <div className="card-disclosure">
      <p ref={question} tabIndex={-1}>Excluir {noun}? Convites, respostas e reservas serão apagados.{published ? ` ${published === 1 ? '1 deles está publicado e será encerrado' : `${published} deles estão publicados e serão encerrados`}: os convites deixam de funcionar e encerrar não tem volta.` : ''} Você terá {UNDO_MS / 1000} segundos para desfazer a exclusão.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" className="btn-danger-strong" busy={busy} onClick={() => onConfirm(events)}>{busy ? 'Encerrando…' : published ? `Sim, encerrar e excluir ${noun}` : `Sim, excluir ${noun}`}</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
      </div>
    </div>}
  </section>
}

// O link cobre o conteúdo; abaixo do divisor ficam os atalhos. “Editar dados” em
// rascunho e publicado (encerrado não edita). “Excluir” em todos: rascunho exclui
// direto, porque ainda não tem convidados; encerrado confirma no card, porque apaga
// respostas e reservas; publicado confirma “Encerrar e excluir” (decisão do titular
// em 01/10), porque os convites param de funcionar e encerrar não tem volta.
// Todos têm o “Desfazer” do aviso. Na seleção, o atalho vira a caixa de marcar.
function EventCard({ event, busy, onDelete, focus, onFocused, selecting, selected, onSelect }: {
  event: EventRecord; busy: boolean; onDelete: (event: EventRecord, title: string) => Promise<boolean>; focus: boolean; onFocused: () => void
  selecting: boolean; selected: boolean; onSelect: (on: boolean) => void
}) {
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
  const asks = event.status !== 'draft'
  const published = event.status === 'published'
  async function remove() {
    if (sending.current) return
    sending.current = true
    // Não agendou (encerrar falhou): o card fica, a confirmação fecha e o foco volta ao botão
    // para tentar de novo; o motivo aparece no aviso acima da lista.
    if (!await onDelete(event, title)) { sending.current = false; cancel() }
  }
  function cancel() { setConfirming(false); trigger.current?.focus() }
  return <article className={`card card-stack${selected ? ' card-selected' : ''}`} aria-labelledby={`${confirmId}-titulo`}>
    <Link ref={main} className="card-stack card-main" to={`/eventos/${event.id}`}>{content}</Link>
    <div className="card-actions card-shortcuts">
      {selecting ? <label className="choice card-select"><input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} />Selecionar<span className="sr-only"> {title}</span></label> : <>
      {editable && <Link className="secondary btn-sm" to={`/eventos/${event.id}/dados`}><PencilIcon size={18} />Editar dados<span className="sr-only"> de {title}</span></Link>}
      <button ref={trigger} type="button" className="btn-danger btn-sm" disabled={busy} aria-expanded={asks ? confirming : undefined}
        aria-controls={asks ? confirmId : undefined} aria-label={`${published ? 'Encerrar e excluir' : 'Excluir'} evento ${title}`}
        onClick={() => asks ? (confirming ? cancel() : setConfirming(true)) : void remove()}><TrashIcon size={18} />{published ? 'Encerrar e excluir' : 'Excluir'}</button>
      {confirming && <div id={confirmId} className="card-disclosure">
        {published
          ? <p ref={question} tabIndex={-1}>Encerrar e excluir “{title}”? Os convites deixam de funcionar na hora e encerrar não tem volta. Convites, respostas e reservas serão apagados. Você terá {UNDO_MS / 1000} segundos para desfazer a exclusão; se desfizer, o evento continua, mas encerrado.</p>
          : <p ref={question} tabIndex={-1}>Excluir “{title}”? Convites, respostas e reservas deste evento serão apagados. Você terá {UNDO_MS / 1000} segundos para desfazer.</p>}
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" className="btn-danger-strong" busy={busy} onClick={() => void remove()}>{busy ? 'Encerrando…' : published ? 'Sim, encerrar e excluir' : 'Sim, excluir'}</Button>
          <Button variant="ghost" disabled={busy} onClick={cancel}>Cancelar</Button>
        </div>
      </div>}
      </>}
    </div>
  </article>
}
