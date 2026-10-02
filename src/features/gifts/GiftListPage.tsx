import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent } from '../events/api'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { Button, CheckIcon, ConfirmDialog, Pagination, PlusIcon, QuantityField, SelectionBar, Skeleton, StatusBadge, TrashIcon } from '../../components/ui'
import { EventNotFound } from '../events/EventLayout'
import { StepCompletion } from '../events/SetupDock'
import { addCustomTreat, addItem, addItems, CATALOG_LIMIT, giftKeys, listedProducts, listItems, listProducts, PAGE_SIZE, prepareTreatList, removeItem, removeItems, setQuantity } from './api'
import { parseQuantity, platformLabels, categoryLabels } from './model'
import type { Category, DiaperSize, EventItem, Product } from './model'
import type { ListedItem } from './api'
import { bySize } from '../../lib/diapers'

export function GiftListPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  const loadError = useLastError(event.error)
  if (event.isPending && !(failedLast(event) && loadError)) return <LoadingState>Carregando evento…</LoadingState>
  if (event.data === undefined) return <div className="tab-panel"><h2 className="tab-title">Lista de presentes</h2><div className="mt-6"><ErrorState title="Não foi possível abrir a lista." message={errorMessage(loadError)} busy={event.isFetching} onRetry={() => void event.refetch()} /></div></div>
  if (!event.data) return <EventNotFound />
  // A13: reconsulta do evento que falha avisa; o "encerrado" exibido pode estar desatualizado.
  const eventStatus = event.isError && <RefreshStatus fetching={event.isFetching} failed onRetry={() => void event.refetch()}
    message="Não foi possível conferir se o evento continua aberto. Se ele tiver sido encerrado, as alterações serão recusadas." retryLabel="Conferir de novo" />
  return <GiftList key={id} eventId={id} closed={event.data.status === 'closed'} eventStatus={eventStatus} step={<StepCompletion event={event.data} step="gifts" />} />
}
function GiftList({ eventId, closed, eventStatus, step }: { eventId: string; closed: boolean; eventStatus: ReactNode; step: ReactNode }) {
  const { session } = useAuth()
  const [category, setCategory] = useState<Category>('fralda')
  const [page, setPage] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  // Preparar a lista vazia troca o destaque pelo resumo: o foco vai para o resumo.
  const [focusSummary, setFocusSummary] = useState(false)
  const cache = useQueryClient()
  const query = useQuery({ queryKey: [...giftKeys.items(eventId), session?.user.id, category, page], queryFn: () => listItems(eventId, page, category), ...live })
  async function prepare() {
    setPreparing(true); setNotice(null); setFocusSummary(false)
    const fromEmpty = empty
    // A contagem é a que o servidor devolve: o front não calcula quantos faltavam.
    try { const count = await prepareTreatList(eventId); await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) }); setFocusSummary(fromEmpty); setNotice({ ok: true, text: !count ? 'Os mimos sugeridos já estão na lista.' : fromEmpty ? `${count} ${count === 1 ? 'mimo sugerido entrou' : 'mimos sugeridos entraram'} na lista.` : `${count} ${count === 1 ? 'mimo sugerido voltou' : 'mimos sugeridos voltaram'} para a lista.` }) }
    catch (cause) { setNotice({ ok: false, text: errorMessage(cause) }) } finally { setPreparing(false) }
  }
  // A11: o erro guardado é o desta categoria e página. A12: a última contagem
  // conhecida mantém a paginação quando uma página falha.
  const listError = useLastError(query.error, `${category}:${page}`)
  const [total, setTotal] = useState<number | null>(null)
  if (query.data && query.data.count !== total) setTotal(query.data.count)
  const listed = useQuery({ queryKey: [...giftKeys.items(eventId), 'listed', session?.user.id], queryFn: () => listedProducts(eventId), ...live })
  const empty = listed.data?.length === 0
  // O cartão removido some: o foco vai para o aviso, e não para o início da página.
  const [removed, setRemoved] = useState({ text: '', count: 0 })
  // Todos os tamanhos já na lista: o atalho de adicionar levaria a uma seção sem o que oferecer.
  const [catalogComplete, setCatalogComplete] = useState(false)
  const removedNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (removed.count) removedNotice.current?.focus() }, [removed])
  function onRemoved(title: string) {
    if (page > 0 && query.data?.items.length === 1) setPage(page - 1)
    setRemoved(current => ({ text: `“${title}” saiu da lista.`, count: current.count + 1 }))
  }
  // Seleção de vários itens da página (padrão de "Seus eventos"): remove todos ou nenhum.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const removingRef = useRef(false)
  const rows = query.data?.items ?? []
  // Versões da última consulta: o servidor recusa o lote se alguma mudou desde então.
  const chosen = rows.filter(item => picked.has(item.id))
  function resetSelection(on = false) { setSelecting(on); setPicked(new Set()); setConfirmBatch(false); setBatchError(null) }
  function pick(id: string, on: boolean) { setPicked(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next }); setConfirmBatch(false); setBatchError(null) }
  async function removeChosen(items: EventItem[]) {
    if (removingRef.current || !items.length) return
    if (!navigator.onLine) { setBatchError(errorMessage(new Error('OFFLINE'))); return }
    removingRef.current = true; setRemoving(true); setBatchError(null)
    const titles = (ids: string[]) => new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(items.filter(item => ids.includes(item.id)).map(item => `“${item.product.title}”`))
    try {
      await removeItems(eventId, items)
      if (page > 0 && items.length === rows.length) setPage(page - 1)
      resetSelection()
      setRemoved(current => ({ count: current.count + 1, text: items.length === 1 ? `“${items[0].product.title}” saiu da lista.`
        : items.length <= 3 ? `${titles(items.map(item => item.id))} saíram da lista.` : `${items.length} itens saíram da lista.` }))
    } catch (cause) {
      const { message, details } = cause as { message?: string; details?: string }
      const ids = details?.split(',') ?? []
      // Tudo ou nada: com a recusa, nenhum item saiu. O texto diz quais itens travaram o lote.
      setBatchError(message === 'ITEM_HAS_RESERVATIONS' ? `Nada saiu da lista: um convidado já escolheu ${titles(ids)}. Desmarque ${ids.length === 1 ? 'esse item' : 'esses itens'} para remover os outros.`
        : message === 'ITEM_VERSION_CONFLICT' ? `Nada saiu da lista: ${titles(ids)} mudou em outra aba. A lista foi atualizada: confira e confirme de novo.`
        : errorMessage(cause))
    } finally {
      removingRef.current = false; setRemoving(false)
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
    }
  }
  // Contagem desta categoria, como o servidor devolveu (regra 6: o front não soma).
  const count = query.data?.count ?? 0
  // Sem dado anterior, a nova tentativa volta a consulta para "pending" e zera isError;
  // comparar as datas mantém o aviso na tela durante a tentativa.
  return <div className="tab-panel">
    <h2 className="tab-title">Lista de presentes</h2>
    {eventStatus}
    {step}
    <p className="mt-4 max-w-2xl text-stone-600">Fraldas por tamanho e mimos de livre escolha. Os convidados veem esta lista pelo link do convite.</p>
    {/* Lista vazia: só os mimos têm lista pronta. As fraldas cada organizador monta
        para o seu chá, escolhendo os tamanhos e os pacotes em “Adicionar à lista”. */}
    {!closed && empty && <section aria-labelledby="quick-start" className="quick-start mt-8">
      <p className="eyebrow">Recomendado</p>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <h2 id="quick-start" className="text-2xl font-bold">Comece pelos mimos sugeridos</h2>
          <p className="mt-2">Um toque inclui os mimos mais pedidos em chá de bebê. Depois é só tirar o que não quiser e acrescentar outros.</p>
          <p className="mt-2">As fraldas você monta do seu jeito: escolha os tamanhos e quantos pacotes de cada em “Adicionar à lista”.</p>
        </div>
        <button className="button" disabled={preparing} onClick={() => void prepare()}><PlusIcon />{preparing ? 'Incluindo…' : 'Incluir mimos sugeridos'}</button>
      </div>
      {notice && <div className="mt-4">{notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <ErrorState message={notice.text} />}</div>}
    </section>}
    {!empty && <ListSummary listed={listed.data} failed={listed.errorUpdatedAt > listed.dataUpdatedAt} focus={focusSummary}>
      {/* Atalho abaixo do divisor, como nos cards de evento. Enquanto a conferência não
          responde, ainda não se sabe se a lista está vazia (destaque) ou não (atalho). */}
      {!closed && (listed.data || listed.errorUpdatedAt > listed.dataUpdatedAt) && <div className="card-actions card-shortcuts">
        <p className="card-hint" id="suggested-hint">Faltou algum mimo sugerido? O atalho inclui de novo os que faltam, inclusive os que você removeu.</p>
        <button className="secondary btn-sm" aria-describedby="suggested-hint" disabled={preparing} onClick={() => void prepare()}><PlusIcon size={18} />{preparing ? 'Incluindo…' : 'Incluir mimos sugeridos'}</button>
        {notice && <div className="card-hint">{notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <ErrorState message={notice.text} />}</div>}
      </div>}
    </ListSummary>}
    {closed && <p className="notice mt-6">Evento encerrado. A lista está disponível apenas para consulta.</p>}
    <nav aria-label="Categorias de presentes" className="mt-10"><div className="segmented">{(['fralda', 'mimo'] as Category[]).map(value => <button key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setPage(0); setTotal(null); setRemoved({ text: '', count: 0 }); resetSelection() }}>{categoryLabels[value]}</button>)}</div></nav>
    {/* Card no padrão dos cards de evento: cabeçalho (título, contador, descrição), divisor
        e as linhas. O atalho de incluir fica no cabeçalho: numa lista longa, embaixo ele sumiria. */}
    <section key={`list-${category}`} aria-labelledby="list-title" className="card card-stack list-card fade-swap mt-6">
      <header className="card-header">
      <div className="list-toolbar">
        <h2 id="list-title" className="card-title text-h2">{categoryLabels[category]} na lista</h2>
        {/* Some enquanto carrega e na lista vazia: lá o próprio estado vazio já diz o que há. */}
        {count > 0 && <span className="badge badge-neutral list-count">{count} {count === 1 ? 'item' : 'itens'}</span>}
        {/* Com um item só, o remover da linha já basta. */}
        {!closed && (selecting || rows.length > 1) && <button type="button" className="secondary btn-sm" aria-pressed={selecting} onClick={() => resetSelection(!selecting)}><CheckIcon size={18} />{selecting ? <>Cancelar<span className="sr-only"> seleção de itens</span></> : <>Selecionar<span className="sr-only"> itens</span></>}</button>}
        {!closed && !catalogComplete && <a className="secondary btn-sm list-toolbar-cta" href="#adicionar" onClick={event => {
          const target = document.getElementById('adicionar')
          if (!target) return
          // Sem entrada no histórico: no celular o primeiro "voltar" só tiraria o `#adicionar`.
          event.preventDefault(); target.scrollIntoView({ block: 'start' }); target.focus()
        }}><PlusIcon size={18} />Adicionar à lista</a>}
      </div>
      {/* A regra está no presente: some com a lista vazia (lá importa o próximo passo) e no
          evento encerrado (contradiria o aviso logo acima). */}
      {!closed && count > 0 && <p className="card-description">{category === 'fralda' ? 'Os convidados reservam pacotes até a quantidade pedida em cada tamanho.' : 'Sem limite de quantidade. Cada convidado informa quantos vai levar.'}</p>}
      {/* No cabeçalho, e não entre ele e as linhas: a linha reservada do aviso não abre um vão no card. */}
      {query.data && <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} retryLabel="Recarregar lista" label="Atualizando…" />}
      </header>
      {selecting && !closed && <SelectionBar label="Seleção de itens da lista" className="mt-2" count={chosen.length} total={rows.length}
        onAll={on => { setPicked(on ? new Set(rows.map(item => item.id)) : new Set()); setConfirmBatch(false); setBatchError(null) }}
        action={{ label: 'Remover selecionados', icon: <TrashIcon size={18} />, variant: 'danger', disabled: !chosen.length || removing, expanded: confirmBatch, onClick: () => setConfirmBatch(true) }}
        confirm={confirmBatch && chosen.length ? {
          question: `Remover ${chosen.length === 1 ? '1 item' : `${chosen.length} itens`} da lista? Os convidados deixam de ver ${chosen.length === 1 ? 'este presente' : 'estes presentes'}.${chosen.some(item => item.product.event_id) ? ' Os mimos criados por você serão apagados.' : ''}`,
          icon: <TrashIcon size={18} />, label: removing ? 'Removendo…' : `Sim, remover ${chosen.length === 1 ? '1 item' : `${chosen.length} itens`}`, busy: removing,
          onConfirm: () => void removeChosen(chosen), onCancel: () => { setConfirmBatch(false); setBatchError(null) },
        } : null}>
        {batchError && <ErrorState message={batchError} />}
      </SelectionBar>}
      {query.isPending && !(failedLast(query) && listError) ? <><LoadingState>Carregando a lista…</LoadingState><ListSkeleton /></> : !query.data ? <div className="mt-5"><ErrorState message={errorMessage(listError)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar lista" /></div> : <>
        {removed.text && <p ref={removedNotice} tabIndex={-1} role="status" className="state state-success mt-3">{removed.text}</p>}
        {!query.data.count ? <div className="mt-3"><EmptyState title={category === 'fralda' ? 'Nenhum tamanho de fralda na lista.' : 'Nenhum mimo na lista.'}>{closed ? 'Nenhum presente foi incluído nesta categoria.' : category === 'fralda' ? 'Escolha os tamanhos e quantos pacotes de cada em “Adicionar à lista”.' : 'Inclua os mimos sugeridos ou adicione os seus em “Adicionar à lista”.'}</EmptyState></div> : <>
          {/* G4b.3: "sem limite" é regra da categoria e aparece uma vez, na descrição do card — não em cada linha. */}
          <ul className="item-rows stagger">{(category === 'fralda' ? bySize(query.data.items) : query.data.items).map(item => <li key={item.id}><ItemRow item={item} closed={closed} onRemoved={onRemoved}
            selecting={selecting} picked={picked.has(item.id)} onPick={on => pick(item.id, on)} /></li>)}</ul>
        </>}
      </>}
      {/* Fora dos ramos de estado: a paginação continua montada ao carregar e na falha, e o foco não cai. */}
      {total !== null && <Pagination page={page} count={total} pageSize={PAGE_SIZE} onChange={next => { setPage(next); resetSelection(selecting) }} label="Paginação da lista" />}
    </section>
    {!closed && <Catalog key={category} eventId={eventId} category={category} listed={listed.data} listedFailed={listed.errorUpdatedAt > listed.dataUpdatedAt} listedFetching={listed.isFetching} retryListed={() => void listed.refetch()} onComplete={setCatalogComplete} />}
  </div>
}
// §10: enquanto a lista carrega, o espaço reservado tem a forma das linhas. O anúncio
// fica com o LoadingState ao lado; aqui é só desenho.
function ListSkeleton() {
  return <ul className="item-rows" aria-hidden="true">{[70, 52, 84].map((width, index) =>
    <li key={index}><div className="item-row">
      <div className="item-row-text"><Skeleton width={`${width}%`} height="1.25rem" /></div>
      <span className="item-row-remove"><Skeleton width="1.25rem" height="1.25rem" /></span>
    </div></li>)}</ul>
}
// G4b.2: pacotes pedidos por tamanho e mimos na lista. Só apresentação do que a
// consulta devolveu; reservas e progresso ficam no Painel.
const sizes: DiaperSize[] = ['P', 'M', 'G', 'XG']
function ListSummary({ listed, failed, focus, children }: { listed?: ListedItem[]; failed: boolean; focus: boolean; children: ReactNode }) {
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (focus) title.current?.focus() }, [focus])
  const diapers = listed?.filter(row => row.category === 'fralda') ?? []
  const treats = listed?.filter(row => row.category === 'mimo').length ?? 0
  return <section aria-labelledby="list-summary" className="card card-stack mt-8">
    <header className="card-header">
      <h2 id="list-summary" ref={title} tabIndex={-1} className="card-title text-h2">Lista do chá</h2>
      <p className="card-description">O que os convidados veem pelo link do convite.</p>
    </header>
    {/* Sem total de pacotes: o front não soma agregados (regra 6); ele vem com summary.diapers do servidor. */}
    {listed ? <>
      <ul className="size-chips" aria-label="Pacotes pedidos por tamanho">{sizes.map(size => {
        const row = diapers.find(item => item.diaper_size === size)
        return <li key={size} className={row ? '' : 'text-muted'}><strong>{size}</strong> {row ? `${row.quantity_requested ?? 0} ${row.quantity_requested === 1 ? 'pacote' : 'pacotes'}` : 'fora da lista'}</li>
      })}</ul>
      <p><strong>{treats}</strong> {treats === 1 ? 'mimo na lista' : 'mimos na lista'}, sem limite de quantidade.</p>
    {/* A falha já tem aviso com nova tentativa no catálogo, e a consulta se repete sozinha. */}
    </> : failed ? <p className="text-muted">Não foi possível conferir a lista agora.</p> : <LoadingState>Conferindo a lista…</LoadingState>}
    {children}
  </section>
}
// G4b.3: uma linha por item, sem um cartão por tamanho de fralda nem por mimo.
function ItemRow({ item, closed, onRemoved, selecting, picked, onPick }: {
  item: EventItem; closed: boolean; onRemoved: (title: string) => void; selecting: boolean; picked: boolean; onPick: (on: boolean) => void
}) {
  const titleId = useId()
  const [baseline, setBaseline] = useState(item)
  const [quantity, setValue] = useState(String(item.quantity_requested ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  // "Recarregar quantidade" é o único jeito de sair do erro e some ao ser usado:
  // sem isso o foco cairia no <body> e o próximo Tab voltaria ao topo da página.
  const [reloaded, setReloaded] = useState(0)
  const [confirmReload, setConfirmReload] = useState(false)
  const reloadNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (reloaded) reloadNotice.current?.focus() }, [reloaded])
  const cache = useQueryClient()
  const unchanged = quantity === String(baseline.quantity_requested ?? '')
  async function save(e: FormEvent) {
    e.preventDefault()
    const value = parseQuantity(quantity)
    if (value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy || closed || unchanged) return
    if (!navigator.onLine) { setError(errorMessage(new Error('OFFLINE'))); return }
    setBusy(true); setError(null); setMessage('')
    try {
      const saved = await setQuantity(baseline, value)
      setBaseline({ ...baseline, ...saved }); setValue(String(saved.quantity_requested ?? ''))
      // Lista e totais do evento são reconsultados depois do resultado confirmado.
      await cache.invalidateQueries({ queryKey: giftKeys.items(item.event_id) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(item.event_id) })
      setMessage('Quantidade atualizada.')
    } catch (cause) {
      setError(errorMessage(cause))
      await cache.invalidateQueries({ queryKey: giftKeys.items(item.event_id) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(item.event_id) })
    } finally { setBusy(false) }
  }
  // Maior, e não diferente: uma resposta antiga da consulta periódica que chegue
  // depois de salvar não deve ser anunciada como alteração de outra sessão.
  const outdated = item.version > baseline.version
  const notes = outdated || error || message
  function doReloadQuantity() {
    setBaseline(item); setValue(String(item.quantity_requested ?? '')); setError(null); setMessage('Quantidade recarregada.'); setReloaded(count => count + 1)
  }
  return <article className="item-row" aria-labelledby={titleId}>
    <div className="item-row-text">
      <div className="item-row-head">
        {/* O selo do tamanho identifica a linha; na aba Mimos o próprio título da seção já diz a categoria. */}
        {item.category === 'fralda' && <StatusBadge tone="neutral">Tamanho {item.diaper_size}</StatusBadge>}
        <h3 id={titleId} className="item-row-title">{item.product.title}</h3>
        {item.product.event_id ? <StatusBadge tone="brand">Criado por você</StatusBadge> : !item.product.active && <StatusBadge tone="warning">Fora do catálogo</StatusBadge>}
      </div>
      {item.product.event_id && item.product.description && <p className="item-row-description whitespace-pre-line break-words">{item.product.description}</p>}
      {!item.product.event_id && !item.product.active && <p className="item-row-description">Este produto saiu do catálogo. Ele continua na sua lista.</p>}
    </div>
    {item.category === 'fralda' && <form onSubmit={save} className="item-row-form">
      <QuantityField context={item.product.title} unit="pacotes" value={quantity} max={10000} disabled={busy || closed} onChange={text => { setValue(text); setMessage('') }} />
      {/* busy (aria-disabled) em vez de disabled: o foco fica no botão durante e depois do envio. */}
      {!closed && <Button type="submit" variant="secondary" size="sm" busy={busy || unchanged}>{busy ? 'Salvando…' : 'Atualizar quantidade'}</Button>}
    </form>}
    {/* Remover vem antes dos avisos: o botão fica na primeira linha, e o Tab segue a ordem da tela. */}
    {/* Na seleção, a caixa de marcar ocupa o lugar do remover; o nome vem do título. */}
    {!closed && (selecting ? <label className="choice card-select item-row-remove"><input type="checkbox" checked={picked} onChange={e => onPick(e.target.checked)} /><span className="sr-only">Selecionar {item.product.title}</span></label>
      : <RemoveItem item={item} disabled={busy} onRemoved={onRemoved} />)}
    {notes && <div className="item-row-notes">
      {outdated && <p role="status" className="text-sm">Existe uma versão mais recente desta quantidade.</p>}
      {error && <ErrorState message={error} />}
      {(error || outdated) && <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => {
        if (!unchanged) { setConfirmReload(true); return }
        doReloadQuantity()
      }}>Recarregar quantidade</Button>}
      {/* O foco só vem para cá depois do "Recarregar": salvar mantém o foco no botão. */}
      {message && <p ref={reloadNotice} tabIndex={-1} role="status" className="state state-success">{message}</p>}
    </div>}
    <ConfirmDialog open={confirmReload} title="Descartar a quantidade digitada?"
      description="A versão salva será carregada no lugar do que você digitou." confirmLabel="Descartar e recarregar" tone="danger"
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); doReloadQuantity() }} />
  </article>
}
// Remover pede confirmação na própria linha. Com reserva ativa o servidor recusa,
// e o motivo aparece aqui; a lista é reconsultada para mostrar o estado real.
function RemoveItem({ item, disabled, onRemoved }: { item: EventItem; disabled: boolean; onRemoved: (title: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Com reserva ativa não adianta insistir: some o "Remover" e fica só "Fechar".
  const [blocked, setBlocked] = useState(false)
  const errorText = useRef<HTMLParagraphElement>(null)
  const panelId = useId()
  const question = useRef<HTMLParagraphElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  // Trava síncrona: o clique duplo chega antes de o botão ficar ocupado.
  const sending = useRef(false)
  const cache = useQueryClient()
  useEffect(() => { if (confirming) question.current?.focus() }, [confirming])
  // O botão focado some com o bloqueio: o foco vai para o motivo.
  useEffect(() => { if (blocked) errorText.current?.focus() }, [blocked])
  function cancel() { setConfirming(false); setError(null); setBlocked(false); trigger.current?.focus() }
  async function remove() {
    if (sending.current) return
    if (!navigator.onLine) { setError(errorMessage(new Error('OFFLINE'))); return }
    sending.current = true; setBusy(true); setError(null)
    try {
      await removeItem(item)
      onRemoved(item.product.title)
      await cache.invalidateQueries({ queryKey: giftKeys.items(item.event_id) })
    } catch (cause) {
      const code = (cause as Error).message
      // Outra aba já removeu: o resultado é o que a pessoa pediu, e o cartão vai sumir.
      if (code === 'ITEM_NOT_FOUND') onRemoved(item.product.title)
      else { setError(code === 'ITEM_VERSION_CONFLICT' ? 'Este presente mudou em outra aba. A lista foi atualizada: confira e confirme de novo.' : errorMessage(cause)); setBlocked(code === 'ITEM_HAS_RESERVATIONS') }
      await cache.invalidateQueries({ queryKey: giftKeys.items(item.event_id) })
    } finally { sending.current = false; setBusy(false) }
  }
  // §5.2: ícone em repouso neutro, com o tom destrutivo só no hover/foco. O `title` dá
  // o rótulo a quem usa mouse e repete o nome acessível de propósito: com textos
  // diferentes, o leitor de tela lê o nome e depois a descrição, em cada linha da lista.
  const removeLabel = `Remover da lista: ${item.product.title}`
  return <>
    <button ref={trigger} type="button" className="btn-icon item-row-remove" disabled={disabled} aria-expanded={confirming} aria-controls={panelId}
      aria-label={removeLabel} title={removeLabel} onClick={() => confirming ? cancel() : setConfirming(true)}><TrashIcon /></button>
    {confirming && <div id={panelId} className="card-disclosure item-row-confirm">
      <p ref={question} tabIndex={-1}>Remover “{item.product.title}” da lista? Os convidados deixam de ver este presente.{item.product.event_id ? ' Este mimo foi criado por você e será apagado.' : ''}</p>
      <div className="flow-actions">
        {!blocked && <Button variant="danger" size="sm" className="btn-danger-strong" busy={busy} onClick={() => void remove()}><TrashIcon size={18} />{busy ? 'Removendo…' : 'Remover'}</Button>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>{blocked ? 'Fechar' : 'Cancelar'}</Button>
      </div>
      {error && <p ref={errorText} tabIndex={-1} role="alert" className="error">{error}</p>}
    </div>}
  </>
}
// Mimo que não está no catálogo: só nome e descrição, sem limite, só para este evento.
function CustomTreatForm({ eventId }: { eventId: string }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const sending = useRef(false)
  const nameField = useRef<HTMLInputElement>(null)
  const [nameInvalid, setNameInvalid] = useState(false)
  const errorId = useId()
  const cache = useQueryClient()
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    if (!title.trim()) { setError('Informe o nome do mimo.'); setNameInvalid(true); nameField.current?.focus(); return }
    if (!navigator.onLine) { setError(errorMessage(new Error('OFFLINE'))); return }
    sending.current = true; setBusy(true); setError(null); setNameInvalid(false); setMessage('')
    try {
      await addCustomTreat(eventId, title, description)
      setMessage(`“${title.trim()}” entrou na lista.`); setTitle(''); setDescription('')
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
    } catch (cause) {
      const code = (cause as Error).message
      setNameInvalid(code === 'ITEM_ALREADY_EXISTS' || code === 'INVALID_TREAT')
      setError(code === 'ITEM_ALREADY_EXISTS' ? 'Já existe um mimo com esse nome na lista.' : errorMessage(cause))
    } finally { sending.current = false; setBusy(false) }
  }
  return <section aria-labelledby="custom-treat" className="card card-stack mt-6">
    <header className="card-header">
      <h3 id="custom-treat" className="card-title">Adicionar mimo próprio</h3>
      <p className="card-description">Escreva o nome de qualquer mimo. Vale só para este evento, sem limite de quantidade.</p>
    </header>
    <form onSubmit={submit} className="grid gap-4">
      {/* readOnly, e não disabled: com Enter no campo, o foco continua nele durante o envio. */}
      <label className="field">Nome do mimo<input ref={nameField} maxLength={160} value={title} readOnly={busy} aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? errorId : undefined} onChange={e => { setTitle(e.target.value); setMessage(''); setError(null); setNameInvalid(false) }} placeholder="Ex.: Livro de pano" /></label>
      <label className="field">Descrição (opcional)<textarea rows={2} maxLength={2000} value={description} readOnly={busy} onChange={e => { setDescription(e.target.value); setMessage('') }} /></label>
      <div className="card-actions card-shortcuts">
        <Button type="submit" variant="secondary" size="sm" busy={busy}><PlusIcon size={18} />{busy ? 'Adicionando…' : 'Adicionar mimo'}</Button>
      </div>
    </form>
    {message && <SuccessMessage>{message}</SuccessMessage>}
    {error && <p id={errorId} role="alert" className="error">{error}</p>}
  </section>
}
// Uma seção só para incluir: mimo próprio (na aba Mimos) e as sugestões do catálogo
// que ainda não estão na lista. O catálogo é pequeno e vem inteiro, sem busca.
function Catalog({ eventId, category, listed, listedFailed, listedFetching, retryListed, onComplete }: {
  eventId: string; category: Category; listed?: { product_id: string; diaper_size: DiaperSize | null }[]; listedFailed: boolean; listedFetching: boolean; retryListed: () => void; onComplete: (complete: boolean) => void
}) {
  const { session } = useAuth()
  const query = useQuery({ queryKey: [...giftKeys.catalog, session?.user.id, category], queryFn: () => listProducts('', 0, category, CATALOG_LIMIT) })
  const catalogError = useLastError(query.error)
  const cache = useQueryClient()
  // A sugestão incluída some da lista: o foco vai para o aviso, e não para o início da página.
  const [added, setAdded] = useState({ text: '', count: 0 })
  const addedNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (added.count) addedNotice.current?.focus() }, [added])
  const announce = (text: string) => setAdded(current => ({ text, count: current.count + 1 }))
  // Pacotes de cada linha guardados aqui, e não na linha: o atalho de fraldas envia todos.
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const quantityOf = (product: Product) => quantities[product.id] ?? '1'
  // Fralda é por tamanho: outro produto do mesmo tamanho também conta como já incluído.
  const isListed = (product: Product) => listed?.some(row => row.product_id === product.id || (product.diaper_size !== null && row.diaper_size === product.diaper_size))
  // Sem saber o que já está na lista (falha), mostra tudo: o banco recusa repetição.
  // Fraldas do menor ao maior tamanho, como na lista acima (o catálogo vem por título).
  const filtered = query.data?.products.filter(product => listedFailed || !isListed(product)) ?? []
  const suggestions = category === 'fralda' ? bySize(filtered) : filtered
  // Um produto por tamanho no atalho: o banco também identifica a fralda pelo tamanho.
  const bulk = category === 'fralda' ? suggestions.filter((product, at) => product.diaper_size && suggestions.findIndex(other => other.diaper_size === product.diaper_size) === at) : []
  // Seleção de várias sugestões (padrão de "Seus eventos"); só as que ainda estão na tela contam.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const chosen = suggestions.filter(product => picked.has(product.id))
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const batchSending = useRef(false)
  const bulkHint = useId()
  function toggleSelecting() { setSelecting(on => !on); setPicked(new Set()); setBatchError(null) }
  function pick(id: string, on: boolean) { setPicked(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next }); setBatchError(null) }
  // Atalho e seleção usam o mesmo lote: entram todos ou nenhum (add_event_items).
  async function addBatch(products: Product[]) {
    if (batchSending.current || !products.length) return
    const items: { product_id: string; quantity: number | null }[] = []
    for (const product of products) {
      const value = product.category === 'fralda' ? parseQuantity(quantityOf(product)) : null
      if (product.category === 'fralda' && value === null) { setBatchError(`Confira os pacotes de ${product.title}: informe uma quantidade inteira entre 1 e 10.000.`); return }
      items.push({ product_id: product.id, quantity: value })
    }
    if (!navigator.onLine) { setBatchError(errorMessage(new Error('OFFLINE'))); return }
    batchSending.current = true; setBatchBusy(true); setBatchError(null)
    try {
      const entered = await addItems(eventId, items)
      // O que o servidor pulou já estava na lista (outra aba ou a lista não conferida).
      announce(addedText(products.filter(product => entered.includes(product.id)), products.filter(product => !entered.includes(product.id))))
      setSelecting(false); setPicked(new Set())
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
    } catch (cause) {
      // Tudo ou nada: com a recusa do servidor, nada entrou.
      setBatchError((cause as Error).message === 'ITEM_ALREADY_EXISTS'
        ? `Um item da lista tem o mesmo nome de ${category === 'fralda' ? 'um destes tamanhos' : 'uma das sugestões escolhidas'}, e nada foi incluído. Adicione um por vez para ver qual.`
        : errorMessage(cause))
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(eventId) })
    } finally { batchSending.current = false; setBatchBusy(false) }
  }
  const noun = category === 'fralda' ? 'tamanhos de fralda' : 'mimos'
  // Fraldas completas: sem sugestão e sem mimo próprio, a seção inteira ficaria vazia.
  // O aviso de inclusão segura a seção até o fim, para o foco não cair no vazio.
  const complete = category === 'fralda' && !!listed && !listedFailed && !added.text && !!query.data?.count
    && !suggestions.length && query.data.count <= query.data.products.length
  useEffect(() => { onComplete(complete) }, [complete, onComplete])
  if (complete) return <p className="mt-10 text-muted">Todos os tamanhos de fralda já estão na lista. Para pedir mais ou menos pacotes, ajuste a quantidade de cada tamanho acima.</p>
  // `tabIndex` no alvo do atalho: o “Adicionar à lista” do cabeçalho leva o foco para cá,
  // e não só a rolagem — quem usa teclado continua de onde a página parou.
  return <section id="adicionar" tabIndex={-1} aria-labelledby="catalog-title" className="mt-14 border-t border-stone-300 pt-10">
    <h2 id="catalog-title" className="text-2xl font-bold">Adicionar à lista</h2>
    {category === 'mimo' && <CustomTreatForm eventId={eventId} />}
    <section aria-labelledby="catalog-suggestions" className="card card-stack mt-6">
      <header className="card-header">
        <div className="list-toolbar">
          <h3 id="catalog-suggestions" className="card-title me-auto">Sugestões do catálogo</h3>
          {/* Com uma sugestão só, o "Adicionar" da linha já basta. */}
          {(selecting || suggestions.length > 1) && <button type="button" className="secondary btn-sm" aria-pressed={selecting} onClick={toggleSelecting}><CheckIcon size={18} />{selecting ? <>Cancelar<span className="sr-only"> seleção de sugestões</span></> : <>Selecionar<span className="sr-only"> sugestões</span></>}</button>}
        </div>
        <p className="card-description">{category === 'fralda' ? 'Informe os pacotes de cada tamanho e adicione.' : 'Mimos comuns em chá de bebê que ainda não estão na sua lista.'}</p>
      </header>
      {/* Incluir não apaga nada: a ação age direto, sem confirmação. */}
      {selecting && <SelectionBar label="Seleção de sugestões" className="mt-2" count={chosen.length} total={suggestions.length}
        onAll={on => { setPicked(on ? new Set(suggestions.map(product => product.id)) : new Set()); setBatchError(null) }}
        action={{ label: batchBusy ? 'Adicionando…' : 'Adicionar selecionados', icon: <PlusIcon size={18} />, variant: 'secondary', busy: batchBusy, disabled: !chosen.length, onClick: () => void addBatch(chosen) }}>
        {batchError && <ErrorState message={batchError} />}
      </SelectionBar>}
      {listedFailed && <div className="mt-4"><ErrorState message="Não foi possível conferir o que já está na lista. Se um item já estiver incluído, o sistema recusa a repetição." busy={listedFetching} onRetry={retryListed} retryLabel="Conferir a lista de novo" /></div>}
      {added.text && <p ref={addedNotice} tabIndex={-1} role="status" className="state state-success mt-4">{added.text}</p>}
      {(query.isPending && !(failedLast(query) && catalogError)) || (!listed && !listedFailed) ? <LoadingState>Carregando sugestões…</LoadingState>
        : !query.data ? <div className="mt-4"><ErrorState message={errorMessage(catalogError)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar sugestões" /></div>
        : !query.data.count ? <p className="mt-3 text-muted">O catálogo ainda não tem {noun}.</p>
        : !suggestions.length && query.data.count <= query.data.products.length ? <p className="mt-3 text-muted">{category === 'mimo' ? 'Você já adicionou todas as sugestões. Para incluir outros mimos, use o formulário acima.' : `Todos os ${noun} do catálogo já estão na lista.`}</p>
        : <>{query.data.count > query.data.products.length && <p className="mt-3 text-muted">Mostrando {query.data.products.length} de {query.data.count} sugestões do catálogo.</p>}<ul className="catalog-rows stagger mt-4">{suggestions.map(product => <li key={product.id}><ProductCard product={product} eventId={eventId} locked={batchBusy}
            selecting={selecting} picked={picked.has(product.id)} onPick={on => pick(product.id, on)}
            quantity={quantityOf(product)} onQuantity={text => { setQuantities(current => ({ ...current, [product.id]: text })); setBatchError(null) }}
            onAdded={title => announce(`“${title}” entrou na lista.`)} /></li>)}</ul>
          {/* Com um tamanho só, o "Adicionar" da linha já faz o mesmo; na seleção, a barra assume.
              O foco fica no botão (aria-disabled) durante o envio e depois vai para o aviso. */}
          {bulk.length > 1 && !selecting && <div className="card-actions card-shortcuts">
            <p className="card-hint" id={bulkHint}>Inclui os tamanhos {sizeList(bulk.map(product => product.diaper_size as DiaperSize))} de uma vez, cada um com os pacotes informados na própria linha.</p>
            <Button variant="secondary" size="sm" busy={batchBusy} aria-describedby={bulkHint} onClick={() => void addBatch(bulk)}><PlusIcon size={18} />{batchBusy ? 'Adicionando…' : 'Adicionar todos os tamanhos'}</Button>
            {batchError && <div className="card-hint"><ErrorState message={batchError} /></div>}
          </div>}</>}
    </section>
  </section>
}
// "P, M e G": a lista em português, como o leitor de tela também lê.
const listFormat = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })
const sizeList = (sizes: DiaperSize[]) => listFormat.format(sizes)
// Fraldas pelo tamanho; mimos pelo nome até três, e pela contagem acima disso.
function names(products: Product[]) {
  if (products[0]?.category === 'fralda') return sizeList(products.map(product => product.diaper_size as DiaperSize))
  return products.length <= 3 ? listFormat.format(products.map(product => `“${product.title}”`)) : `${products.length} mimos`
}
function addedText(entered: Product[], skipped: Product[]) {
  const already = skipped.length ? `${names(skipped)} já ${skipped.length === 1 ? 'estava' : 'estavam'} na lista.` : ''
  if (!entered.length) return already
  const diaper = entered[0].category === 'fralda'
  const subject = diaper ? `${entered.length === 1 ? 'Tamanho' : 'Tamanhos'} ${names(entered)}` : names(entered)
  return `${subject} ${entered.length === 1 ? 'entrou' : 'entraram'} na lista.${already ? ` ${already}` : ''}`
}
function ProductCard({ product, eventId, locked, selecting, picked, onPick, quantity, onQuantity, onAdded }: {
  product: Product; eventId: string; locked: boolean; selecting: boolean; picked: boolean; onPick: (on: boolean) => void
  quantity: string; onQuantity: (value: string) => void; onAdded: (title: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cache = useQueryClient()
  const diaper = product.category === 'fralda'
  async function add(e: FormEvent) {
    e.preventDefault()
    // Na seleção, Enter no campo não inclui a linha sozinha: quem inclui é a barra.
    if (selecting) return
    const value = diaper ? parseQuantity(quantity) : null
    if (diaper && value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy || locked) return
    if (!navigator.onLine) { setError(errorMessage(new Error('OFFLINE'))); return }
    setBusy(true); setError(null)
    try {
      await addItem(eventId, product.id, value)
      onAdded(product.title)
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
    } catch (cause) {
      setError(errorMessage(cause))
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(eventId) })
    } finally { setBusy(false) }
  }
  return <article className="catalog-row" aria-labelledby={`produto-${product.id}`}>
    <div className="catalog-row-text">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={`produto-${product.id}`} className="font-semibold">{product.title}</h4>
        {product.platform !== 'manual' && <StatusBadge tone="neutral">{platformLabels[product.platform]}</StatusBadge>}
      </div>
      {!diaper && product.description && <p className="text-sm text-muted whitespace-pre-line break-words">{product.description}</p>}
    </div>
    <form onSubmit={add} className="catalog-row-form">
      {/* Durante o lote a linha trava sem `disabled`: o foco não cai. */}
      {diaper && <QuantityField label="Pacotes" context={product.title} unit="pacotes" value={quantity} max={10000} disabled={busy} busy={locked} onChange={text => { onQuantity(text); setError(null) }} />}
      {/* Na seleção, a caixa de marcar toma o lugar do "Adicionar", como nos cards de evento. */}
      {selecting ? <label className="choice card-select"><input type="checkbox" checked={picked} onChange={e => onPick(e.target.checked)} />Selecionar<span className="sr-only"> {product.title}</span></label>
        : <Button type="submit" variant="secondary" size="sm" busy={busy || locked} aria-label={`Adicionar ${product.title} à lista`}><PlusIcon size={18} />{busy ? 'Adicionando…' : 'Adicionar'}</Button>}
    </form>
    {error && <ErrorState message={error} />}
  </article>
}
