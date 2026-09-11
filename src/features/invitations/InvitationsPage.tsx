import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { eventKeys, getEvent } from '../events/api'
import { errorMessage } from '../../lib/errors'
import { createInvitation, invitationKey, listInvitations, responseLabels, revokeInvitation } from './api'

export function InvitationsPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const [label, setLabel] = useState('')
  const [names, setNames] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const cache = useQueryClient()
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false })
  const list = useQuery({ queryKey: [...invitationKey(id), session?.user.id, page], queryFn: () => listInvitations(id, page), enabled: Boolean(event.data) })
  async function create(e: FormEvent) {
    e.preventDefault()
    if (busy || !event.data?.starts_at) return
    const people = names.split('\n').map(name => name.trim()).filter(Boolean)
    if (!people.length || people.length > 20 || people.some(name => name.length > 100)) { setError('Informe de 1 a 20 pessoas, uma por linha, com até 100 caracteres por nome.'); return }
    setBusy(true); setError(''); setMessage(''); setLink('')
    try {
      const result = await createInvitation(id, label.trim(), people, null)
      setLink(`${window.location.origin}/convite#${result.token}`)
      setLabel(''); setNames(''); setPage(0)
      await cache.invalidateQueries({ queryKey: invitationKey(id) })
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  async function revoke(invitationId: string) {
    if (busy || !window.confirm('Revogar este convite? O link e os acessos da família deixarão de funcionar.')) return
    setBusy(true); setError(''); setMessage('')
    try { await revokeInvitation(id, invitationId); setLink(''); await cache.invalidateQueries({ queryKey: invitationKey(id) }); setMessage('Convite revogado.') }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  if (event.isPending) return <p role="status" className="page">Carregando evento…</p>
  if (event.isError || !event.data) return <section className="page"><p role="alert">{event.isError ? errorMessage(event.error) : 'Evento não encontrado.'}</p><Link to="/eventos" className="text-link">Seus eventos</Link></section>
  return <section className="page max-w-3xl">
    <Link to={`/eventos/${id}`} className="text-link">← Detalhes do evento</Link>
    <h1 className="page-title mt-6">Convites e presença</h1>
    <p className="mt-4">Um link para cada família. Cadastre todos os nomes; a família poderá responder por cada pessoa.</p>
    {event.data.status === 'published' ? <form onSubmit={create} className="card mt-6 space-y-5">
      <label className="field">Nome da família ou grupo<input required maxLength={120} value={label} disabled={busy} onChange={e => setLabel(e.target.value)} placeholder="Família da Ana" /></label>
      <label className="field">Pessoas convidadas<textarea required rows={5} maxLength={2020} value={names} disabled={busy} onChange={e => setNames(e.target.value)} placeholder={'Ana\nPedro\nLuiza'} /><span className="hint">Uma pessoa por linha, até 20. Inclua crianças e acompanhantes.</span></label>
      <p className="text-sm">O link pode ser reaberto até ser revogado. As respostas só podem ser alteradas antes do início do evento. Para corrigir os nomes, revogue o convite e emita outro.</p>
      <button className="button" disabled={busy}>{busy ? 'Aguarde…' : 'Criar convite familiar'}</button>
    </form> : <p className="notice mt-6">{event.data.status === 'draft' ? 'Publique o evento para emitir convites.' : 'Evento encerrado. Não é possível emitir novos convites ou alterar presenças.'}</p>}
    {link && <div className="notice mt-6 space-y-4"><p>Copie agora: este link só aparece nesta emissão. Quem o receber terá acesso aos detalhes do evento e às respostas desta família.</p><label className="field">Link do convite<input readOnly value={link} onFocus={e => e.target.select()} /></label><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage('Link copiado.') } catch { setError('Selecione o link e copie manualmente.') } }}>Copiar link</button><button className="text-link ml-4" onClick={() => setLink('')}>Ocultar link</button></div>}
    {error && <p role="alert" className="error mt-5">{error}</p>}{message && <p role="status" className="mt-5">{message}</p>}
    <div className="mt-10 flex items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Famílias convidadas</h2><button className="text-link" onClick={() => void list.refetch()}>Atualizar respostas</button></div>
    {list.isPending ? <p role="status" className="mt-4">Carregando convites…</p> : list.isError ? <p role="alert" className="error mt-4">{errorMessage(list.error)}</p> : <>
      {!list.data.count && <p className="card mt-5">Nenhum convite criado ainda.</p>}
      {list.data.invitations.map(invitation => <article key={invitation.id} className="card mt-5"><h3 className="text-xl font-semibold break-words">{invitation.label}</h3><p className="mt-2 text-sm">{invitation.revoked_at ? 'Revogado' : 'Não revogado'} · {invitation.expires_at ? `Expira em ${new Date(invitation.expires_at).toLocaleString('pt-BR')}` : 'Sem expiração automática'}</p><ul className="mt-4 space-y-2">{[...invitation.invitation_people].sort((a, b) => a.position - b.position).map(person => <li key={person.id} className="break-words">{person.name}: <strong>{responseLabels[person.rsvps.response]}</strong></li>)}</ul>{!invitation.revoked_at && <button className="secondary mt-5" disabled={busy} onClick={() => void revoke(invitation.id)}>Revogar convite de {invitation.label}</button>}</article>)}
      {list.data.count > 20 && <nav className="mt-5 flex gap-5" aria-label="Paginação dos convites"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={(page + 1) * 20 >= list.data.count} onClick={() => setPage(page + 1)}>Próxima</button></nav>}
    </>}
  </section>
}
