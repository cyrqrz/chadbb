import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { availableOf, guestCall, GuestError, guestMessage, responseLabels } from './api'
import type { GuestItem, ResponseChoice, Snapshot } from './api'
import { live } from '../../lib/query'
import { coverUrl } from '../events/api'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { Availability, Button, QuantityField, StatusBadge, Tabs } from '../../components/ui'

// O efeito reutiliza a promessa no StrictMode, sem compartilhar credenciais
// entre montagens. Abrir outro fragmento invalida o acesso anterior imediatamente.
function openInvite() {
  const token = window.location.hash.slice(1)
  window.history.replaceState(null, '', window.location.pathname)
  return /^[a-f0-9]{64}$/.test(token)
    ? guestCall(token, 'exchange').then(data => ({ token: data.session_token!, snapshot: data.snapshot }))
    : Promise.reject(new GuestError('GUEST_SESSION_INVALID', 401))
}
export function GuestPage() {
  const [access, setAccess] = useState<{ token: string; snapshot: Snapshot } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const opening = useRef<ReturnType<typeof openInvite> | null>(null)
  useEffect(() => {
    let active = true
    let attempt = 0
    function follow(promise: ReturnType<typeof openInvite>) {
      const current = ++attempt
      void promise.then(value => { if (active && current === attempt) setAccess(value) })
        .catch(cause => { if (active && current === attempt) setError(cause) })
    }
    opening.current ??= openInvite()
    follow(opening.current)
    function reopen() {
      if (window.location.hash === '#conteudo') return
      setAccess(null); setError(null)
      opening.current = openInvite()
      follow(opening.current)
    }
    window.addEventListener('hashchange', reopen)
    return () => { active = false; window.removeEventListener('hashchange', reopen) }
  }, [])
  if (error) return <section className="page"><p className="eyebrow">Seu convite</p><h1 className="page-title">Vamos recuperar seu acesso</h1><div className="mt-6"><ErrorState message={guestMessage(error)} /></div></section>
  if (!access) return <section className="page"><LoadingState>Abrindo seu convite…</LoadingState></section>
  return <GuestEvent access={access} />
}
const giftTabs = [['fralda', 'Fraldas'], ['mimo', 'Mimos']] as const
const eventDate = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('pt-BR', { ...options, timeZone: 'America/Sao_Paulo' })

// Leva o foco a uma seção sem mexer no fragmento da URL (o fragmento reabre o convite).
function goTo(ref: RefObject<HTMLElement | null>) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  ref.current?.focus({ preventScroll: true })
}

function GuestEvent({ access }: { access: { token: string; snapshot: Snapshot } }) {
  const cache = useQueryClient()
  const [key] = useState(() => ['guest-view', crypto.randomUUID()])
  const [tab, setTab] = useState<'fralda' | 'mimo'>('fralda')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  // Onde mostrar o retorno: na presença, na seção de presentes ou no cartão do item.
  const [feedbackAt, setFeedbackAt] = useState<string>('presenca')
  const [expired, setExpired] = useState(false)
  const [pending, setPending] = useState<{ action: string; payload: Record<string, unknown>; signature: string; success?: string } | null>(null)
  const presence = useRef<HTMLElement>(null)
  const gifts = useRef<HTMLElement>(null)
  const query = useQuery({ queryKey: key, queryFn: async ({ signal }) => (await guestCall(access.token, 'read', {}, signal)).snapshot,
    initialData: access.snapshot, ...live, enabled: q => !expired && !(q.state.error instanceof GuestError && q.state.error.status === 401), retry: false })
  useEffect(() => () => { cache.removeQueries({ queryKey: key }) }, [cache, key])
  async function mutate(action: string, payload: Record<string, unknown>, success?: string) {
    if (busy || expired) return false
    const signature = JSON.stringify({ action, payload })
    setFeedbackAt(action === 'rsvp' ? 'presenca' : String(payload.from_item_id ?? payload.item_id ?? 'presentes'))
    // Pedido de resultado desconhecido precisa ser resolvido antes de outro pedido.
    if (pending && pending.signature !== signature) {
      setNotice({ ok: false, text: 'Há uma confirmação pendente. Use “Verificar tentativa anterior” antes de fazer outra escolha.' }); return false
    }
    const request = pending ?? { action, payload: { ...payload, request_id: crypto.randomUUID() }, signature, success }
    setPending(request)
    setBusy(true); setError(null); setNotice(null)
    try {
      await cache.cancelQueries({ queryKey: key })
      const result = await guestCall(access.token, action, request.payload)
      await cache.cancelQueries({ queryKey: key })
      cache.setQueryData(key, result.snapshot)
      setPending(null); setNotice({ ok: true, text: withCompletion(request.success ?? successMessages[action] ?? 'Pronto! Sua escolha foi salva.', action, request.payload, result.snapshot) }); return true
    } catch (cause) {
      setError(cause)
      if (cause instanceof GuestError && cause.status < 500 && cause.status !== 429) setPending(null)
      if (cause instanceof GuestError && cause.status === 401) { setExpired(true); cache.removeQueries({ queryKey: key }) }
      else await query.refetch()
      return false
    } finally { setBusy(false) }
  }
  if (expired || query.error instanceof GuestError && query.error.status === 401) return <section className="page"><p className="eyebrow">Seu convite</p><h1 className="page-title">Reabra seu convite</h1><div className="mt-6"><ErrorState message={guestMessage(new GuestError('GUEST_SESSION_INVALID', 401))} /></div></section>
  const data = query.data
  const { event, invitation } = data
  const closed = event.status === 'closed'
  const answered = invitation.response !== 'pending'
  const feedback = (area: string) => feedbackAt === area && <>
    {notice && (notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <p role="status" className="state state-warning">{notice.text}</p>)}
    {error !== null && <ErrorState message={guestMessage(error)} />}
    {pending && !busy && <Button variant="secondary" onClick={() => { const request = pending; void mutate(request.action, Object.fromEntries(Object.entries(request.payload).filter(([name]) => name !== 'request_id'))) }}>Verificar tentativa anterior</Button>}
  </>
  const place = event.address.split('\n')[0]
  return <div className="page invite">
    <header className="invite-hero">
      <div className="invite-hero-text">
        <p className="eyebrow">Chá de bebê · convite</p>
        <h1 className="invite-title">{event.title}</h1>
        <p className="invite-lead">{invitation.name}, este convite é para você{invitation.kind === 'family' ? ' e sua família' : ''}.</p>
        <dl className="invite-facts">
          <div><dt>Quando</dt><dd>{eventDate(event.starts_at, { dateStyle: 'full', timeStyle: 'short' })}<span className="hint block">Horário de Brasília</span></dd></div>
          <div><dt>Onde</dt><dd>{place || 'Local a combinar com a organização.'}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => goTo(presence)}>{answered || closed ? 'Ver minha resposta' : 'Responder ao convite'}</Button>
          <Button variant="ghost" onClick={() => goTo(gifts)}>Ver presentes</Button>
          {answered && <StatusBadge tone={invitation.response === 'yes' ? 'success' : invitation.response === 'maybe' ? 'warning' : 'neutral'}>{responseLabels[invitation.response]}</StatusBadge>}
        </div>
      </div>
      {event.cover_path
        ? <img className="invite-cover" src={coverUrl(event.cover_path)} alt="Capa do chá de bebê" />
        : <div className="invite-art" aria-hidden="true">
          <span className="invite-art-day">{eventDate(event.starts_at, { day: '2-digit' })}</span>
          <span className="invite-art-month">{eventDate(event.starts_at, { month: 'long' })}</span>
          <span className="invite-art-note">Pequenos começos, muito amor.</span>
        </div>}
    </header>

    {closed && <p className="state state-warning mt-8">O evento foi encerrado. Você ainda pode consultar suas escolhas, cancelar ou informar uma compra enquanto seu convite estiver válido.</p>}
    <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} label="Atualizando informações…" />

    {event.description && <section className="invite-message" aria-label="Mensagem do convite"><p>{event.description}</p></section>}

    <InviteSection id="presenca" sectionRef={presence} title="Podemos contar com você?">
      <Presence data={data} busy={busy} closed={closed} save={mutate} />
      {feedback('presenca')}
    </InviteSection>

    <InviteSection id="presentes" sectionRef={gifts} title="Presentes" description="Sua presença é o principal. Se quiser, escolha fraldas ou um mimo; as quantidades mostram o que ainda falta.">
      <Tabs label="Tipos de presente" value={tab} onChange={setTab} options={giftTabs} />
      {feedback('presentes')}
      <div key={tab} className="fade-swap flex flex-col gap-4">
        <p className="font-bold">{tab === 'fralda' ? 'Qual tamanho você vai levar?' : 'Um mimo, se quiser'}</p>
        <p className="section-description">{tab === 'fralda' ? 'Escolha um ou mais pacotes. As quantidades disponíveis ajudam a equilibrar os tamanhos para o bebê.' : 'Escolha os mimos e informe quantas unidades. Não há limite de mimos.'}</p>
        <div className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.items.filter(item => item.category === tab).map(item => <GuestGift key={item.id} item={item} alternatives={data.items.filter(candidate => candidate.category === 'fralda' && candidate.id !== item.id)} busy={busy} closed={closed} save={mutate} feedback={feedback(item.id)} />)}</div>
        {!data.items.some(item => item.category === tab) && <EmptyState title="A organização está preparando esta lista.">Volte em breve para escolher.</EmptyState>}
      </div>
    </InviteSection>

    <InviteSection id="local" title="Local e instruções">
      <div className="invite-place">
        <p className="whitespace-pre-line">{event.address || 'Local a combinar com a organização.'}</p>
        {event.address && <a className="secondary self-start" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`} target="_blank" rel="noopener noreferrer">Abrir no mapa<span className="sr-only"> (abre em nova aba)</span></a>}
        {event.instructions && <p className="whitespace-pre-line text-muted">{event.instructions}</p>}
      </div>
    </InviteSection>
  </div>
}

function InviteSection({ id, title, description, sectionRef, children }: {
  id: string; title: string; description?: string; sectionRef?: RefObject<HTMLElement | null>; children: ReactNode
}) {
  const headingId = useId()
  return <section id={id} ref={sectionRef} tabIndex={sectionRef ? -1 : undefined} aria-labelledby={headingId} className="invite-section">
    <h2 id={headingId} className="invite-section-title">{title}</h2>
    {description && <p className="section-description">{description}</p>}
    {children}
  </section>
}

const successMessages: Record<string, string> = {
  rsvp: 'Resposta salva. Obrigado por avisar!',
  reserve: 'Presente reservado para você.',
  swap: 'Tamanho trocado.',
  cancel: 'Reserva cancelada.',
  purchase: 'Compra informada. A organização vai ver o aviso.',
}
// Microinteração: a confirmação avisa quando a escolha completou um tamanho.
function withCompletion(text: string, action: string, payload: Record<string, unknown>, snapshot: Snapshot) {
  if (action !== 'reserve' && action !== 'swap') return text
  const item = snapshot.items.find(candidate => candidate.id === payload.item_id)
  return item?.category === 'fralda' && availableOf(item) === 0 ? `${text} Tamanho ${item.diaper_size} completo.` : text
}

type Save = (action: string, payload: Record<string, unknown>, success?: string) => Promise<boolean>
function Presence({ data, busy, closed, save }: { data: Snapshot; busy: boolean; closed: boolean; save: Save }) {
  const inv = data.invitation
  const [draft, setDraft] = useState<{ response: ResponseChoice; attending: number; version: number } | null>(null)
  const value = draft ?? inv
  async function submit(event: FormEvent) { event.preventDefault(); if (await save('rsvp', { response: value.response, attending: value.response === 'yes' ? value.attending || 1 : 0, version: value.version })) setDraft(null) }
  return <div className="card invite-card">
    <p className="text-muted">Resposta atual: {responseLabels[inv.response]}{inv.response === 'yes' ? ` · ${inv.attending} pessoa(s)` : ''}.</p>
    {closed ? <p>As respostas foram encerradas. Para mudar algo, fale com a organização.</p> : <form className="flex flex-col gap-5" onSubmit={submit}>
      <fieldset disabled={busy}><legend className="font-semibold">Sua confirmação</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">{(['yes', 'no', 'maybe'] as ResponseChoice[]).map(response => <label key={response} className="choice"><input type="radio" name="presence" checked={value.response === response} onChange={() => setDraft({ ...value, response, attending: value.attending || 1 })} />{responseLabels[response]}</label>)}</div>
      </fieldset>
      {value.response === 'yes' && inv.kind === 'family' && <label className="field">Quantas pessoas vão?<input type="number" min={1} max={inv.capacity} step={1} required disabled={busy} value={value.attending || 1} onChange={e => setDraft({ ...value, attending: Number(e.target.value) })} /><span className="hint">Este convite inclui até {inv.capacity} pessoas.</span></label>}
      {draft && inv.version !== draft.version && <p role="status">Sua resposta mudou em outra sessão. <button type="button" className="text-link" onClick={() => setDraft(null)}>Usar resposta atual</button></p>}
      <Button type="submit" className="self-start" busy={busy} disabled={value.response === 'pending'}>{busy ? 'Aguarde…' : 'Confirmar presença'}</Button>
    </form>}
  </div>
}

// Card de referência do sistema (G3.1): cabeçalho, disponibilidade, reserva,
// área interativa com um CTA e, abaixo do divisor, as ações secundárias.
function GuestGift({ item, alternatives, busy, closed, save, feedback }: { item: GuestItem; alternatives: GuestItem[]; busy: boolean; closed: boolean; save: Save; feedback: ReactNode }) {
  const [draft, setDraft] = useState<{ text: string; version: number | null } | null>(null)
  const [destination, setDestination] = useState('')
  const [swapOpen, setSwapOpen] = useState(false)
  const swapId = useId()
  const swapSelect = useRef<HTMLSelectElement>(null)
  useEffect(() => { if (swapOpen) swapSelect.current?.focus() }, [swapOpen])
  const own = item.own
  const active = own && own.status !== 'cancelled'
  const purchased = own?.status === 'purchase_declared'
  const diaper = item.category === 'fralda'
  const units = (n: number) => diaper ? (n === 1 ? 'pacote' : 'pacotes') : (n === 1 ? 'unidade' : 'unidades')
  const swapTargets = alternatives.filter(candidate => candidate.own?.status !== 'purchase_declared')
  const canSwap = active && !purchased && diaper && !closed && swapTargets.length > 0
  const quantity = draft?.text ?? String(active ? own.quantity : 1)
  const available = availableOf(item)
  const full = available === 0 && !active
  const purchaseHint = useId()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^[0-9]+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 1000) return
    if (await save('reserve', { item_id: item.id, quantity: Number(quantity), version: draft ? draft.version : own?.version ?? null }, active ? 'Escolha atualizada.' : undefined)) setDraft(null)
  }
  function swap() {
    const target = swapTargets.find(candidate => candidate.id === destination)
    if (!target || !own) return
    void save('swap', { from_item_id: item.id, item_id: target.id, version: own.version, destination_version: target.own?.version ?? null })
      .then(done => { if (done) { setDraft(null); setDestination(''); setSwapOpen(false) } })
  }
  return <article className={`card card-stack invite-gift ${full ? 'product-listed' : ''}`}>
    <header className="card-header">
      <div className="card-badges">
        <StatusBadge tone="neutral">{diaper ? `Tamanho ${item.diaper_size}` : 'Mimo opcional'}</StatusBadge>
        {full && <StatusBadge tone="success">Completo</StatusBadge>}
        {active && <StatusBadge tone={purchased ? 'success' : 'brand'}>{purchased ? 'Compra informada' : 'Reservado'}</StatusBadge>}
      </div>
      <h3 className="card-title">{item.title}</h3>
      {item.description && <p className="card-description">{item.description}</p>}
    </header>
    {available === null
      ? <p className="availability-text">{item.committed} {units(item.committed)} {item.committed === 1 ? 'prometida' : 'prometidas'} · sem limite</p>
      : <Availability available={available} limit={item.limit ?? 0} committed={item.committed} unit="pacotes" />}
    {active && <p className="card-reservation"><span>Sua reserva</span> <strong>{own.quantity} {units(own.quantity)}</strong></p>}
    {purchased && <p className="hint">Compra informada por você. Para mudar a quantidade ou o tamanho, cancele a reserva e escolha de novo.</p>}
    {!purchased && !full && !closed && <form onSubmit={submit} className="flex flex-col gap-3">
      <QuantityField context={item.title} unit={diaper ? 'pacotes' : 'unidades'} value={quantity}
        max={available === null ? 1000 : Math.min(1000, available + (active ? own.quantity : 0))} onChange={text => setDraft({ text, version: own?.version ?? null })} />
      <Button type="submit" className="self-start" busy={busy}>{active ? 'Atualizar quantidade' : 'Escolher presente'}</Button>
    </form>}
    {draft && draft.version !== (own?.version ?? null) && <p role="status">A escolha mudou em outra sessão. <button type="button" className="text-link" onClick={() => setDraft(null)}>Usar escolha atual</button></p>}
    {feedback}
    {active && <div className="card-actions">
      {canSwap && <button type="button" className="btn-ghost btn-sm" aria-expanded={swapOpen} aria-controls={swapId} onClick={() => setSwapOpen(!swapOpen)}>Trocar tamanho <span aria-hidden="true">{swapOpen ? '˄' : '›'}</span></button>}
      {canSwap && swapOpen && <div id={swapId} className="card-disclosure">
        <label className="field">Novo tamanho<select ref={swapSelect} disabled={busy} value={destination} onChange={e => setDestination(e.target.value)}><option value="">Escolha outro tamanho</option>{swapTargets.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.diaper_size} · {availableOf(candidate) ?? 0} disponíveis</option>)}</select></label>
        <Button variant="secondary" size="sm" className="self-start" busy={busy} disabled={!destination} onClick={swap}>Confirmar troca</Button>
      </div>}
      {!purchased && <Button variant="ghost" size="sm" disabled={busy} aria-describedby={purchaseHint} onClick={() => void save('purchase', { item_id: item.id, version: own.version })}>Já comprei</Button>}
      <Button variant="danger" size="sm" disabled={busy} onClick={() => void save('cancel', { item_id: item.id, version: own.version }).then(done => { if (done) setDraft(null) })}>Cancelar reserva</Button>
      {!purchased && <p id={purchaseHint} className="hint">“Já comprei” só avisa a organização que você já tem o presente. O site não faz pagamento nem confere a compra.</p>}
    </div>}
  </article>
}
