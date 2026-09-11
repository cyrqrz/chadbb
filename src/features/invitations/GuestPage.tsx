import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { clearGuest, guestExpiry, hasGuestSession, initializeGuest, readGuest, updateRsvp } from './guest'
import type { GuestInvitation } from './guest'
import type { Person } from './api'
import { responseLabels } from './api'
import { errorMessage } from '../../lib/errors'

export function GuestPage() {
  const { hash } = useLocation()
  const [invitation, setInvitation] = useState<GuestInvitation | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    void initializeGuest().then(readGuest).then(data => {
      if (!active) return
      setInvitation(data)
      setError('')
      timer = setTimeout(() => { clearGuest(); setInvitation(null); setError('Seu acesso expirou. Reabra o link do convite.') }, Math.max(0, guestExpiry() - Date.now()))
    }).catch(cause => { if (active) { setInvitation(null); setError(errorMessage(cause)) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; clearTimeout(timer) }
  }, [hash])
  async function refresh() {
    try { setInvitation(await readGuest()) } catch (cause) { setError(errorMessage(cause)); if (!hasGuestSession()) setInvitation(null) }
  }
  function failed(cause: unknown) { setError(errorMessage(cause)); if (!hasGuestSession()) setInvitation(null) }
  if (loading) return <p role="status" className="page">Abrindo seu convite…</p>
  if (!invitation) return <section className="page max-w-xl"><h1 className="page-title">Acesso ao convite</h1><p role="alert" className="notice mt-6">{error || 'Reabra o link que recebeu da organização.'}</p><p className="mt-5">Se o link foi revogado ou expirou, peça um novo convite à organização.</p></section>
  return <section className="page max-w-3xl"><p className="eyebrow break-words">{invitation.label}</p><h1 className="page-title break-words">{invitation.event.title}</h1><p className="mt-5 whitespace-pre-line break-words">{invitation.event.description}</p><p className="mt-5 font-semibold">{new Date(invitation.event.starts_at).toLocaleString('pt-BR')}</p><p className="mt-3 whitespace-pre-line break-words">{invitation.event.address}</p><p className="mt-3 whitespace-pre-line break-words">{invitation.event.instructions}</p>
    <h2 className="mt-10 text-2xl font-semibold">Quem vai participar?</h2><p className="mt-3">Responda por cada pessoa da família. Você pode mudar as respostas até o início do evento.</p>
    {invitation.read_only && <p className="notice mt-5">As respostas estão encerradas. Este convite está disponível somente para consulta.</p>}
    {error && <p role="alert" className="error mt-5">{error}</p>}
    <button className="text-link mt-5" onClick={() => { setError(''); void refresh() }}>Atualizar respostas</button>
    {invitation.people.map(person => <PersonRsvp key={`${person.id}-${person.version}`} person={person} readOnly={invitation.read_only} refresh={refresh} failed={failed} />)}
    <p className="notice mt-8">Ao recarregar ou fechar esta página, reabra o link original do convite para acessar novamente.</p>
  </section>
}
function PersonRsvp({ person, readOnly, refresh, failed }: { person: Person; readOnly: boolean; refresh: () => Promise<void>; failed: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  async function respond(value: string) {
    if (busy) return
    setBusy(true)
    try { await updateRsvp(person, value); await refresh() }
    catch (cause) { failed(cause); if (hasGuestSession()) await refresh() }
    finally { setBusy(false) }
  }
  return <fieldset className="card mt-6" disabled={busy || readOnly}><legend className="px-2 text-xl font-semibold break-words">{person.name}</legend><p aria-live="polite">Resposta: {responseLabels[person.response]}</p><div className="mt-4 flex flex-wrap gap-3">{(['yes', 'no', 'maybe'] as const).map(value => <button key={value} className={person.response === value ? 'button' : 'secondary'} aria-pressed={person.response === value} onClick={() => void respond(value)}>{responseLabels[value]}</button>)}</div>{busy && <p role="status" className="mt-3">Salvando resposta…</p>}</fieldset>
}
