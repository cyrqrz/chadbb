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
import { Button, Pagination, QuantityField, Skeleton, StatusBadge } from '../../components/ui'
import { EventNotFound } from '../events/EventLayout'
import { StepCompletion } from '../events/SetupDock'
import { addCustomTreat, addItem, CATALOG_LIMIT, giftKeys, listedProducts, listItems, listProducts, PAGE_SIZE, prepareList, removeItem, setQuantity } from './api'
import { parseQuantity, platformLabels, categoryLabels } from './model'
import type { Category, DiaperSize, EventItem, Product } from './model'
import type { ListedItem } from './api'

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
    try { const count = await prepareList(eventId); await cache.invalidateQueries({ queryKey: giftKeys.items(eventId) }); setFocusSummary(fromEmpty); setNotice({ ok: true, text: !count ? 'Os itens do chá já estão na lista.' : fromEmpty ? 'Lista do chá preparada.' : `${count} ${count === 1 ? 'item da lista pronta voltou' : 'itens da lista pronta voltaram'} para a lista.` }) }
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
  const [removed, setRemoved] = useState({ title: '', count: 0 })
  const removedNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (removed.count) removedNotice.current?.focus() }, [removed])
  function onRemoved(title: string) {
    if (page > 0 && query.data?.items.length === 1) setPage(page - 1)
    setRemoved(current => ({ title, count: current.count + 1 }))
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
    {!closed && empty && <section aria-labelledby="quick-start" className="quick-start mt-8">
      <p className="eyebrow">Recomendado</p>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <h2 id="quick-start" className="text-2xl font-bold">Comece com a lista pronta do chá</h2>
          <p className="mt-2 text-stone-600">Um toque inclui os quatro tamanhos de fralda com a quantidade de pacotes certa e os mimos sugeridos. Depois é só ajustar.</p>
          <ul className="size-chips mt-4" aria-label="Pacotes por tamanho na lista pronta">{[['P', 6], ['M', 19], ['G', 19], ['XG', 6]].map(([size, amount]) => <li key={size}><strong>{size}</strong> · {amount} pacotes</li>)}<li>+ 23 mimos sem limite</li></ul>
        </div>
        <button className="button" disabled={preparing} onClick={() => void prepare()}>{preparing ? 'Preparando…' : 'Preparar lista do chá'}</button>
      </div>
      {notice && <div className="mt-4">{notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <ErrorState message={notice.text} />}</div>}
    </section>}
    {!empty && <ListSummary listed={listed.data} failed={listed.errorUpdatedAt > listed.dataUpdatedAt} focus={focusSummary}>
      {/* Enquanto a conferência não responde, ainda não se sabe se é "Preparar" ou "Completar". */}
      {!closed && (listed.data || listed.errorUpdatedAt > listed.dataUpdatedAt) && <div className="card-actions">
        <p className="text-muted">Faltou algum item da lista pronta? Este botão inclui de novo tudo o que falta, inclusive o que você removeu.</p>
        <button className="secondary self-start" disabled={preparing} onClick={() => void prepare()}>{preparing ? 'Preparando…' : 'Completar a lista do chá'}</button>
        {notice && (notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <ErrorState message={notice.text} />)}
      </div>}
    </ListSummary>}
    {closed && <p className="notice mt-6">Evento encerrado. A lista está disponível apenas para consulta.</p>}
    <nav aria-label="Categorias de presentes" className="mt-10"><div className="segmented">{(['fralda', 'mimo'] as Category[]).map(value => <button key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setPage(0); setTotal(null); setRemoved({ title: '', count: 0 }) }}>{categoryLabels[value]}</button>)}</div></nav>
    <section key={`list-${category}`} aria-labelledby="list-title" className="fade-swap mt-6">
      {/* Cabeçalho da área: o título vem primeiro, o contador diz o tamanho da lista e
          o atalho de incluir tem mais peso que qualquer remoção. */}
      <div className="list-toolbar">
        <h2 id="list-title" className="text-2xl font-bold">{categoryLabels[category]} na lista</h2>
        {/* Some enquanto carrega e na lista vazia: lá o próprio estado vazio já diz o que há. */}
        {count > 0 && <span className="badge badge-neutral list-count">{count} {count === 1 ? 'item' : 'itens'}</span>}
        {!closed && <a className="secondary btn-sm list-toolbar-cta" href="#adicionar" onClick={event => {
          const target = document.getElementById('adicionar')
          if (!target) return
          // Sem entrada no histórico: no celular o primeiro "voltar" só tiraria o `#adicionar`.
          event.preventDefault(); target.scrollIntoView({ block: 'start' }); target.focus()
        }}><span aria-hidden="true">+</span>Adicionar à lista</a>}
      </div>
      {query.isPending && !(failedLast(query) && listError) ? <><LoadingState>Carregando a lista…</LoadingState><ListSkeleton /></> : !query.data ? <div className="mt-5"><ErrorState message={errorMessage(listError)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar lista" /></div> : <>
        <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} retryLabel="Recarregar lista" label="Atualizando…" />
        {removed.title && <p ref={removedNotice} tabIndex={-1} role="status" className="state state-success mt-3">“{removed.title}” saiu da lista.</p>}
        {!query.data.count ? <div className="mt-3"><EmptyState title={category === 'fralda' ? 'Nenhum tamanho de fralda na lista.' : 'Nenhum mimo na lista.'}>{closed ? 'Nenhum presente foi incluído nesta categoria.' : 'Use a lista pronta do chá acima ou o atalho “Adicionar à lista”.'}</EmptyState></div> : <>
          {/* G4b.3: "sem limite" é regra da categoria, e aparece uma vez no topo — não em cada linha. */}
          {category === 'mimo' && !closed && <p className="mt-3 text-muted">Sem limite de quantidade. Cada convidado informa quantos vai levar.</p>}
          <ul className="card item-rows stagger mt-3">{query.data.items.map(item => <li key={item.id}><ItemRow item={item} closed={closed} onRemoved={onRemoved} /></li>)}</ul>
        </>}
      </>}
      {/* Fora dos ramos de estado: a paginação continua montada ao carregar e na falha, e o foco não cai. */}
      {total !== null && <Pagination page={page} count={total} pageSize={PAGE_SIZE} onChange={setPage} label="Paginação da lista" />}
    </section>
    {!closed && <Catalog key={category} eventId={eventId} category={category} listed={listed.data} listedFailed={listed.errorUpdatedAt > listed.dataUpdatedAt} listedFetching={listed.isFetching} retryListed={() => void listed.refetch()} />}
  </div>
}
// §10: enquanto a lista carrega, o espaço reservado tem a forma das linhas. O anúncio
// fica com o LoadingState ao lado; aqui é só desenho.
function ListSkeleton() {
  return <ul className="card item-rows mt-3" aria-hidden="true">{[70, 52, 84].map((width, index) =>
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
    <h2 id="list-summary" ref={title} tabIndex={-1} className="card-title">Lista do chá</h2>
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
function ItemRow({ item, closed, onRemoved }: { item: EventItem; closed: boolean; onRemoved: (title: string) => void }) {
  const titleId = useId()
  const [baseline, setBaseline] = useState(item)
  const [quantity, setValue] = useState(String(item.quantity_requested ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  // "Recarregar quantidade" é o único jeito de sair do erro e some ao ser usado:
  // sem isso o foco cairia no <body> e o próximo Tab voltaria ao topo da página.
  const [reloaded, setReloaded] = useState(0)
  const reloadNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (reloaded) reloadNotice.current?.focus() }, [reloaded])
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
  const notes = outdated || error || message
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
    {!closed && <RemoveItem item={item} disabled={busy} onRemoved={onRemoved} />}
    {notes && <div className="item-row-notes">
      {outdated && <p role="status" className="text-sm">Existe uma versão mais recente desta quantidade.</p>}
      {error && <ErrorState message={error} />}
      {(error || outdated) && <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => {
        if (!unchanged && !window.confirm('Descartar a quantidade digitada e carregar a versão salva?')) return
        setBaseline(item); setValue(String(item.quantity_requested ?? '')); setError(null); setMessage('Quantidade recarregada.'); setReloaded(count => count + 1)
      }}>Recarregar quantidade</Button>}
      {/* O foco só vem para cá depois do "Recarregar": salvar mantém o foco no botão. */}
      {message && <p ref={reloadNotice} tabIndex={-1} role="status" className="state state-success">{message}</p>}
    </div>}
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
      aria-label={removeLabel} title={removeLabel} onClick={() => confirming ? cancel() : setConfirming(true)}>{trashIcon}</button>
    {confirming && <div id={panelId} className="card-disclosure item-row-confirm">
      <p ref={question} tabIndex={-1}>Remover “{item.product.title}” da lista? Os convidados deixam de ver este presente.{item.product.event_id ? ' Este mimo foi criado por você e será apagado.' : ''}</p>
      <div className="flex flex-wrap gap-3">
        {!blocked && <Button variant="danger" busy={busy} onClick={() => void remove()}>{busy ? 'Removendo…' : 'Remover'}</Button>}
        <Button variant="ghost" disabled={busy} onClick={cancel}>{blocked ? 'Fechar' : 'Cancelar'}</Button>
      </div>
      {error && <p ref={errorText} tabIndex={-1} role="alert" className="error">{error}</p>}
    </div>}
  </>
}
// Lixeira decorativa: quem lê a tela pelo teclado ou por leitor recebe o aria-label do botão.
const trashIcon = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M4 7h16" /><path d="M10 11.5v5.5" /><path d="M14 11.5v5.5" />
  <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" /><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
</svg>
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
  return <section aria-labelledby="custom-treat" className="card mt-6">
    <h3 id="custom-treat" className="card-title">Adicionar mimo próprio</h3>
    <p className="mt-1 text-muted">Escreva o nome de qualquer mimo. Vale só para este evento, sem limite de quantidade.</p>
    <form onSubmit={submit} className="mt-4 grid gap-4">
      {/* readOnly, e não disabled: com Enter no campo, o foco continua nele durante o envio. */}
      <label className="field">Nome do mimo<input ref={nameField} maxLength={160} value={title} readOnly={busy} aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? errorId : undefined} onChange={e => { setTitle(e.target.value); setMessage(''); setError(null); setNameInvalid(false) }} placeholder="Ex.: Livro de pano" /></label>
      <label className="field">Descrição (opcional)<textarea rows={2} maxLength={2000} value={description} readOnly={busy} onChange={e => { setDescription(e.target.value); setMessage('') }} /></label>
      <Button type="submit" variant="secondary" className="justify-self-start" busy={busy}>{busy ? 'Adicionando…' : 'Adicionar mimo'}</Button>
    </form>
    {message && <div className="mt-4"><SuccessMessage>{message}</SuccessMessage></div>}
    {error && <p id={errorId} role="alert" className="error mt-4">{error}</p>}
  </section>
}
// Uma seção só para incluir: mimo próprio (na aba Mimos) e as sugestões do catálogo
// que ainda não estão na lista. O catálogo é pequeno e vem inteiro, sem busca.
function Catalog({ eventId, category, listed, listedFailed, listedFetching, retryListed }: {
  eventId: string; category: Category; listed?: { product_id: string; diaper_size: DiaperSize | null }[]; listedFailed: boolean; listedFetching: boolean; retryListed: () => void
}) {
  const { session } = useAuth()
  const query = useQuery({ queryKey: [...giftKeys.catalog, session?.user.id, category], queryFn: () => listProducts('', 0, category, CATALOG_LIMIT) })
  const catalogError = useLastError(query.error)
  // A sugestão incluída some da lista: o foco vai para o aviso, e não para o início da página.
  const [added, setAdded] = useState({ title: '', count: 0 })
  const addedNotice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (added.count) addedNotice.current?.focus() }, [added])
  // Fralda é por tamanho: outro produto do mesmo tamanho também conta como já incluído.
  const isListed = (product: Product) => listed?.some(row => row.product_id === product.id || (product.diaper_size !== null && row.diaper_size === product.diaper_size))
  // Sem saber o que já está na lista (falha), mostra tudo: o banco recusa repetição.
  const suggestions = query.data?.products.filter(product => listedFailed || !isListed(product)) ?? []
  const noun = category === 'fralda' ? 'tamanhos de fralda' : 'mimos'
  // `tabIndex` no alvo do atalho: o “Adicionar à lista” do cabeçalho leva o foco para cá,
  // e não só a rolagem — quem usa teclado continua de onde a página parou.
  return <section id="adicionar" tabIndex={-1} aria-labelledby="catalog-title" className="mt-14 border-t border-stone-300 pt-10">
    <h2 id="catalog-title" className="text-2xl font-bold">Adicionar à lista</h2>
    {category === 'mimo' && <CustomTreatForm eventId={eventId} />}
    <section aria-labelledby="catalog-suggestions" className="mt-8">
      <h3 id="catalog-suggestions" className="text-xl font-semibold">Sugestões do catálogo</h3>
      {listedFailed && <div className="mt-4"><ErrorState message="Não foi possível conferir o que já está na lista. Se um item já estiver incluído, o sistema recusa a repetição." busy={listedFetching} onRetry={retryListed} retryLabel="Conferir a lista de novo" /></div>}
      {added.title && <p ref={addedNotice} tabIndex={-1} role="status" className="state state-success mt-4">“{added.title}” entrou na lista.</p>}
      {(query.isPending && !(failedLast(query) && catalogError)) || (!listed && !listedFailed) ? <LoadingState>Carregando sugestões…</LoadingState>
        : !query.data ? <div className="mt-4"><ErrorState message={errorMessage(catalogError)} busy={query.isFetching} onRetry={() => void query.refetch()} retryLabel="Recarregar sugestões" /></div>
        : !query.data.count ? <p className="mt-3 text-muted">O catálogo ainda não tem {noun}.</p>
        : !suggestions.length && query.data.count <= query.data.products.length ? <p className="mt-3 text-muted">Todos os {noun} do catálogo já estão na lista.</p>
        : <>{query.data.count > query.data.products.length && <p className="mt-3 text-muted">Mostrando {query.data.products.length} de {query.data.count} sugestões do catálogo.</p>}<ul className="catalog-rows stagger mt-4">{suggestions.map(product => <li key={product.id}><ProductCard product={product} eventId={eventId} onAdded={title => setAdded(current => ({ title, count: current.count + 1 }))} /></li>)}</ul></>}
    </section>
  </section>
}
function ProductCard({ product, eventId, onAdded }: { product: Product; eventId: string; onAdded: (title: string) => void }) {
  const [quantity, setValue] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cache = useQueryClient()
  const diaper = product.category === 'fralda'
  async function add(e: FormEvent) {
    e.preventDefault()
    const value = diaper ? parseQuantity(quantity) : null
    if (diaper && value === null) { setError('Informe uma quantidade inteira entre 1 e 10.000.'); return }
    if (busy) return
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
      {diaper && <QuantityField label="Pacotes" context={product.title} unit="pacotes" value={quantity} max={10000} disabled={busy} onChange={text => { setValue(text); setError(null) }} />}
      <Button type="submit" variant="secondary" size="sm" busy={busy} aria-label={`Adicionar ${product.title} à lista`}>{busy ? 'Adicionando…' : 'Adicionar'}</Button>
    </form>
    {error && <ErrorState message={error} />}
  </article>
}
