import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { getEvent, eventKeys } from '../events/api'
import { availableOf, invitations, panelSummary, responseLabels } from './api'
import type { Dashboard, DashboardReservation, Invitation, PanelSummary } from './api'
import { errorMessage } from '../../lib/errors'
import { live } from '../../lib/query'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'

export function InvitationsPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const cache = useQueryClient()
  const key = ['invitations', session?.user.id, id]
  const query = useQuery<Dashboard>({ queryKey: key, queryFn: () => invitations(id), ...live })
  const event = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), ...live })
  const [editing, setEditing] = useState<Invitation | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('individual')
  const [capacity, setCapacity] = useState('2')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)
  const [error, setError] = useState('')
  const linkField = useRef<HTMLInputElement>(null)
  // O link novo pode ter sido pedido lá embaixo, na lista: o foco vai até ele.
  useEffect(() => { if (link) linkField.current?.focus() }, [link])
  async function act(action: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(''); setNotice(''); setCopyFailed(false)
    try {
      const result = await invitations(id, action, payload)
      if (result.token) { setLink(`${window.location.origin}/convite#${result.token}`); setNotice('Convite pronto. Copie o link e envie pelo WhatsApp.') }
      else if (action === 'update') { setNotice('Convite atualizado.'); setEditing(null) }
      else setNotice('Convite revogado. O acesso anterior não funciona mais; as respostas e escolhas foram preservadas.')
      if (action === 'create') setName('')
      await cache.invalidateQueries({ queryKey: key })
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  function create(e: FormEvent) { e.preventDefault(); void act('create', { name, kind, capacity: kind === 'individual' ? 1 : Number(capacity) }) }
  const ready = event.data?.status === 'published'
  const heading = <><Link className="text-link" to={`/eventos/${id}`}>← Detalhes do evento</Link><p className="eyebrow mt-7 break-words">{event.data?.title}</p><h1 className="page-title">Convites e confirmações</h1></>
  if (query.isPending) return <section className="page">{heading}<LoadingState>Carregando seu painel…</LoadingState></section>
  if (!query.data) return <section className="page">{heading}<div className="mt-6"><ErrorState title="Não foi possível abrir o painel." message={errorMessage(query.error)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div></section>
  const data = query.data
  const feedback = <>{notice && <div className="mt-4"><SuccessMessage>{notice}</SuccessMessage></div>}{error && <div className="mt-4"><ErrorState message={error} /></div>}</>
  return <section className="page">
    {heading}
    <p className="mt-4 text-stone-600">Um lugar para acompanhar quem vem e o carinho que cada pessoa vai trazer.</p>
    <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} label="Atualizando painel…" />
    <Summary summary={panelSummary(data)} />
    <Diapers items={data.items.filter(item => item.category === 'fralda')} eventId={id} />
    <Treats items={data.items.filter(item => item.category === 'mimo')} />

    <section className="card mt-12" aria-labelledby="new-invitation"><h2 id="new-invitation" className="text-2xl font-semibold">Convide alguém especial</h2>
      {!ready && <p className="notice mt-4">Publique o evento para criar ou reemitir convites.</p>}
      <form className="mt-5 grid items-end gap-4 md:grid-cols-2" onSubmit={create}><label className="field">Nome da pessoa ou família<input required maxLength={120} value={name} disabled={busy || !ready} onChange={e => setName(e.target.value)} /></label>
      <label className="field">Tipo de convite<select value={kind} disabled={busy || !ready} onChange={e => setKind(e.target.value)}><option value="individual">Individual</option><option value="family">Família</option></select></label>
      {kind === 'family' && <label className="field">Máximo de pessoas neste convite<input type="number" min={1} max={50} required value={capacity} disabled={busy || !ready} onChange={e => setCapacity(e.target.value)} /></label>}
      <button className="button justify-center" disabled={busy || !ready}>{busy ? 'Aguarde…' : 'Criar convite'}</button></form>
      {link && <div className="notice mt-5"><label className="field">Link para compartilhar<input ref={linkField} readOnly value={link} onFocus={e => e.target.select()} /></label><p className="hint mt-2">Guarde este link. Por segurança, ele só aparece na emissão.</p>{copyFailed && <p role="status" className="mt-2 font-semibold">Não foi possível copiar. Selecione o campo do link e copie manualmente.</p>}<button className="secondary mt-3" onClick={() => void navigator.clipboard.writeText(link).then(() => { setCopyFailed(false); setNotice('Link copiado.') }).catch(() => { setNotice(''); setCopyFailed(true) })}>Copiar convite</button></div>}
      {!editing && feedback}
    </section>
    {editing && <section className="card mt-8" aria-labelledby="edit-invitation"><h2 id="edit-invitation" className="text-2xl font-semibold">Editar convite</h2>
      <form className="mt-5 grid gap-4" onSubmit={e => { e.preventDefault(); void act('update', { id: editing.id, version: editing.version, name: editing.name, kind: editing.kind, capacity: editing.capacity }) }}>
        <label className="field">Nome no convite<input required maxLength={120} disabled={busy} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
        <label className="field">Tipo atualizado<select disabled={busy} value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as Invitation['kind'], capacity: e.target.value === 'individual' ? 1 : editing.capacity })}><option value="individual">Individual</option><option value="family">Família</option></select></label>
        <label className="field">Limite de pessoas<input required type="number" min={1} max={editing.kind === 'individual' ? 1 : 50} disabled={busy} value={editing.capacity} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) })} /></label>
        <p className="hint">O limite deve comportar todas as pessoas já confirmadas.</p>
        <div className="flex flex-wrap gap-4"><button className="button" disabled={busy || !ready}>Salvar convite</button><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar edição</button></div>
      </form>
      {feedback}
    </section>}
    <section className="mt-10" aria-labelledby="invites-title"><h2 id="invites-title" className="text-2xl font-semibold">Quem vai celebrar com vocês</h2>
      {!data.invitations.length ? <div className="mt-4"><EmptyState title="Nenhum convite ainda.">Crie o primeiro convite no formulário acima.</EmptyState></div> :
      <ul className="mt-5 grid gap-4 md:grid-cols-2">{data.invitations.map(inv => <li key={inv.id} className="card"><span className="badge">{inv.kind === 'family' ? `Família · até ${inv.capacity} pessoas` : 'Individual'}</span><h3 className="mt-3 text-xl font-semibold break-words">{inv.name}</h3><p className="mt-2">{responseLabels[inv.response]}{inv.response === 'yes' ? ` · ${inv.attending} pessoa(s)` : ''}</p>{inv.revoked && <p className="error mt-2">Acesso revogado; escolhas preservadas.</p>}<div className="mt-4 flex flex-wrap gap-3"><button className="secondary" disabled={busy || !ready} onClick={() => { setEditing({ ...inv }); setError(''); setNotice('') }}>Editar convite de {inv.name}</button><button className="secondary" disabled={busy || !ready} onClick={() => { if (window.confirm('Gerar um novo link e invalidar o anterior? Respostas e presentes serão mantidos.')) void act('rotate', { id: inv.id }) }}>Reemitir link</button>{!inv.revoked && <button className="text-link min-h-11" disabled={busy} onClick={() => { if (window.confirm('Revogar este acesso? Respostas e presentes serão mantidos.')) void act('revoke', { id: inv.id }) }}>Revogar acesso</button>}</div></li>)}</ul>}
    </section>
    <Choices reservations={data.reservations} />
  </section>
}

function Figure({ value, of, children }: { value: number; of?: number | null; children: ReactNode }) {
  return <><p className="stat">{value}{of != null && <span className="text-lg font-normal text-stone-600"> de {of}</span>}</p><p className="mt-1">{children}</p></>
}

function Summary({ summary }: { summary: PanelSummary }) {
  const inv = summary.invitations
  const rows: [string, number][] = [[responseLabels.yes, inv.yes], [responseLabels.maybe, inv.maybe], [responseLabels.no, inv.no], [responseLabels.pending, inv.pending]]
  return <section className="mt-4" aria-labelledby="summary-title">
    <h2 id="summary-title" className="text-2xl font-semibold">Resumo</h2>
    <div className="stagger mt-5 grid gap-4 md:grid-cols-2">
      <article className="card" aria-labelledby="people-title"><h3 id="people-title" className="eyebrow">Pessoas</h3>
        <Figure value={summary.people_confirmed}>pessoas confirmadas</Figure>
        <p className="hint mt-3">Pessoas informadas nos convites com a resposta “{responseLabels.yes}”.</p>
      </article>
      <article className="card" aria-labelledby="answers-title"><h3 id="answers-title" className="eyebrow">Convites</h3>
        <Figure value={inv.answered} of={inv.total}>convites respondidos</Figure>
        <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-6">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-stone-200 py-1"><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        {inv.revoked > 0 && <p className="hint mt-3">{inv.revoked} {inv.revoked === 1 ? 'convite está' : 'convites estão'} com acesso revogado.</p>}
      </article>
    </div>
  </section>
}

type PanelItem = Dashboard['items'][number]

function Diapers({ items, eventId }: { items: PanelItem[]; eventId: string }) {
  return <section className="mt-10" aria-labelledby="diaper-totals"><h2 id="diaper-totals" className="text-2xl font-semibold">Fraldas por tamanho</h2>
    <p className="mt-2 text-stone-600">Pacotes comprometidos: os que os convidados vão levar e os que já informaram ter comprado.</p>
    {!items.length ? <div className="mt-5"><EmptyState title="Nenhum tamanho de fralda na lista.">Prepare a lista do chá para acompanhar os pacotes por tamanho.</EmptyState></div> :
      <ul className="stagger mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map(item => {
        const available = availableOf(item)
        const filled = item.limit ? Math.min(100, Math.round(item.committed / item.limit * 100)) : 0
        return <li className="card" key={item.id}><h3 className="eyebrow">Tamanho {item.diaper_size}</h3>
          <Figure value={item.committed} of={item.limit}>pacotes comprometidos</Figure>
          <div className="meter mt-3" aria-hidden="true"><span style={{ width: `${filled}%` }} /></div>
          <p className="mt-3 font-semibold">{available === 0 ? 'Tamanho completo' : `${available} ${available === 1 ? 'disponível' : 'disponíveis'}`}</p>
        </li>
      })}</ul>}
    <Link className="text-link mt-4 inline-block min-h-11 py-2" to={`/eventos/${eventId}/presentes`}>Organizar fraldas e mimos</Link>
  </section>
}

function Treats({ items }: { items: PanelItem[] }) {
  const chosen = items.filter(item => item.committed > 0)
  const others = items.filter(item => item.committed === 0)
  const units = (n: number) => `${n} ${n === 1 ? 'unidade' : 'unidades'}`
  return <section className="mt-10" aria-labelledby="treat-totals"><h2 id="treat-totals" className="text-2xl font-semibold">Mimos</h2>
    <p className="mt-2 text-stone-600">Mimos não têm limite: cada convidado informa quantas unidades vai levar.</p>
    {!items.length ? <div className="mt-5"><EmptyState title="Nenhum mimo na lista.">Os mimos são opcionais. Inclua-os pela lista de presentes, se quiser.</EmptyState></div> : <>
      {!chosen.length ? <div className="mt-5"><EmptyState title="Nenhum mimo escolhido ainda." /></div> :
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{chosen.map(item => <li className="card flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" key={item.id}><span className="font-semibold">{item.title}</span><span>{units(item.committed)}</span></li>)}</ul>}
      {others.length > 0 && <details className="mt-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Mimos ainda não escolhidos ({others.length})</summary><ul className="mt-2 list-disc space-y-1 pl-6 text-stone-600">{others.map(item => <li key={item.id}>{item.title}</li>)}</ul></details>}
    </>}
  </section>
}

const statusLabels: Record<string, string> = { reserved: 'Vai levar', purchase_declared: 'Compra informada' }

function Choices({ reservations }: { reservations: DashboardReservation[] }) {
  const groups = [['fralda', 'Fraldas'], ['mimo', 'Mimos']] as const
  return <section className="mt-10" aria-labelledby="promises"><h2 id="promises" className="text-2xl font-semibold">Escolhas dos convidados</h2>
    <p className="mt-2 text-stone-600">“Compra informada” é só uma declaração do convidado: o site não recebe pagamento nem confere a compra.</p>
    {!reservations.length ? <div className="mt-5"><EmptyState title="Nenhuma escolha ainda.">As escolhas dos convidados aparecerão aqui.</EmptyState></div> : groups.map(([category, label]) => {
      const list = reservations.filter(r => r.category === category)
      return <div key={category} className="mt-6"><h3 className="text-xl font-semibold">{label}</h3>
        {!list.length ? <p className="mt-2 text-stone-600">Nenhuma escolha de {label.toLowerCase()} ainda.</p> :
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{list.map((r, index) => <li className="card" key={r.id ?? index}><p className="font-semibold break-words">{r.title} · {r.quantity} {r.category === 'fralda' ? 'pacote(s)' : 'unidade(s)'}</p><p className="mt-2 break-words">{r.name}</p><span className="badge mt-3">{statusLabels[r.status] ?? r.status}</span></li>)}</ul>}
      </div>
    })}
  </section>
}
