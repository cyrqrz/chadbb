import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { availableOf, guestCall, GuestError, guestMessage, responseLabels } from './api'
import type { GuestItem, ResponseChoice, Snapshot } from './api'
import { live } from '../../lib/query'
import { coverUrl } from '../events/api'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'

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
function GuestEvent({ access }: { access: { token: string; snapshot: Snapshot } }) {
  const cache = useQueryClient()
  const [key] = useState(() => ['guest-view', crypto.randomUUID()])
  const [tab, setTab] = useState('presenca')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [expired, setExpired] = useState(false)
  const [pending, setPending] = useState<{ action: string; payload: Record<string, unknown>; signature: string; success?: string } | null>(null)
  const query = useQuery({ queryKey: key, queryFn: async ({ signal }) => (await guestCall(access.token, 'read', {}, signal)).snapshot,
    initialData: access.snapshot, ...live, enabled: q => !expired && !(q.state.error instanceof GuestError && q.state.error.status === 401), retry: false })
  useEffect(() => () => { cache.removeQueries({ queryKey: key }) }, [cache, key])
  async function mutate(action: string, payload: Record<string, unknown>, success?: string) {
    if (busy || expired) return false
    const signature = JSON.stringify({ action, payload })
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
      setPending(null); setNotice({ ok: true, text: request.success ?? successMessages[action] ?? 'Pronto! Sua escolha foi salva.' }); return true
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
  const closed = data.event.status === 'closed'
  return <section className="page">
    <div className="guest-hero">
      <div><p className="eyebrow">Um encontro cheio de carinho</p><h1>{data.event.title}</h1><p className="mt-5 text-lg">{data.invitation.name}, este convite é para você{data.invitation.kind === 'family' ? ' e sua família' : ''}.</p><p className="mt-4 whitespace-pre-line text-stone-600">{data.event.description}</p></div>
      {data.event.cover_path ? <img className="h-64 w-full rounded-3xl object-cover" src={coverUrl(data.event.cover_path)} alt="Capa do chá de bebê" /> : <div className="guest-art" aria-hidden="true"><span>✳</span><p>Pequenos começos.<br />Muito amor.</p></div>}
    </div>
    <div className="stagger mt-6 grid gap-4 md:grid-cols-2"><div className="card"><p className="eyebrow">Quando</p><p className="text-xl">{new Date(data.event.starts_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })}</p><p className="hint mt-2">Horário de Brasília</p></div><div className="card"><p className="eyebrow">Onde vamos celebrar</p><p className="whitespace-pre-line">{data.event.address || 'Local a combinar com a organização.'}</p><p className="mt-3 whitespace-pre-line text-stone-600">{data.event.instructions}</p></div></div>
    {closed && <p className="notice mt-6">O evento foi encerrado. Você ainda pode consultar suas escolhas, cancelar ou informar uma compra enquanto seu convite estiver válido.</p>}
    <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} label="Atualizando informações…" />
    <nav aria-label="Seu convite" className="category-nav"><div className="segmented">{[['presenca', 'Presença'], ['fralda', 'Fraldas'], ['mimo', 'Mimos']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div></nav>
    {notice && <div className="mb-6">{notice.ok ? <SuccessMessage>{notice.text}</SuccessMessage> : <p role="status" className="notice">{notice.text}</p>}</div>}
    {error !== null && <div className="mb-6"><ErrorState message={guestMessage(error)} /></div>}
    {pending && !busy && <button className="secondary mb-6" onClick={() => { const request = pending!; void mutate(request.action, Object.fromEntries(Object.entries(request.payload).filter(([name]) => name !== 'request_id'))) }}>Verificar tentativa anterior</button>}
    <div key={tab} className="fade-swap">{tab === 'presenca' ? <Presence data={data} busy={busy || closed} save={mutate} /> : <>
      <h2 className="text-3xl font-semibold">{tab === 'fralda' ? 'Qual tamanho você vai levar?' : 'Um mimo, se quiser'}</h2>
      <p className="mt-3 max-w-2xl text-stone-600">{tab === 'fralda' ? 'Escolha um ou mais pacotes. As quantidades disponíveis ajudam a equilibrar os tamanhos para o bebê.' : 'Sua presença é o principal. Se quiser levar um carinho a mais, escolha os mimos e informe quantas unidades. Não há limite de mimos.'}</p>
      <div className="stagger mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.items.filter(item => item.category === tab).map(item => <GuestGift key={item.id} item={item} alternatives={data.items.filter(candidate => candidate.category === 'fralda' && candidate.id !== item.id)} busy={busy} closed={closed} save={mutate} />)}</div>
      {!data.items.some(item => item.category === tab) && <div className="mt-6"><EmptyState title="A organização está preparando esta lista.">Volte em breve para escolher.</EmptyState></div>}
    </>}</div>
  </section>
}
const successMessages: Record<string, string> = {
  rsvp: 'Resposta salva. Obrigado por avisar!',
  reserve: 'Presente reservado para você.',
  swap: 'Tamanho trocado.',
  cancel: 'Reserva cancelada.',
  purchase: 'Compra informada. A organização vai ver o aviso.',
}
type Save = (action: string, payload: Record<string, unknown>, success?: string) => Promise<boolean>
function Presence({ data, busy, save }: { data: Snapshot; busy: boolean; save: Save }) {
  const inv = data.invitation
  const [draft, setDraft] = useState<{ response: ResponseChoice; attending: number; version: number } | null>(null)
  const value = draft ?? inv
  async function submit(event: FormEvent) { event.preventDefault(); if (await save('rsvp', { response: value.response, attending: value.response === 'yes' ? value.attending || 1 : 0, version: value.version })) setDraft(null) }
  return <div className="card max-w-2xl"><h2 className="text-3xl font-semibold">Podemos contar com você?</h2><p className="mt-3 text-stone-600">Resposta atual: {responseLabels[inv.response]}{inv.response === 'yes' ? ` · ${inv.attending} pessoa(s)` : ''}.</p>
    <form className="mt-6 space-y-5" onSubmit={submit}><fieldset disabled={busy}><legend className="font-semibold">Sua confirmação</legend><div className="mt-3 grid gap-3">{(['yes', 'no', 'maybe'] as ResponseChoice[]).map(response => <label key={response} className="choice"><input type="radio" name="presence" checked={value.response === response} onChange={() => setDraft({ ...value, response, attending: value.attending || 1 })} />{responseLabels[response]}</label>)}</div></fieldset>
    {value.response === 'yes' && inv.kind === 'family' && <label className="field">Quantas pessoas vão?<input type="number" min={1} max={inv.capacity} step={1} required disabled={busy} value={value.attending || 1} onChange={e => setDraft({ ...value, attending: Number(e.target.value) })} /><span className="hint">Este convite inclui até {inv.capacity} pessoas.</span></label>}
    {draft && inv.version !== draft.version && <p role="status">Sua resposta mudou em outra sessão. <button type="button" className="text-link" onClick={() => setDraft(null)}>Usar resposta atual</button></p>}
    <button className="button" disabled={busy || value.response === 'pending'}>{busy ? 'Aguarde…' : 'Confirmar presença'}</button></form>
  </div>
}
function GuestGift({ item, alternatives, busy, closed, save }: { item: GuestItem; alternatives: GuestItem[]; busy: boolean; closed: boolean; save: Save }) {
  const [draft, setDraft] = useState<{ text: string; version: number | null } | null>(null)
  const [destination, setDestination] = useState('')
  const own = item.own
  const active = own && own.status !== 'cancelled'
  const purchased = own?.status === 'purchase_declared'
  const swapTargets = alternatives.filter(candidate => candidate.own?.status !== 'purchase_declared')
  const quantity = draft?.text ?? String(active ? own.quantity : 1)
  const available = availableOf(item)
  const purchaseHint = useId()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^[0-9]+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 1000) return
    if (await save('reserve', { item_id: item.id, quantity: Number(quantity), version: draft ? draft.version : own?.version ?? null }, active ? 'Escolha atualizada.' : undefined)) setDraft(null)
  }
  return <article className="card flex flex-col"><span className="badge self-start">{item.category === 'fralda' ? `Tamanho ${item.diaper_size}` : 'Mimo opcional'}</span><h3 className="mt-4 text-xl font-semibold">{item.title}</h3><p className="mt-3 flex-1 text-sm text-stone-600">{item.description}</p>
    <p className="mt-4 font-semibold">{available === null ? `${item.committed} unidade(s) prometida(s) · Sem limite` : `${available} de ${item.limit} pacotes disponíveis`}</p>
    {active && <p className="notice mt-3">Você confirmou {own.quantity} {item.category === 'fralda' ? 'pacote(s)' : 'unidade(s)'}.{purchased ? ' Compra informada por você. Para mudar a quantidade ou o tamanho, cancele a reserva e escolha de novo.' : ''}</p>}
    {!purchased && <form onSubmit={submit} className="mt-5 space-y-4"><label className="field">{item.category === 'fralda' ? 'Pacotes' : 'Quantidade'} de {item.title}<input type="number" min={1} step={1} max={available === null ? 1000 : Math.min(1000, available + (active ? own.quantity : 0))} required disabled={busy || closed} value={quantity} onChange={e => setDraft({ text: e.target.value, version: own?.version ?? null })} /></label>
    <button className="button" disabled={busy || closed || available === 0 && !active}>{active ? 'Atualizar minha escolha' : available === 0 ? 'Tamanho completo' : 'Escolher presente'}</button></form>}
    {draft && draft.version !== (own?.version ?? null) && <p role="status" className="mt-3">A escolha mudou em outra sessão. <button className="text-link" onClick={() => setDraft(null)}>Usar escolha atual</button></p>}
    {active && !purchased && item.category === 'fralda' && !closed && <div className="mt-4 space-y-3"><label className="field">Trocar tamanho {item.diaper_size} por<select disabled={busy} value={destination} onChange={e => setDestination(e.target.value)}><option value="">Escolha outro tamanho</option>{swapTargets.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.diaper_size} · {availableOf(candidate) ?? 0} disponíveis</option>)}</select></label><button className="secondary" disabled={busy || !destination} onClick={() => { const target = swapTargets.find(candidate => candidate.id === destination); if (target) void save('swap', { from_item_id: item.id, item_id: target.id, version: own.version, destination_version: target.own?.version ?? null }).then(done => { if (done) { setDraft(null); setDestination('') } }) }}>Trocar meus {own.quantity} pacote(s)</button></div>}
    {active && <div className="mt-4 flex flex-wrap gap-x-4"><button className="text-link min-h-11" disabled={busy} onClick={() => void save('cancel', { item_id: item.id, version: own.version }).then(done => { if (done) setDraft(null) })}>Cancelar reserva</button>{!purchased && <button className="text-link min-h-11" disabled={busy} aria-describedby={purchaseHint} onClick={() => void save('purchase', { item_id: item.id, version: own.version })}>Já comprei</button>}</div>}
    {active && !purchased && <p id={purchaseHint} className="hint mt-1">“Já comprei” só avisa a organização que você já tem o presente. O site não faz pagamento nem confere a compra.</p>}
  </article>
}
