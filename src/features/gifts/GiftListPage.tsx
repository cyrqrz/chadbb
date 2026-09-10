import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent } from '../events/api'
import { errorMessage } from '../../lib/errors'
import { addItem, giftKeys, listItems, listProducts, PAGE_SIZE, setQuantity } from './api'
import { parseQuantity, platformLabels } from './model'
import type { EventItem, Product } from './model'

export function GiftListPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false })
  if (event.isPending) return <p role="status" className="py-12">Carregando evento…</p>
  if (event.isError) return <section className="page"><p role="alert">{errorMessage(event.error)}</p><button className="secondary mt-5" onClick={() => void event.refetch()}>Tentar novamente</button></section>
  if (!event.data) return <section className="page"><h1 className="page-title">Evento não encontrado</h1><Link className="text-link mt-6 inline-block" to="/eventos">Seus eventos</Link></section>
  return <GiftList key={id} eventId={id} title={event.data.title || 'Evento sem título'} closed={event.data.status === 'closed'} />
}
function GiftList({ eventId, title, closed }: { eventId: string; title: string; closed: boolean }) {
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const query = useQuery({ queryKey: [...giftKeys.items(eventId), session?.user.id, page], queryFn: () => listItems(eventId, page), refetchOnWindowFocus: false })
  return <section className="page">
    <Link className="text-link" to={`/eventos/${eventId}`}>← Detalhes do evento</Link>
    <p className="eyebrow mt-7 break-words">{title}</p><h1 className="page-title">Lista de presentes</h1>
    <p className="mt-4 max-w-2xl text-stone-600">Escolha os presentes e quantas unidades gostaria de receber. As reservas dos convidados estarão disponíveis em uma próxima etapa.</p>
    {closed && <p className="notice mt-6">Evento encerrado. A lista está disponível apenas para consulta.</p>}
    <section aria-labelledby="list-title" className="mt-10">
      <h2 id="list-title" className="text-2xl font-semibold">Presentes escolhidos</h2>
      {query.isPending ? <p role="status" className="mt-5">Carregando a lista…</p> : query.isError ? <div className="notice mt-5" role="alert"><p>{errorMessage(query.error)}</p><button className="text-link mt-3" onClick={() => void query.refetch()}>Recarregar lista</button></div> : <>
        {!query.data.count ? <p className="card mt-5">Sua lista ainda está vazia. Escolha um produto no catálogo abaixo.</p> : <>
          <p className="mt-3 text-sm text-stone-600">{query.data.count} {query.data.count === 1 ? 'tipo de presente' : 'tipos de presentes'} na lista.</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">{query.data.items.map(item => <ItemCard key={item.id} item={item} closed={closed} />)}</div>
          <Pagination page={page} count={query.data.count} onChange={setPage} name="lista" />
        </>}
      </>}
    </section>
    {!closed && <Catalog eventId={eventId} />}
  </section>
}
function ItemCard({ item, closed }: { item: EventItem; closed: boolean }) {
  const [baseline, setBaseline] = useState(item)
  const [quantity, setValue] = useState(String(item.quantity_requested))
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
      setBaseline({ ...baseline, ...saved }); setValue(String(saved.quantity_requested))
      await cache.invalidateQueries({ queryKey: giftKeys.items(item.event_id) })
      setMessage('Quantidade atualizada.')
    } catch (cause) {
      setError(errorMessage(cause))
      await cache.invalidateQueries({ queryKey: giftKeys.items(item.event_id) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(item.event_id) })
    } finally { setBusy(false) }
  }
  return <article className="card">
    <span className="badge">{platformLabels[item.product.platform]}</span>
    <h3 className="mt-4 break-words text-xl font-semibold">{item.product.title}</h3>
    {!item.product.active && <p className="mt-2 text-sm text-stone-600">Este produto saiu do catálogo. Ele continua na sua lista.</p>}
    <form onSubmit={save} className="mt-5 space-y-4">
      <label className="field">Quantidade de {item.product.title}<input type="number" min={1} max={10000} step={1} inputMode="numeric" required disabled={busy || closed} value={quantity} onChange={e => { setValue(e.target.value); setMessage('') }} /></label>
      {!closed && <button className="secondary" disabled={busy || quantity === String(baseline.quantity_requested)}>{busy ? 'Salvando…' : 'Atualizar quantidade'}</button>}
    </form>
    {item.version !== baseline.version && <p className="mt-4 text-sm">Existe uma versão mais recente desta quantidade.</p>}
    {error && <p role="alert" className="error mt-4">{error}</p>}
    {(error || item.version !== baseline.version) && <button className="text-link mt-3" disabled={busy} onClick={() => {
      if (quantity !== String(baseline.quantity_requested) && !window.confirm('Descartar a quantidade digitada e carregar a versão salva?')) return
      setBaseline(item); setValue(String(item.quantity_requested)); setError(null); setMessage('Quantidade recarregada.')
    }}>Recarregar quantidade</button>}
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
  </article>
}
function Catalog({ eventId }: { eventId: string }) {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const query = useQuery({ queryKey: [...giftKeys.catalog, session?.user.id, term, page], queryFn: () => listProducts(term, page) })
  function submit(e: FormEvent) { e.preventDefault(); setTerm(search.trim()); setPage(0) }
  return <section aria-labelledby="catalog-title" className="mt-12 border-t border-stone-300 pt-8">
    <h2 id="catalog-title" className="text-2xl font-semibold">Escolha no catálogo</h2>
    <p className="mt-3 text-sm text-stone-600">Produtos selecionados pela organização. Links de lojas serão disponibilizados após validação dos parceiros.</p>
    <form onSubmit={submit} role="search" className="mt-6 flex flex-wrap items-end gap-4"><label className="field min-w-0 flex-1">Buscar produto<input type="search" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder="Ex.: fraldas" /></label><button className="secondary">Buscar</button></form>
    {query.isPending ? <p role="status" className="mt-6">Carregando catálogo…</p> : query.isError ? <div role="alert" className="notice mt-6"><p>{errorMessage(query.error)}</p><button className="text-link mt-3" onClick={() => void query.refetch()}>Recarregar catálogo</button></div> : <>
      {!query.data.count ? <p className="card mt-6">{term ? 'Nenhum produto encontrado. Tente outro nome.' : 'O catálogo ainda não tem produtos disponíveis.'}</p> : <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{query.data.products.map(product => <ProductCard key={product.id} product={product} eventId={eventId} />)}</div>}
      <Pagination page={page} count={query.data.count} onChange={setPage} name="catálogo" />
    </>}
  </section>
}
function ProductCard({ product, eventId }: { product: Product; eventId: string }) {
  const [quantity, setValue] = useState('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cache = useQueryClient()
  async function add(e: FormEvent) {
    e.preventDefault()
    const value = parseQuantity(quantity)
    if (value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy) return
    setBusy(true); setError(null); setMessage('')
    try {
      await addItem(eventId, product.id, value)
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
      setMessage('Produto incluído na lista.')
    } catch (cause) {
      setError(errorMessage(cause))
      await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) })
      await cache.invalidateQueries({ queryKey: eventKeys.detail(eventId) })
    } finally { setBusy(false) }
  }
  return <article className="card flex flex-col">
    <span className="text-sm text-stone-600">{platformLabels[product.platform]}</span>
    <h3 className="mt-3 break-words text-xl font-semibold">{product.title}</h3><p className="mt-3 flex-1 whitespace-pre-line break-words text-stone-600">{product.description}</p>
    <form onSubmit={add} className="mt-5 space-y-4"><label className="field">Unidades de {product.title}<input type="number" min={1} max={10000} step={1} inputMode="numeric" required disabled={busy} value={quantity} onChange={e => { setValue(e.target.value); setMessage('') }} /></label><button className="button" disabled={busy}>{busy ? 'Adicionando…' : 'Adicionar à lista'}</button></form>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}{error && <p role="alert" className="error mt-4">{error}</p>}
  </article>
}
function Pagination({ page, count, onChange, name }: { page: number; count: number; onChange: (page: number) => void; name: string }) {
  if (count <= PAGE_SIZE) return null
  return <nav aria-label={`Paginação do ${name}`} className="mt-6 flex flex-wrap items-center gap-4"><button className="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="secondary" disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => onChange(page + 1)}>Próxima</button></nav>
}
