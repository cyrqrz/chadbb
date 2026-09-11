import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { getEvent, eventKeys } from '../events/api'
import { invitations, responseLabels } from './api'
import type { Dashboard } from './api'
import { errorMessage } from '../../lib/errors'
import { live } from '../../lib/query'

export function InvitationsPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const cache = useQueryClient()
  const key = ['invitations', session?.user.id, id]
  const query = useQuery<Dashboard>({ queryKey: key, queryFn: () => invitations(id), ...live })
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), ...live })
  const [name, setName] = useState('')
  const [kind, setKind] = useState('individual')
  const [capacity, setCapacity] = useState('2')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function act(action: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await invitations(id, action, payload)
      if (result.token) { setLink(`${window.location.origin}/convite#${result.token}`); setNotice('Convite pronto. Copie o link e envie pelo WhatsApp.') }
      else setNotice('Convite revogado. O acesso anterior não funciona mais; as respostas e escolhas foram preservadas.')
      if (action === 'create') setName('')
      await cache.invalidateQueries({ queryKey: key })
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  function create(e: FormEvent) { e.preventDefault(); void act('create', { name, kind, capacity: kind === 'individual' ? 1 : Number(capacity) }) }
  const ready = event.data?.status === 'published'
  if (query.isPending) return <p role="status" className="page">Carregando seu painel…</p>
  if (!query.data) return <section className="page"><p role="alert">{errorMessage(query.error)}</p><button className="secondary mt-4" onClick={() => void query.refetch()}>Tentar novamente</button></section>
  const data = query.data
  const people = data.invitations.reduce((total, inv) => total + inv.attending, 0)
  const answered = data.invitations.filter(inv => inv.response !== 'pending').length
  return <section className="page">
    <Link className="text-link" to={`/eventos/${id}`}>← Detalhes do evento</Link><p className="eyebrow mt-7">{event.data?.title}</p><h1 className="page-title">Convites e confirmações</h1>
    <p className="mt-4 text-stone-600">Um lugar para acompanhar quem vem e o carinho que cada pessoa vai trazer.</p>
    {query.isFetching && <p className="mt-3 text-sm text-stone-600">Atualizando painel…</p>}
    {query.isError && <p role="alert" className="notice mt-4">Não foi possível atualizar. Exibindo a última consulta. <button className="text-link" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    <div className="mt-6 grid gap-4 sm:grid-cols-3">{[[people, 'Pessoas confirmadas'], [answered, 'Convites respondidos'], [data.invitations.length, 'Convites criados']].map(([n, label]) => <div className="card" key={label}><p className="text-4xl font-semibold">{n}</p><p className="mt-2 text-stone-600">{label}</p></div>)}</div>
    <section className="card mt-8" aria-labelledby="new-invitation"><h2 id="new-invitation" className="text-2xl font-semibold">Convide alguém especial</h2>
      {!ready && <p className="notice mt-4">Publique o evento para criar ou reemitir convites.</p>}
      <form className="mt-5 grid items-end gap-4 md:grid-cols-2" onSubmit={create}><label className="field">Nome da pessoa ou família<input required maxLength={120} value={name} disabled={busy || !ready} onChange={e => setName(e.target.value)} /></label>
      <label className="field">Tipo de convite<select value={kind} disabled={busy || !ready} onChange={e => setKind(e.target.value)}><option value="individual">Individual</option><option value="family">Família</option></select></label>
      {kind === 'family' && <label className="field">Máximo de pessoas neste convite<input type="number" min={1} max={50} required value={capacity} disabled={busy || !ready} onChange={e => setCapacity(e.target.value)} /></label>}
      <button className="button justify-center" disabled={busy || !ready}>{busy ? 'Aguarde…' : 'Criar convite'}</button></form>
      {link && <div className="notice mt-5"><label className="field">Link para compartilhar<input readOnly value={link} onFocus={e => e.target.select()} /></label><p className="hint mt-2">Guarde este link. Por segurança, ele só aparece na emissão.</p><button className="secondary mt-3" onClick={() => void navigator.clipboard.writeText(link).then(() => setNotice('Link copiado.')).catch(() => setNotice('Selecione o campo do link e copie manualmente.'))}>Copiar convite</button></div>}
      {notice && <p role="status" className="mt-4">{notice}</p>}{error && <p role="alert" className="error mt-4">{error}</p>}
    </section>
    <section className="mt-10" aria-labelledby="invites-title"><h2 id="invites-title" className="text-2xl font-semibold">Quem vai celebrar com vocês</h2>
      {!data.invitations.length && <p className="notice mt-4">Seu primeiro convite pode ser criado acima.</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-2">{data.invitations.map(inv => <article key={inv.id} className="card"><span className="badge">{inv.kind === 'family' ? `Família · até ${inv.capacity} pessoas` : 'Individual'}</span><h3 className="mt-3 text-xl font-semibold break-words">{inv.name}</h3><p className="mt-2">{responseLabels[inv.response]}{inv.response === 'yes' ? ` · ${inv.attending} pessoa(s)` : ''}</p>{inv.revoked && <p className="error mt-2">Acesso revogado; escolhas preservadas.</p>}<div className="mt-4 flex flex-wrap gap-3"><button className="secondary" disabled={busy || !ready} onClick={() => { if (window.confirm('Gerar um novo link e invalidar o anterior? Respostas e presentes serão mantidos.')) void act('rotate', { id: inv.id }) }}>Reemitir link</button>{!inv.revoked && <button className="text-link min-h-11" disabled={busy} onClick={() => { if (window.confirm('Revogar este acesso? Respostas e presentes serão mantidos.')) void act('revoke', { id: inv.id }) }}>Revogar acesso</button>}</div></article>)}</div>
    </section>
    <section className="mt-10" aria-labelledby="diaper-totals"><h2 id="diaper-totals" className="text-2xl font-semibold">Fraldas por tamanho</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.items.filter(i => i.category === 'fralda').map(item => <article className="card" key={item.id}><p className="eyebrow">Tamanho {item.diaper_size}</p><p className="text-3xl font-semibold">{item.committed} / {item.limit}</p><p className="mt-2 text-sm">pacotes confirmados</p><p className="mt-3">{(item.limit ?? 0) - item.committed} disponíveis</p></article>)}</div><Link className="text-link mt-4 inline-block" to={`/eventos/${id}/presentes`}>Organizar fraldas e mimos</Link></section>
    <section className="mt-10" aria-labelledby="promises"><h2 id="promises" className="text-2xl font-semibold">Presentes confirmados</h2><p className="mt-2 text-stone-600">Mimos não têm limite. “Compra informada” é uma declaração do convidado.</p>
      {!data.reservations.length ? <p className="notice mt-4">As escolhas dos convidados aparecerão aqui.</p> : <ul className="mt-5 grid gap-3 md:grid-cols-2">{data.reservations.map((r, index) => <li className="card" key={index}><p className="font-semibold">{r.title} · {r.quantity} {r.category === 'fralda' ? 'pacote(s)' : 'unidade(s)'}</p><p className="mt-2 break-words">{r.name}</p><p className="hint mt-2">{r.status === 'purchase_declared' ? 'Compra informada' : 'Vai levar'}</p></li>)}</ul>}
    </section>
  </section>
}
