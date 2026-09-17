import { useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent } from '../events/api'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { Button, Pagination, QuantityField, StatusBadge } from '../../components/ui'
import { EventNotFound } from '../events/EventLayout'
import { addItem, giftKeys, listedProducts, listItems, listProducts, PAGE_SIZE, prepareList, setQuantity } from './api'
import { parseQuantity, platformLabels, categoryLabels } from './model'
import type { Category, DiaperSize, EventItem, Product } from './model'

export function GiftListPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  const loadError = useLastError(event.error)
  if (event.isPending && !(failedLast(event) && loadError)) return <LoadingState>Carregando evento…</LoadingState>
  if (event.data === undefined) return <div className="tab-panel"><h2 className="tab-title">Lista de presentes</h2><div className="mt-6"><ErrorState title="Não foi possível abrir a lista." message={errorMessage(loadError)} busy={event.isFetching} onRetry={() => void event.refetch()} /></div></div>
  if (!event.data) return <EventNotFound />
  return <GiftList key={id} eventId={id} closed={event.data.status === 'closed'} />
}
function GiftList({ eventId, closed }: { eventId: string; closed: boolean }) {
  const { session } = useAuth()
  const [category, setCategory] = useState<Category>('fralda')
  const [page, setPage] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const cache = useQueryClient()
  const query = useQuery({ queryKey: [...giftKeys.items(eventId), session?.user.id, category, page], queryFn: () => listItems(eventId, page, category), ...live })
  async function prepare() {
    setPreparing(true); setNotice(null)
    try { const count = await prepareList(eventId); await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) }); setNotice({ ok: true, text: count ? 'Lista do chá preparada.' : 'Os itens do chá já estão na lista.' }) }
    catch (cause) { setNotice({ ok: false, text: errorMessage(cause) }) } finally { setPreparing(false) }
  }
  const listError = useLastError(query.error)
  const listed = useQuery({ queryKey: [...giftKeys.items(eventId), 'listed', session?.user.id], queryFn: () => listedProducts(eventId), ...live })
  const empty = listed.data?.length === 0
  // Sem dado anterior, a nova tentativa volta a consulta para "pending" e zera isError;
  // comparar as datas mantém o aviso na tela durante a tentativa.
  return <div className="tab-panel">
    <h2 className="tab-title">Lista de presentes</h2>
    <p className="mt-4 max-w-2xl text-stone-600">Fraldas por tamanho e mimos de livre escolha. Os convidados veem esta lista pelo link do convite.</p>
    {!closed && <section aria-labelledby="quick-start" className={empty ? 'quick-start mt-8' : 'card mt-8'}>
      {empty && <p className="eyebrow">Recomendado</p>}
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <h2 id="quick-start" className={empty ? 'text-2xl font-bold' : 'text-lg font-bold'}>{empty ? 'Comece com a lista pronta do chá' : 'Lista pronta do chá'}</h2>
          <p className="mt-2 text-stone-600">{empty ? 'Um toque inclui os quatro tamanhos de fralda com a quantidade de pacotes certa e os mimos sugeridos. Depois é só ajustar.' : 'Se algum item da lista pronta ficou de fora, este botão inclui só o que falta.'}</p>
          <ul className="size-chips mt-4" aria-label="Pacotes por tamanho na lista pronta">{[['P', 6], ['M', 19], ['G', 19], ['XG', 6]].map(([size, amount]) => <li key={size}><strong>{size}</strong> · {amount} pacotes</li>)}<li>+ 23 mimos sem limite</li></ul>
        </div>
        <button className={empty ? 'button' : 'secondary'} disabled={preparing} onClick={() => void prepare()}>{preparing ? 'Preparando…' : empty ? 'Preparar lista do chá' : 'Completar a lista do chá'}</button>
      </div>
      {notice && <div className="mt-4">{notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <ErrorState message={notice.text} />}</div>}
    </section>}
    {closed && <p className="notice mt-6">Evento encerrado. A lista está disponível apenas para consulta.</p>}
    <nav aria-label="Categorias de presentes" className="mt-10"><div className="segmented">{(['fralda', 'mimo'] as Category[]).map(value => <button key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setPage(0) }}>{categoryLabels[value]}</button>)}</div></nav>
    <section key={`list-${category}`} aria-labelledby="list-title" className="fade-swap mt-6">
      <h2 id="list-title" className="text-2xl font-bold">{categoryLabels[category]} na lista</h2>
      {query.isPending && !(failedLast(query) && listError) ? <LoadingState>Carregando a lista…</LoadingState> : !query.data ? <div className="mt-5"><ErrorState message={errorMessage(listError)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar lista" /></div> : <>
        <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} label={`${query.data.count} ${query.data.count === 1 ? 'item' : 'itens'} · atualizando…`} />
        {!query.data.count ? <div className="mt-3"><EmptyState title={category === 'fralda' ? 'Nenhum tamanho de fralda na lista.' : 'Nenhum mimo na lista.'}>{closed ? 'Nenhum presente foi incluído nesta categoria.' : 'Use a lista pronta do chá acima ou inclua um item pelo catálogo abaixo.'}</EmptyState></div> : <>
          <div className="stagger mt-3 grid gap-5 md:grid-cols-2">{query.data.items.map(item => <ItemCard key={item.id} item={item} closed={closed} />)}</div>
          <Pagination page={page} count={query.data.count} pageSize={PAGE_SIZE} onChange={setPage} label="Paginação da lista" />
        </>}
      </>}
    </section>
    {!closed && <Catalog key={category} eventId={eventId} category={category} listed={listed.data} listedFailed={listed.errorUpdatedAt > listed.dataUpdatedAt} listedFetching={listed.isFetching} retryListed={() => void listed.refetch()} />}
  </div>
}
function ItemCard({ item, closed }: { item: EventItem; closed: boolean }) {
  const [baseline, setBaseline] = useState(item)
  const [quantity, setValue] = useState(String(item.quantity_requested ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const cache = useQueryClient()
  const unchanged = quantity === String(baseline.quantity_requested ?? '')
  async function save(e: FormEvent) {
    e.preventDefault()
    const value = parseQuantity(quantity)
    if (value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy || closed || unchanged) return
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
  return <article className="card card-stack">
    <header className="card-header">
      <div className="card-badges">
        <StatusBadge tone="neutral">{item.category === 'fralda' ? `Tamanho ${item.diaper_size}` : 'Mimo'}</StatusBadge>
        {!item.product.active && <StatusBadge tone="warning">Fora do catálogo</StatusBadge>}
      </div>
      <h3 className="card-title">{item.product.title}</h3>
      {!item.product.active && <p className="card-description">Este produto saiu do catálogo. Ele continua na sua lista.</p>}
    </header>
    {item.category === 'mimo' ? <p className="availability-text">Sem limite de quantidade. Cada convidado informa quantos vai levar.</p> : <form onSubmit={save} className="flex flex-col gap-3">
      <QuantityField context={item.product.title} unit="pacotes" value={quantity} max={10000} disabled={busy || closed} onChange={text => { setValue(text); setMessage('') }} />
      {/* busy (aria-disabled) em vez de disabled: o foco fica no botão durante e depois do envio. */}
      {!closed && <Button type="submit" variant="secondary" className="self-start" busy={busy || unchanged}>{busy ? 'Salvando…' : 'Atualizar quantidade'}</Button>}
    </form>}
    {outdated && <p role="status" className="text-sm">Existe uma versão mais recente desta quantidade.</p>}
    {error && <ErrorState message={error} />}
    {(error || outdated) && <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => {
      if (!unchanged && !window.confirm('Descartar a quantidade digitada e carregar a versão salva?')) return
      setBaseline(item); setValue(String(item.quantity_requested ?? '')); setError(null); setMessage('Quantidade recarregada.')
    }}>Recarregar quantidade</Button>}
    {message && <SuccessMessage>{message}</SuccessMessage>}
  </article>
}
function Catalog({ eventId, category, listed, listedFailed, listedFetching, retryListed }: {
  eventId: string; category: Category; listed?: { product_id: string; diaper_size: DiaperSize | null }[]; listedFailed: boolean; listedFetching: boolean; retryListed: () => void
}) {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const query = useQuery({ queryKey: [...giftKeys.catalog, session?.user.id, category, term, page], queryFn: () => listProducts(term, page, category) })
  const catalogError = useLastError(query.error)
  function submit(e: FormEvent) { e.preventDefault(); setTerm(search.trim()); setPage(0) }
  // Fralda é por tamanho: outro produto do mesmo tamanho também conta como já incluído.
  const isListed = (product: Product) => listed?.some(row => row.product_id === product.id || (product.diaper_size !== null && row.diaper_size === product.diaper_size))
  return <section aria-labelledby="catalog-title" className="mt-14 border-t border-stone-300 pt-10">
    <h2 id="catalog-title" className="text-2xl font-bold">Incluir itens avulsos</h2>
    <p className="mt-2 max-w-2xl text-stone-600">Use o catálogo só para algo que não veio na lista pronta. O que já está na lista aparece marcado; para mudar a quantidade, use o cartão acima.</p>
    {listedFailed && <div className="mt-4"><ErrorState message="Não foi possível conferir o que já está na lista. Se um item já estiver incluído, o sistema recusa a repetição." busy={listedFetching} onRetry={retryListed} /></div>}
    <form onSubmit={submit} role="search" className="mt-6 flex flex-wrap items-end gap-3"><label className="field min-w-0 flex-1">Buscar produto<input type="search" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder={category === 'fralda' ? 'Ex.: tamanho M' : 'Ex.: mamadeira'} /></label><button className="secondary">Buscar</button></form>
    {query.isPending && !(failedLast(query) && catalogError) ? <LoadingState>Carregando catálogo…</LoadingState> : !query.data ? <div className="mt-6"><ErrorState message={errorMessage(catalogError)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar catálogo" /></div> : <>
      {!query.data.count ? <div className="mt-6"><EmptyState title={term ? 'Nenhum produto encontrado.' : 'O catálogo ainda não tem produtos disponíveis.'}>{term && 'Tente outro nome.'}</EmptyState></div> : <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{query.data.products.map(product => <ProductCard key={product.id} product={product} eventId={eventId} listed={isListed(product) ?? false} />)}</div>}
      <Pagination page={page} count={query.data.count} pageSize={PAGE_SIZE} onChange={setPage} label="Paginação do catálogo" />
    </>}
  </section>
}
function ProductCard({ product, eventId, listed }: { product: Product; eventId: string; listed: boolean }) {
  const [quantity, setValue] = useState('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cache = useQueryClient()
  const diaper = product.category === 'fralda'
  async function add(e: FormEvent) {
    e.preventDefault()
    const value = diaper ? parseQuantity(quantity) : null
    if (diaper && value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy) return
    setBusy(true); setError(null); setMessage('')
    try {
      await addItem(eventId, product.id, value)
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
      setMessage('Incluído na lista.')
    } catch (cause) {
      setError(errorMessage(cause))
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(eventId) })
    } finally { setBusy(false) }
  }
  return <article className={`card card-stack ${listed ? 'product-listed' : ''}`}>
    <header className="card-header">
      <div className="card-badges">
        {diaper && <StatusBadge tone="neutral">Tamanho {product.diaper_size}</StatusBadge>}
        {product.platform !== 'manual' && <StatusBadge tone="neutral">{platformLabels[product.platform]}</StatusBadge>}
        {listed && <StatusBadge tone="success">Já na lista</StatusBadge>}
      </div>
      <h3 className="card-title">{product.title}</h3>
      {!diaper && product.description && <p className="card-description whitespace-pre-line break-words">{product.description}</p>}
    </header>
    <div className="mt-auto">
      {listed ? <p className="hint">{diaper ? 'Este tamanho já está na lista. Ajuste os pacotes no cartão acima.' : 'Os convidados já podem escolher este mimo.'}</p> :
        <form onSubmit={add} className="flex flex-col gap-3">
          {diaper ? <QuantityField label="Pacotes" context={product.title} unit="pacotes" value={quantity} max={10000} disabled={busy} onChange={text => { setValue(text); setMessage('') }} /> : <p className="hint">Sem limite de quantidade.</p>}
          <Button type="submit" variant="secondary" className="self-start" busy={busy} aria-label={`Adicionar ${product.title} à lista`}>{busy ? 'Adicionando…' : 'Adicionar'}</Button>
        </form>}
    </div>
    {message && <SuccessMessage>{message}</SuccessMessage>}{error && <ErrorState message={error} />}
  </article>
}
