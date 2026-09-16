import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent } from '../events/api'
import { errorMessage } from '../../lib/errors'
import { live } from '../../lib/query'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { addItem, giftKeys, listedProducts, listItems, listProducts, PAGE_SIZE, prepareList, setQuantity } from './api'
import { parseQuantity, platformLabels, categoryLabels } from './model'
import type { Category, DiaperSize, EventItem, Product } from './model'

export function GiftListPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  if (event.isPending) return <section className="page"><LoadingState>Carregando evento…</LoadingState></section>
  if (event.isError) return <section className="page"><h1 className="page-title">Lista de presentes</h1><div className="mt-6"><ErrorState title="Não foi possível abrir a lista." message={errorMessage(event.error)} busy={event.isFetching} onRetry={() => void event.refetch()} /></div></section>
  if (!event.data) return <section className="page"><h1 className="page-title">Evento não encontrado</h1><p className="mt-4">Confira o endereço e se está na conta correta.</p><Link className="text-link mt-6 inline-block" to="/eventos">← Seus eventos</Link></section>
  return <GiftList key={id} eventId={id} title={event.data.title || 'Evento sem título'} closed={event.data.status === 'closed'} />
}
function GiftList({ eventId, title, closed }: { eventId: string; title: string; closed: boolean }) {
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
  const listed = useQuery({ queryKey: [...giftKeys.items(eventId), 'listed', session?.user.id], queryFn: () => listedProducts(eventId), ...live })
  const empty = listed.data?.length === 0
  // Sem dado anterior, a nova tentativa volta a consulta para "pending" e zera isError;
  // comparar as datas mantém o aviso na tela durante a tentativa.
  return <section className="page">
    <Link className="text-link" to={`/eventos/${eventId}`}>← Detalhes do evento</Link>
    <p className="eyebrow mt-7 break-words">{title}</p><h1 className="page-title">Lista de presentes</h1>
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
      {query.isPending ? <LoadingState>Carregando a lista…</LoadingState> : !query.data ? <div className="mt-5"><ErrorState message={errorMessage(query.error)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar lista" /></div> : <>
        <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} label={`${query.data.count} ${query.data.count === 1 ? 'item' : 'itens'} · atualizando…`} />
        {!query.data.count ? <div className="mt-3"><EmptyState title={category === 'fralda' ? 'Nenhum tamanho de fralda na lista.' : 'Nenhum mimo na lista.'}>{closed ? 'Nenhum presente foi incluído nesta categoria.' : 'Use a lista pronta do chá acima ou inclua um item pelo catálogo abaixo.'}</EmptyState></div> : <>
          <div className="stagger mt-3 grid gap-5 md:grid-cols-2">{query.data.items.map(item => <ItemCard key={item.id} item={item} closed={closed} />)}</div>
          <Pagination page={page} count={query.data.count} onChange={setPage} name="lista" />
        </>}
      </>}
    </section>
    {!closed && <Catalog key={category} eventId={eventId} category={category} listed={listed.data} listedFailed={listed.errorUpdatedAt > listed.dataUpdatedAt} listedFetching={listed.isFetching} retryListed={() => void listed.refetch()} />}
  </section>
}
function ItemCard({ item, closed }: { item: EventItem; closed: boolean }) {
  const [baseline, setBaseline] = useState(item)
  const [quantity, setValue] = useState(String(item.quantity_requested ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const cache = useQueryClient()
  async function save(e: FormEvent) {
    e.preventDefault()
    const value = parseQuantity(quantity)
    if (value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy || closed) return
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
  return <article className="card">
    <span className="badge">{item.category === 'fralda' ? `Tamanho ${item.diaper_size}` : 'Mimo'}</span>
    <h3 className="mt-3 break-words text-xl font-bold">{item.product.title}</h3>
    {!item.product.active && <p className="mt-2 text-sm text-stone-600">Este produto saiu do catálogo. Ele continua na sua lista.</p>}
    {item.category === 'mimo' ? <p className="notice mt-5">Sem limite de quantidade. Cada convidado informa quantos vai levar.</p> : <form onSubmit={save} className="mt-5 space-y-4">
      <label className="field">Quantidade de {item.product.title}<input type="number" min={1} max={10000} step={1} inputMode="numeric" required disabled={busy || closed} value={quantity} onChange={e => { setValue(e.target.value); setMessage('') }} /></label>
      {!closed && <button className="secondary" disabled={busy || quantity === String(baseline.quantity_requested ?? '')}>{busy ? 'Salvando…' : 'Atualizar quantidade'}</button>}
    </form>}
    {outdated && <p role="status" className="mt-4 text-sm">Existe uma versão mais recente desta quantidade.</p>}
    {error && <div className="mt-4"><ErrorState message={error} /></div>}
    {(error || outdated) && <button className="text-link mt-3" disabled={busy} onClick={() => {
      if (quantity !== String(baseline.quantity_requested ?? '') && !window.confirm('Descartar a quantidade digitada e carregar a versão salva?')) return
      setBaseline(item); setValue(String(item.quantity_requested ?? '')); setError(null); setMessage('Quantidade recarregada.')
    }}>Recarregar quantidade</button>}
    {message && <div className="mt-4"><SuccessMessage>{message}</SuccessMessage></div>}
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
  function submit(e: FormEvent) { e.preventDefault(); setTerm(search.trim()); setPage(0) }
  // Fralda é por tamanho: outro produto do mesmo tamanho também conta como já incluído.
  const isListed = (product: Product) => listed?.some(row => row.product_id === product.id || (product.diaper_size !== null && row.diaper_size === product.diaper_size))
  return <section aria-labelledby="catalog-title" className="mt-14 border-t border-stone-300 pt-10">
    <h2 id="catalog-title" className="text-2xl font-bold">Incluir itens avulsos</h2>
    <p className="mt-2 max-w-2xl text-stone-600">Use o catálogo só para algo que não veio na lista pronta. O que já está na lista aparece marcado; para mudar a quantidade, use o cartão acima.</p>
    {listedFailed && <div className="mt-4"><ErrorState message="Não foi possível conferir o que já está na lista. Se um item já estiver incluído, o sistema recusa a repetição." busy={listedFetching} onRetry={retryListed} /></div>}
    <form onSubmit={submit} role="search" className="mt-6 flex flex-wrap items-end gap-3"><label className="field min-w-0 flex-1">Buscar produto<input type="search" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder={category === 'fralda' ? 'Ex.: tamanho M' : 'Ex.: mamadeira'} /></label><button className="secondary">Buscar</button></form>
    {query.isPending ? <LoadingState>Carregando catálogo…</LoadingState> : query.isError ? <div className="mt-6"><ErrorState message={errorMessage(query.error)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar catálogo" /></div> : <>
      {!query.data.count ? <div className="mt-6"><EmptyState title={term ? 'Nenhum produto encontrado.' : 'O catálogo ainda não tem produtos disponíveis.'}>{term && 'Tente outro nome.'}</EmptyState></div> : <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{query.data.products.map(product => <ProductCard key={product.id} product={product} eventId={eventId} listed={isListed(product) ?? false} />)}</div>}
      <Pagination page={page} count={query.data.count} onChange={setPage} name="catálogo" />
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
  return <article className={`card flex flex-col ${listed ? 'product-listed' : ''}`}>
    <div className="flex flex-wrap items-center gap-2">
      {diaper && <span className="badge">Tamanho {product.diaper_size}</span>}
      {product.platform !== 'manual' && <span className="badge">{platformLabels[product.platform]}</span>}
      {listed && <span className="badge badge-success"><span aria-hidden="true">✓</span> Já na lista</span>}
    </div>
    <h3 className="mt-3 break-words text-lg font-bold">{product.title}</h3>
    {!diaper && product.description && <p className="mt-2 whitespace-pre-line break-words text-sm text-stone-600">{product.description}</p>}
    <div className="mt-auto pt-4">
      {listed ? <p className="text-sm text-stone-600">{diaper ? 'Este tamanho já está na lista. Ajuste os pacotes no cartão acima.' : 'Os convidados já podem escolher este mimo.'}</p> :
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">{diaper ? <label className="field w-28">Pacotes<input type="number" min={1} max={10000} step={1} inputMode="numeric" required disabled={busy} value={quantity} aria-label={`Pacotes de ${product.title}`} onChange={e => { setValue(e.target.value); setMessage('') }} /></label> : <p className="w-full text-sm text-stone-600">Sem limite de quantidade.</p>}<button className="button" disabled={busy} aria-label={`Adicionar ${product.title} à lista`}>{busy ? 'Adicionando…' : 'Adicionar'}</button></form>}
    </div>
    {message && <div className="mt-4"><SuccessMessage>{message}</SuccessMessage></div>}{error && <div className="mt-4"><ErrorState message={error} /></div>}
  </article>
}
function Pagination({ page, count, onChange, name }: { page: number; count: number; onChange: (page: number) => void; name: string }) {
  if (count <= PAGE_SIZE) return null
  return <nav aria-label={`Paginação do ${name}`} className="mt-6 flex flex-wrap items-center gap-4"><button className="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="secondary" disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => onChange(page + 1)}>Próxima</button></nav>
}
