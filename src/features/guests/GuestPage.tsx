import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { guestCall, GuestError, guestMessage, responseLabels } from './api'
import type { GuestItem, ResponseChoice, Snapshot } from './api'
import { live } from '../../lib/query'
import { buildIcs, googleCalendarUrl } from '../../lib/ics'
import { coverUrl } from '../events/api'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { Availability, Button, QuantityField, Skeleton, StatusBadge, Tabs } from '../../components/ui'

// O efeito reutiliza a promessa no StrictMode, sem compartilhar credenciais
// entre montagens. Abrir outro fragmento invalida o acesso anterior imediatamente.
// Sem código na URL (página recarregada ou endereço digitado) não é erro do
// convidado: o código sai da barra de endereço depois da troca, por segurança.
// "#conteudo" vem do link "Pular para o conteúdo" e também não é um código.
function openInvite() {
  const token = window.location.hash.slice(1)
  window.history.replaceState(null, '', window.location.pathname)
  if (!token || token === 'conteudo') return Promise.reject(new GuestError('INVITE_LINK_MISSING', 400))
  return /^[a-f0-9]{64}$/.test(token)
    ? guestCall(token, 'exchange').then(data => ({ token: data.session_token!, snapshot: data.snapshot }))
    : Promise.reject(new GuestError('INVITE_LINK_INCOMPLETE', 400))
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
  if (error instanceof GuestError && error.message === 'INVITE_LINK_MISSING') return <section className="page"><p className="eyebrow">Seu convite</p><h1 className="page-title">Abra o convite pelo link recebido</h1><div className="state state-empty mt-6"><p>Por segurança, o convite não fica salvo nesta página. Toque de novo no link que você recebeu pelo WhatsApp.</p></div></section>
  if (error) return <section className="page"><p className="eyebrow">Seu convite</p><h1 className="page-title">Vamos recuperar seu acesso</h1><div className="mt-6"><ErrorState message={guestMessage(error)} /></div></section>
  if (!access) return <section className="page"><LoadingState>Abrindo seu convite…</LoadingState><GuestSkeleton /></section>
  return <GuestEvent access={access} />
}
// G5.2: ainda não se sabe se há capa; a forma genérica (título, data, dois blocos) evita
// um salto grande quando o convite de verdade aparece.
function GuestSkeleton() {
  return <div className="mt-6 flex flex-col gap-4" aria-hidden="true">
    <Skeleton width="70%" height="2.5rem" /><Skeleton width="40%" />
    <div className="mt-4 grid gap-4 md:grid-cols-2">{[0, 1].map(i =>
      <div key={i} className="card card-stack"><Skeleton width="50%" /><Skeleton width="80%" height="1.25rem" /><Skeleton width="60%" /></div>)}
    </div>
  </div>
}
const giftTabs = [['fralda', 'Fraldas'], ['mimo', 'Mimos']] as const
const eventDate = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('pt-BR', { ...options, timeZone: 'America/Sao_Paulo' })

// Leva o foco a uma seção sem mexer no fragmento da URL (o fragmento reabre o convite).
function goTo(ref: RefObject<HTMLElement | null>) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  ref.current?.focus({ preventScroll: true })
}

// `preview`: o organizador vê o convite com dados de exemplo; nada é consultado nem enviado.
export function GuestEvent({ access, preview = false }: { access: { token: string; snapshot: Snapshot }; preview?: boolean }) {
  const cache = useQueryClient()
  const [key] = useState(() => ['guest-view', crypto.randomUUID()])
  const [tab, setTab] = useState<'fralda' | 'mimo'>('fralda')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  // Onde mostrar o retorno: na presença, na seção de presentes ou no cartão do item.
  const [feedbackAt, setFeedbackAt] = useState<string>('presenca')
  const [expired, setExpired] = useState(false)
  const [pending, setPending] = useState<{ action: string; payload: Record<string, unknown>; signature: string; success?: string; where: string } | null>(null)
  const presence = useRef<HTMLElement>(null)
  const gifts = useRef<HTMLElement>(null)
  const query = useQuery({ queryKey: key, queryFn: async ({ signal }) => (await guestCall(access.token, 'read', {}, signal)).snapshot,
    initialData: access.snapshot, ...live, enabled: q => !preview && !expired && !(q.state.error instanceof GuestError && q.state.error.status === 401), retry: false })
  useEffect(() => () => { cache.removeQueries({ queryKey: key }) }, [cache, key])
  // `where` permite responder onde a pessoa clicou: o cancelamento pedido no
  // aviso da presença não pode aparecer lá embaixo, no cartão do presente
  // (que pode estar até em outra aba).
  async function mutate(action: string, payload: Record<string, unknown>, success?: string, where?: string) {
    if (busy || expired) return false
    const signature = JSON.stringify({ action, payload })
    const area = where ?? (action === 'rsvp' ? 'presenca' : String(payload.from_item_id ?? payload.item_id ?? 'presentes'))
    setFeedbackAt(area)
    if (preview) { setError(null); setNotice({ ok: false, text: 'Na prévia, nada é enviado. O convidado verá a confirmação aqui.' }); return false }
    if (!navigator.onLine) { setError(new Error('OFFLINE')); return false }
    // Pedido de resultado desconhecido precisa ser resolvido antes de outro pedido.
    if (pending && pending.signature !== signature) {
      setNotice({ ok: false, text: 'Há uma confirmação pendente. Use “Verificar tentativa anterior” antes de fazer outra escolha.' }); return false
    }
    const request = pending ?? { action, payload: { ...payload, request_id: crypto.randomUUID() }, signature, success, where: area }
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
  const data = preview ? access.snapshot : query.data
  const { event, invitation } = data
  const closed = event.status === 'closed'
  const answered = invitation.response !== 'pending'
  const feedback = (area: string) => feedbackAt === area && <>
    {notice && (notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <p role="status" className="state state-warning">{notice.text}</p>)}
    {error !== null && <ErrorState message={guestMessage(error)} />}
    {pending && !busy && <Button variant="secondary" onClick={() => { const request = pending; void mutate(request.action, Object.fromEntries(Object.entries(request.payload).filter(([name]) => name !== 'request_id')), request.success, request.where) }}>Verificar tentativa anterior</Button>}
  </>
  const place = event.address.split('\n')[0]
  return <div className="page invite">
    <header className="invite-hero">
      <div className="invite-hero-text">
        <div className="invite-heading">
          <p className="eyebrow">Chá de bebê · convite</p>
          <h1 className="invite-title">{event.title}</h1>
          <p className="invite-lead">{invitation.name}, este convite é para você{invitation.kind === 'family' ? ' e sua família' : ''}.</p>
        </div>
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
      <div className="invite-hero-side">
        {event.cover_path
          ? <img className="invite-cover" src={coverUrl(event.cover_path)} alt="Capa do chá de bebê" />
          : <CalendarCard eventId={event.id} title={event.title} startsAt={event.starts_at} address={event.address} />}
        {event.instructions && <aside className="guest-notice" aria-labelledby="invite-aviso">
          <h2 id="invite-aviso" className="guest-notice-title">Instruções para o convidado</h2>
          <p className="guest-notice-text whitespace-pre-line">{event.instructions}</p>
        </aside>}
      </div>
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
        <div className={tab === 'mimo' ? 'guest-treat-list' : 'stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3'}>{data.items.filter(item => item.category === tab).map(item => <GuestGift key={item.id} item={item} alternatives={data.items.filter(candidate => candidate.category === 'fralda' && candidate.id !== item.id)} busy={busy} closed={closed} save={mutate} feedback={feedback(item.id)} />)}</div>
        {!data.items.some(item => item.category === tab) && <EmptyState title="A organização está preparando esta lista.">Volte em breve para escolher.</EmptyState>}
      </div>
    </InviteSection>

    <InviteSection id="local" title="Como chegar">
      <div className="venue-card">
        <p className="whitespace-pre-line font-semibold">{event.address || 'Local a combinar com a organização.'}</p>
        {event.address && <VenueMap address={event.address} />}
        {event.address && <a className="secondary self-start" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address)}`} target="_blank" rel="noopener noreferrer">Como chegar<span className="sr-only"> (abre em nova aba)</span></a>}
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
  return item?.category === 'fralda' && item.available === 0 ? `${text} Tamanho ${item.diaper_size} completo.` : text
}

type Save = (action: string, payload: Record<string, unknown>, success?: string, where?: string) => Promise<boolean>
function Presence({ data, busy, closed, save }: { data: Snapshot; busy: boolean; closed: boolean; save: Save }) {
  const inv = data.invitation
  const policy = data.rsvp
  const [email, setEmail] = useState('')
  const emailHint = useId()
  const [draft, setDraft] = useState<{ response: ResponseChoice; attending: number; version: number } | null>(null)
  const [keepGifts, setKeepGifts] = useState(false)
  // Quantas reservas já saíram quando o cancelamento em série para no meio.
  const [cancelled, setCancelled] = useState(0)
  const card = useRef<HTMLDivElement>(null)
  const warning = useId()
  const value = draft ?? inv
  // Quem não vai pode querer enviar o presente assim mesmo: o convite avisa e
  // deixa a escolha, em vez de cancelar sozinho a reserva. Presente com compra
  // já informada fica fora: não há pacote para liberar e a pessoa já comprou.
  const reserved = data.items.filter(item => item.own?.status === 'reserved')
  const units = (item: GuestItem, n: number) => item.category === 'fralda' ? (n === 1 ? 'pacote' : 'pacotes') : (n === 1 ? 'unidade' : 'unidades')
  const stale = inv.response === 'no' && reserved.length > 0 && !keepGifts && !closed
  // O cancelamento pedido aqui responde aqui (`presenca`), e não no cartão do
  // presente, que pode estar na outra aba. Se um falhar, os seguintes não vão:
  // o erro e o “Verificar tentativa anterior” ficam ao lado do botão, e o aviso
  // diz quantas já saíram — senão a pessoa só veria a lista encurtar sozinha.
  async function cancelAll() {
    const done = reserved.length > 1 ? 'Reservas canceladas. Os presentes voltaram para a lista.' : undefined
    setCancelled(0)
    let out = 0
    for (const item of reserved) {
      if (!await save('cancel', { item_id: item.id, version: item.own!.version }, done, 'presenca')) { setCancelled(out); return }
      out++
    }
    card.current?.focus()
  }
  // Manter é uma escolha, não um descarte de aviso: responde com confirmação e
  // devolve o foco ao cartão, já que o botão clicado desaparece.
  function keep() { setKeepGifts(true); setCancelled(0); card.current?.focus() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    // A confirmação da resposta já avisa do presente: um anúncio só, na ordem
    // certa. O aviso é desenhado dentro do cartão, logo acima desta mensagem.
    const keeping = value.response === 'no' && reserved.length > 0
    const message = keeping ? 'Resposta salva. Você ainda tem presente reservado: escolha logo acima se quer manter ou cancelar.' : undefined
    if (await save('rsvp', { response: value.response, attending: value.response === 'yes' ? value.attending || 1 : 0, version: value.version, ...(value.response === 'maybe' && email.trim() ? { reminder_email: email.trim() } : {}) }, message)) { setDraft(null); setEmail(''); setKeepGifts(false); setCancelled(0) }
  }
  return <div ref={card} tabIndex={-1} className="card invite-card">
    <p className="text-muted">Resposta atual: {responseLabels[inv.response]}{inv.response === 'yes' ? ` · ${inv.attending} pessoa(s)` : ''}.</p>
    {closed ? <p>As respostas foram encerradas. Para mudar algo, fale com a organização.</p> : <form className="flex flex-col gap-5" onSubmit={submit}>
      <fieldset disabled={busy}><legend className="font-semibold">Sua confirmação</legend>
        <div className={`mt-3 grid gap-3 ${policy.maybe_allowed ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{(['yes', 'no', ...(policy.maybe_allowed ? ['maybe'] : [])] as ResponseChoice[]).map(response => <label key={response} className="choice"><input type="radio" name="presence" checked={value.response === response} onChange={() => setDraft({ ...value, response, attending: value.attending || 1 })} />{responseLabels[response]}</label>)}</div>
      </fieldset>
      {value.response === 'maybe' && policy.maybe_allowed && <label className="field">E-mail para o lembrete
        <input type="email" autoComplete="email" maxLength={254} required={!policy.reminder_email_set} disabled={busy} value={email} onChange={e => setEmail(e.target.value)} aria-describedby={emailHint} />
        <span id={emailHint} className="hint">{policy.reminder_email_set ? 'Seu e-mail já está salvo. Preencha apenas se quiser trocar. ' : ''}Usaremos este endereço apenas para lembrar você de confirmar. O lembrete será enviado a partir de {eventDate(policy.maybe_closes_at, { dateStyle: 'short', timeStyle: 'short' })} (Brasília). Depois, você terá três dias para decidir; sem resposta, será marcado como “Não poderá ir”.</span>
      </label>}
      {!policy.maybe_allowed && (inv.response === 'maybe' || inv.response === 'pending') && <p role="status" className="state state-warning">A opção “Talvez” não está mais disponível. Escolha se vai participar ou se não poderá ir.{inv.response === 'maybe' && policy.reminder_sent && <> Confirme até {eventDate(policy.confirmation_due_at, { dateStyle: 'short', timeStyle: 'short' })} (Brasília); depois desse prazo, sua resposta passará para “Não poderá ir”.</>}</p>}
      {value.response === 'yes' && inv.kind === 'family' && <label className="field">Quantas pessoas vão?<input type="number" min={1} max={inv.capacity} step={1} required disabled={busy} value={value.attending || 1} onChange={e => setDraft({ ...value, attending: Number(e.target.value) })} /><span className="hint">Este convite inclui até {inv.capacity} pessoas.</span></label>}
      {draft && inv.version !== draft.version && <p role="status">Sua resposta mudou em outra sessão. <button type="button" className="text-link" onClick={() => setDraft(null)}>Usar resposta atual</button></p>}
      <Button type="submit" className="self-start" busy={busy} disabled={value.response === 'pending' || value.response === 'maybe' && !policy.maybe_allowed}>{busy ? 'Aguarde…' : 'Confirmar presença'}</Button>
    </form>}
    {stale && <div role="group" aria-labelledby={warning} className="state state-warning">
      <p id={warning}>Você marcou que não poderá ir e ainda tem presente reservado neste convite:</p>
      <ul className="list-disc pl-5">{reserved.map(item => <li key={item.id}>{item.title} · {item.own!.quantity} {units(item, item.own!.quantity)}</li>)}</ul>
      {cancelled > 0 && <p>{cancelled === 1 ? 'Uma reserva já foi cancelada' : `${cancelled} reservas já foram canceladas`}; o que está nesta lista continua reservado.</p>}
      <p>Se não for enviar, cancele para liberar para outra pessoa.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" size="sm" busy={busy} onClick={() => void cancelAll()}>Cancelar {reserved.length === 1 ? 'reserva' : 'reservas'}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={keep}>Manter: vou enviar o presente</Button>
      </div>
    </div>}
    {keepGifts && !closed && inv.response === 'no' && reserved.length > 0 &&
      <p role="status" className="hint">Combinado: seu presente continua reservado para você. Se mudar de ideia, cancele na lista de presentes.</p>}
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
  const available = item.available
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
  return <article className={`${diaper ? 'card card-stack invite-gift' : 'guest-treat-row'} ${full ? 'product-listed' : ''}`}>
    <header className="card-header">
      <div className="card-badges">
        {diaper && <StatusBadge tone="neutral">Tamanho {item.diaper_size}</StatusBadge>}
        {full && <StatusBadge tone="success">Completo</StatusBadge>}
        {active && <StatusBadge tone={purchased ? 'success' : 'brand'}>{purchased ? 'Compra informada' : 'Reservado'}</StatusBadge>}
      </div>
      <h3 className="card-title">{item.title}</h3>
      {item.description && <p className="card-description">{item.description}</p>}
    </header>
    {available === null
      ? item.committed > 0 && <p className="availability-text">{item.committed} {units(item.committed)} {item.committed === 1 ? 'prometida' : 'prometidas'}</p>
      : <Availability available={available} limit={item.limit ?? 0} committed={item.committed} unit="pacotes" />}
    {active && <p className="card-reservation"><span>Sua reserva</span> <strong>{own.quantity} {units(own.quantity)}</strong></p>}
    {purchased && <p className="hint">Compra informada por você. Para mudar a quantidade ou o tamanho, cancele a reserva e escolha de novo.</p>}
    {!purchased && !full && !closed && <form onSubmit={submit} className={diaper ? 'flex flex-col gap-3' : 'guest-treat-form'}>
      <QuantityField context={item.title} unit={diaper ? 'pacotes' : 'unidades'} value={quantity} busy={busy}
        max={available === null ? 1000 : Math.min(1000, available + (active ? own.quantity : 0))} onChange={text => setDraft(previous => ({ text, version: previous ? previous.version : own?.version ?? null }))} />
      <Button type="submit" className="self-start" busy={busy}>{active ? 'Atualizar quantidade' : 'Escolher presente'}</Button>
    </form>}
    {/* A18: sem isso o formulário só sumia — outro convidado esgotou o tamanho
        enquanto esta pessoa escolhia a quantidade (regra 7 do AGENTS.md). */}
    {!purchased && full && !active && draft && <p role="status" className="hint">Este tamanho completou enquanto você escolhia. Sua quantidade não foi enviada; escolha outro tamanho, se houver.</p>}
    {draft && draft.version !== (own?.version ?? null) && <p role="status">A escolha mudou em outra sessão. <button type="button" className="text-link" onClick={() => setDraft(null)}>Usar escolha atual</button></p>}
    {feedback}
    {active && <div className="card-actions">
      {canSwap && <button type="button" className="btn-ghost btn-sm" aria-expanded={swapOpen} aria-controls={swapId} onClick={() => setSwapOpen(!swapOpen)}>Trocar tamanho <span aria-hidden="true">{swapOpen ? '˄' : '›'}</span></button>}
      {canSwap && swapOpen && <div id={swapId} className="card-disclosure">
        <label className="field">Novo tamanho<select ref={swapSelect} disabled={busy} value={destination} onChange={e => setDestination(e.target.value)}><option value="">Escolha outro tamanho</option>{swapTargets.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.diaper_size} · {candidate.available ?? 0} disponíveis</option>)}</select></label>
        <Button variant="secondary" size="sm" className="self-start" busy={busy} disabled={!destination} onClick={swap}>Confirmar troca</Button>
      </div>}
      {!purchased && <Button variant="ghost" size="sm" disabled={busy} aria-describedby={purchaseHint} onClick={() => void save('purchase', { item_id: item.id, version: own.version })}>Já comprei</Button>}
      <Button variant="danger" size="sm" disabled={busy} onClick={() => void save('cancel', { item_id: item.id, version: own.version }).then(done => { if (done) setDraft(null) })}>Cancelar reserva</Button>
      {!purchased && <p id={purchaseHint} className="hint">“Já comprei” só avisa a organização que você já tem o presente. O site não faz pagamento nem confere a compra.</p>}
    </div>}
  </article>
}

// Mapa interativo do Google, carregado com o convite (decisão do titular em
// 2026-09-18: o endereço vai ao Google ao abrir o convite). A área tem altura
// fixa para não empurrar a página; "Como chegar" abre a rota no Google Maps.
function VenueMap({ address }: { address: string }) {
  const [loaded, setLoaded] = useState(false)
  const place = address.split('\n')[0]
  return <div className={`venue-map${loaded ? ' is-loaded' : ''}`}>
    {!loaded && <span className="venue-map-placeholder" aria-hidden="true">Carregando mapa…</span>}
    <iframe title={`Mapa do local: ${place}`} src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&hl=pt-BR&output=embed`}
      loading="lazy" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} />
  </div>
}

// Cartão de calendário no lugar da capa quando não há uma. O .ics é gerado no
// próprio navegador (Blob + URL.createObjectURL): sem servidor novo, sem CSP
// nova. O convite do convidado não traz `ends_at` (regra 6: o front não
// recalcula prazos de negócio); a duração de 3 h em `buildIcs` é só um padrão
// de exibição no calendário pessoal, sem efeito em nenhuma regra do site.
function CalendarCard({ eventId, title, startsAt, address }: { eventId: string; title: string; startsAt: string; address: string }) {
  const place = address.split('\n')[0]
  function addToCalendar() {
    const ics = buildIcs({ uid: `${eventId}@chadbb.pages.dev`, title, startsAt, location: place || undefined })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'convite.ics'
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="invite-art">
    <span className="invite-art-weekday">{eventDate(startsAt, { weekday: 'long' })}</span>
    <span className="invite-art-day">{eventDate(startsAt, { day: '2-digit' })}</span>
    <span className="invite-art-month">{eventDate(startsAt, { month: 'long' })} · {eventDate(startsAt, { timeStyle: 'short' })}</span>
    <div className="invite-art-actions">
      <button type="button" className="secondary" onClick={addToCalendar}>Adicionar ao calendário</button>
      <a className="text-link" href={googleCalendarUrl({ uid: eventId, title, startsAt, location: place || undefined })} target="_blank" rel="noopener noreferrer">Google Agenda<span className="sr-only"> (abre em nova aba)</span></a>
    </div>
  </div>
}
