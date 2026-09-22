import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/context'
import { getEvent, eventKeys } from '../events/api'
import { availableOf, invitations, panelSummary, responseLabels } from './api'
import type { Dashboard, DashboardReservation, Invitation, PanelSummary } from './api'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { EmptyState, ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { Button, ConfirmDialog, Progress, Skeleton, StatusBadge } from '../../components/ui'
import type { StatusTone } from '../../components/ui'
import { EventNotFound } from '../events/EventLayout'
import { StepCompletion } from '../events/SetupDock'

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
  // Só o "Salvar convite" responde no cartão de edição; o resto, junto do link novo.
  const [feedbackAt, setFeedbackAt] = useState<'create' | 'edit'>('create')
  const [error, setError] = useState('')
  const linkField = useRef<HTMLInputElement>(null)
  // “Convidar alguém” abre o formulário; ele continua aberto enquanto houver link novo ou aviso.
  const [inviting, setInviting] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  const formId = useId()
  const toggleId = useId()
  const [copied, setCopied] = useState(false)
  const [confirmClose, setConfirmClose] = useState<{ fromInside: boolean; thenEdit?: Invitation } | null>(null)
  // Ao fechar pelo botão de dentro do formulário, o foco volta para “Convidar alguém”.
  const refocus = useRef(false)
  useEffect(() => { if (inviting) nameField.current?.focus() }, [inviting])
  const open = inviting || Boolean(link)
  useEffect(() => { if (!open && refocus.current) { refocus.current = false; document.getElementById(toggleId)?.focus() } }, [open, toggleId])
  const loadError = useLastError(query.error)
  // O link novo pode ter sido pedido lá embaixo, na lista: o foco vai até ele.
  useEffect(() => { if (link) linkField.current?.focus() }, [link])
  async function act(action: string, payload: Record<string, unknown>) {
    if (busy) return
    if (!navigator.onLine) { setError(errorMessage(new Error('OFFLINE'))); return }
    setBusy(true); setError(''); setNotice(''); setCopyFailed(false); setFeedbackAt(action === 'update' ? 'edit' : 'create')
    try {
      const result = await invitations(id, action, payload)
      if (result.token) { setCopied(false); setLink(`${window.location.origin}/convite#${result.token}`); setNotice('Convite pronto. Copie o link e envie pelo WhatsApp.') }
      else if (action === 'update') { setNotice('Convite atualizado.'); setEditing(null) }
      else setNotice('Convite revogado. O acesso anterior não funciona mais; as respostas e escolhas foram preservadas.')
      if (action === 'create') { setName(''); setInviting(false) }
      await cache.invalidateQueries({ queryKey: key })
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  function create(e: FormEvent) { e.preventDefault(); void act('create', { name, kind, capacity: kind === 'individual' ? 1 : Number(capacity) }) }
  const ready = event.data?.status === 'published'
  const closed = event.data?.status === 'closed'
  if (event.data === null) return <EventNotFound />
  if (query.isPending && !(failedLast(query) && loadError)) return <div className="tab-panel"><LoadingState>Carregando seu painel…</LoadingState><PanelSkeleton /></div>
  if (!query.data) return <div className="tab-panel"><ErrorState title="Não foi possível abrir o painel." message={errorMessage(loadError)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div>
  const data = query.data
  // Quem respondeu que não vai e mesmo assim reservou presente. O vínculo é pelo
  // nome porque as reservas do painel ainda não trazem o convite (pedido ao Codex
  // em docs/TAREFAS-AGENTES.md): com nomes repetidos não há como saber de quem é
  // a reserva, então o selo fica de fora em vez de marcar a pessoa errada. A
  // escolha continua visível em "Escolhas dos convidados", onde é só fato.
  const homonyms = new Map<string, number>()
  for (const inv of data.invitations) homonyms.set(inv.name, (homonyms.get(inv.name) ?? 0) + 1)
  const sendingGift = new Set(data.reservations.filter(r => r.status !== 'cancelled' && homonyms.get(r.name) === 1).map(r => r.name))
  const feedback = <>{notice && <div className="mt-4"><SuccessMessage>{notice}</SuccessMessage></div>}{error && <div className="mt-4"><ErrorState message={error} /></div>}</>
  const formOpen = open
  // O aviso fica junto do que o provocou: formulário de convite, edição ou a lista.
  const feedbackPlace = editing && feedbackAt === 'edit' ? 'edit' : formOpen && feedbackAt === 'create' ? 'create' : 'list'
  function doCloseForm(fromInside: boolean) {
    setInviting(false); setLink(''); setNotice(''); setError(''); setCopied(false)
    refocus.current = fromInside
  }
  function closeForm(fromInside = false) {
    if (link && !copied) { setConfirmClose({ fromInside }); return }
    doCloseForm(fromInside)
  }
  // A16: só um formulário principal por vez — abrir "Editar convite" fecha o de
  // convidar (com a mesma confirmação de link não copiado), e abrir "Convidar
  // alguém" cancela uma edição em curso, como o próprio "Cancelar edição" já faz.
  function startEdit(inv: Invitation) {
    if (formOpen) {
      if (link && !copied) { setConfirmClose({ fromInside: false, thenEdit: inv }); return }
      doCloseForm(false)
    }
    setEditing({ ...inv }); setError(''); setNotice('')
  }
  return <div className="tab-panel">
    <RefreshStatus fetching={query.isFetching} failed={query.isError} onRetry={() => void query.refetch()} label="Atualizando painel…" />
    {event.data && <StepCompletion event={event.data} step="guests" />}
    <Summary summary={panelSummary(data)} />

    <section className="mt-10" aria-labelledby="invites-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 id="invites-title" className="text-2xl font-semibold">Convidados</h2><p className="mt-1 text-muted">Crie um convite para cada pessoa ou família e envie o link pelo WhatsApp.</p></div>
        {!closed && <Button id={toggleId} aria-expanded={formOpen} aria-controls={formId} disabled={!ready} onClick={() => { if (formOpen) { closeForm(); return } setEditing(null); setInviting(true) }}>Convidar alguém</Button>}
      </div>
      {closed ? <p className="notice mt-4">Este evento foi encerrado. Não é possível criar novos convites.</p> :
        !ready && <p className="notice mt-4">Publique o evento em “Dados do evento” para criar ou reemitir convites.</p>}
      {feedbackPlace === 'list' && <div className="guests-feedback">{feedback}</div>}
      {formOpen && <section id={formId} className="card mt-5" aria-labelledby="new-invitation"><h3 id="new-invitation" className="text-xl font-semibold">Convide alguém especial</h3>
        <form className="mt-5 grid items-end gap-4 md:grid-cols-2" onSubmit={create}><label className="field">Nome da pessoa ou família<input ref={nameField} required maxLength={120} value={name} disabled={busy || !ready} onChange={e => setName(e.target.value)} /></label>
        <label className="field">Tipo de convite<select value={kind} disabled={busy || !ready} onChange={e => setKind(e.target.value)}><option value="individual">Individual</option><option value="family">Família</option></select></label>
        {kind === 'family' && <label className="field">Máximo de pessoas neste convite<input type="number" min={1} max={50} required value={capacity} disabled={busy || !ready} onChange={e => setCapacity(e.target.value)} /></label>}
        <button className="button justify-center" disabled={busy || !ready}>{busy ? 'Aguarde…' : 'Criar convite'}</button></form>
        {link && <div className="notice mt-5"><label className="field">Link para compartilhar<input ref={linkField} readOnly value={link} onFocus={e => e.target.select()} /></label><p className="hint mt-2">Guarde este link. Por segurança, ele só aparece na emissão.</p>{copyFailed && <p role="status" className="mt-2 font-semibold">Não foi possível copiar. Selecione o campo do link e copie manualmente.</p>}<button className="secondary mt-3" onClick={() => void navigator.clipboard.writeText(link).then(() => { setCopyFailed(false); setCopied(true); setError(''); setFeedbackAt('create'); setNotice('Link copiado.') }).catch(() => { setNotice(''); setCopyFailed(true) })}>Copiar convite</button></div>}
        {feedbackPlace === 'create' && feedback}
        <Button variant="ghost" size="sm" className="mt-4" disabled={busy} onClick={() => closeForm(true)}>Fechar</Button>
      </section>}
      {editing && <section className="card mt-5" aria-labelledby="edit-invitation"><h3 id="edit-invitation" className="text-xl font-semibold">Editar convite</h3>
        <form className="mt-5 grid gap-4" onSubmit={e => { e.preventDefault(); void act('update', { id: editing.id, version: editing.version, name: editing.name, kind: editing.kind, capacity: editing.capacity }) }}>
          <label className="field">Nome no convite<input required maxLength={120} disabled={busy} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
          <label className="field">Tipo atualizado<select disabled={busy} value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as Invitation['kind'], capacity: e.target.value === 'individual' ? 1 : editing.capacity })}><option value="individual">Individual</option><option value="family">Família</option></select></label>
          <label className="field">Limite de pessoas<input required type="number" min={1} max={editing.kind === 'individual' ? 1 : 50} disabled={busy} value={editing.capacity} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) })} /></label>
          <p className="hint">O limite deve comportar todas as pessoas já confirmadas.</p>
          <div className="flex flex-wrap gap-4"><button className="button" disabled={busy || !ready}>Salvar convite</button><button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); if (feedbackAt === 'edit') setError('') }}>Cancelar edição</button></div>
        </form>
        {feedbackPlace === 'edit' && feedback}
      </section>}
      {!data.invitations.length ? <div className="mt-5"><EmptyState title="Nenhum convite ainda.">{closed ? 'Este evento foi encerrado sem convites.' : ready ? 'Use “Convidar alguém” para criar o primeiro convite.' : 'Depois de publicar o evento, use “Convidar alguém” para criar o primeiro convite.'}</EmptyState></div> :
      <ul className="mt-5 grid gap-4 md:grid-cols-2">{data.invitations.map(inv => <GuestCard key={inv.id} invitation={inv} sending={inv.response === 'no' && sendingGift.has(inv.name)} canEdit={!busy && ready} canRevoke={!busy}
        onEdit={() => startEdit(inv)}
        onRotate={() => void act('rotate', { id: inv.id })}
        onRevoke={() => void act('revoke', { id: inv.id })} />)}</ul>}
    </section>

    <Diapers items={data.items.filter(item => item.category === 'fralda')} eventId={id} />
    <Treats items={data.items.filter(item => item.category === 'mimo')} />
    <Choices reservations={data.reservations} />
    <ConfirmDialog open={confirmClose !== null} title="Fechar o formulário?"
      description="O link deste convite não aparece de novo: copie antes de fechar." confirmLabel="Fechar sem copiar" tone="danger"
      onCancel={() => setConfirmClose(null)}
      onConfirm={() => {
        const pending = confirmClose; setConfirmClose(null)
        if (!pending) return
        doCloseForm(pending.fromInside)
        if (pending.thenEdit) { setEditing({ ...pending.thenEdit }); setError(''); setNotice('') }
      }} />
  </div>
}

const responseTones: Record<Invitation['response'], StatusTone> = { yes: 'success', maybe: 'warning', no: 'neutral', pending: 'neutral' }
// Ícones próprios para não confundir a resposta com o selo do tipo de convite.
const responseIcons: Partial<Record<Invitation['response'], string>> = { no: '–', pending: '?' }

// G2.1: uma ação de edição (secundária), reemitir como auxiliar e revogar como
// destrutiva; o nome do convidado fica só no título e no nome acessível.
function GuestCard({ invitation: inv, sending, canEdit, canRevoke, onEdit, onRotate, onRevoke }: {
  invitation: Invitation; sending: boolean; canEdit: boolean; canRevoke: boolean; onEdit: () => void; onRotate: () => void; onRevoke: () => void
}) {
  // G5.1: cada card cuida do próprio diálogo, para o foco voltar ao botão certo.
  const [confirmAction, setConfirmAction] = useState<'rotate' | 'revoke' | null>(null)
  return <li className="card card-stack guest-card">
    <header className="card-header">
      <div className="card-badges">
        <StatusBadge tone="neutral">{inv.kind === 'family' ? `Família · até ${inv.capacity} pessoas` : 'Individual'}</StatusBadge>
        {inv.revoked && <StatusBadge tone="danger">Acesso revogado</StatusBadge>}
      </div>
      <h3 className="card-title">{inv.name}</h3>
    </header>
    <p className="card-badges"><StatusBadge tone={responseTones[inv.response]} icon={responseIcons[inv.response]}>{responseLabels[inv.response]}{inv.response === 'yes' ? ` · ${inv.attending} pessoa(s)` : ''}</StatusBadge>
      {sending && <StatusBadge tone="brand">Vai enviar presente</StatusBadge>}</p>
    {inv.revoked && <p className="hint">O link antigo não funciona mais; as respostas e escolhas foram preservadas.</p>}
    <div className="card-actions">
      <Button variant="secondary" size="sm" disabled={!canEdit} onClick={onEdit}>Editar convite<span className="sr-only"> de {inv.name}</span></Button>
      <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => setConfirmAction('rotate')}>Reemitir link</Button>
      {!inv.revoked && <Button variant="danger" size="sm" disabled={!canRevoke} onClick={() => setConfirmAction('revoke')}>Revogar acesso</Button>}
    </div>
    <ConfirmDialog open={confirmAction !== null}
      title={confirmAction === 'rotate' ? 'Gerar um novo link e invalidar o anterior?' : 'Revogar este acesso?'}
      description="Respostas e presentes serão mantidos." confirmLabel={confirmAction === 'rotate' ? 'Gerar novo link' : 'Revogar acesso'}
      tone={confirmAction === 'revoke' ? 'danger' : 'default'}
      onCancel={() => setConfirmAction(null)}
      onConfirm={() => { const action = confirmAction; setConfirmAction(null); if (action === 'rotate') onRotate(); else if (action === 'revoke') onRevoke() }} />
  </li>
}

// G5.2: forma do resumo (dois cards) e dos primeiros convites, sem esperar dado nenhum.
function PanelSkeleton() {
  return <div className="mt-4" aria-hidden="true">
    <div className="stagger mt-5 grid gap-4 md:grid-cols-2">{[0, 1].map(i =>
      <div key={i} className="card card-stack"><Skeleton width="35%" /><Skeleton width="25%" height="2rem" /><Skeleton width="75%" /></div>)}
    </div>
    <div className="mt-10 grid gap-4 md:grid-cols-2">{[0, 1].map(i =>
      <div key={i} className="card card-stack"><Skeleton width="40%" /><Skeleton width="60%" height="1.25rem" /><Skeleton width="50%" /></div>)}
    </div>
  </div>
}

function Figure({ value, of, children }: { value: number; of?: number | null; children: ReactNode }) {
  return <div><p className="stat">{value}{of != null && <span className="text-lg font-normal text-muted"> de {of}</span>}</p><p className="mt-1">{children}</p></div>
}

function Summary({ summary }: { summary: PanelSummary }) {
  const inv = summary.invitations
  const rows: [string, number][] = [[responseLabels.yes, inv.yes], [responseLabels.maybe, inv.maybe], [responseLabels.no, inv.no], [responseLabels.pending, inv.pending]]
  return <section className="mt-4" aria-labelledby="summary-title">
    <h2 id="summary-title" className="text-2xl font-semibold">Resumo</h2>
    <div className="stagger mt-5 grid gap-4 md:grid-cols-2">
      <article className="card card-stack" aria-labelledby="people-title"><h3 id="people-title" className="eyebrow">Pessoas</h3>
        <Figure value={summary.people_confirmed}>pessoas confirmadas</Figure>
        <p className="hint">Pessoas informadas nos convites com a resposta “{responseLabels.yes}”.</p>
      </article>
      <article className="card card-stack" aria-labelledby="answers-title"><h3 id="answers-title" className="eyebrow">Convites</h3>
        <Figure value={inv.answered} of={inv.total}>convites respondidos</Figure>
        <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-x-6">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-stone-200 py-1"><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        {inv.revoked > 0 && <p className="hint">{inv.revoked} {inv.revoked === 1 ? 'convite está' : 'convites estão'} com acesso revogado.</p>}
      </article>
    </div>
  </section>
}

type PanelItem = Dashboard['items'][number]

// G4: uma lista de progresso, sem um card por tamanho.
function Diapers({ items, eventId }: { items: PanelItem[]; eventId: string }) {
  return <section className="mt-10" aria-labelledby="diaper-totals"><h2 id="diaper-totals" className="text-2xl font-semibold">Fraldas por tamanho</h2>
    <p className="mt-2 text-muted">Pacotes comprometidos: os que os convidados vão levar e os que já informaram ter comprado.</p>
    {!items.length ? <div className="mt-5"><EmptyState title="Nenhum tamanho de fralda na lista.">Prepare a lista do chá para acompanhar os pacotes por tamanho.</EmptyState></div> :
      <ul className="card progress-list mt-5">{items.map(item => {
        const available = availableOf(item)
        const limit = item.limit ?? 0
        return <li key={item.id} className="progress-row">
          <div className="progress-row-head">
            <h3 className="font-bold">Tamanho {item.diaper_size}</h3>
            {available === 0 && <StatusBadge tone="success">Completo</StatusBadge>}
            <p className="progress-row-figure"><strong>{item.committed}</strong> de {item.limit} <span className="text-muted">pacotes</span></p>
          </div>
          <Progress value={item.committed} max={limit} label={`${item.committed} de ${limit} pacotes comprometidos`} />
          {available !== 0 && <p className="hint">{available} {available === 1 ? 'disponível' : 'disponíveis'}</p>}
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
    <p className="mt-2 text-muted">Mimos não têm limite: cada convidado informa quantas unidades vai levar.</p>
    {!items.length ? <div className="mt-5"><EmptyState title="Nenhum mimo na lista.">Os mimos são opcionais. Inclua-os pela lista de presentes, se quiser.</EmptyState></div> : <>
      {!chosen.length ? <div className="mt-5"><EmptyState title="Nenhum mimo escolhido ainda." /></div> :
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{chosen.map(item => <li className="card card-stack" key={item.id}><h3 className="card-title">{item.title}</h3><p className="availability-text">{units(item.committed)}</p></li>)}</ul>}
      {others.length > 0 && <details className="mt-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Mimos ainda não escolhidos ({others.length})</summary><ul className="mt-2 list-disc space-y-1 pl-6 text-muted">{others.map(item => <li key={item.id}>{item.title}</li>)}</ul></details>}
    </>}
  </section>
}

const statusLabels: Record<string, string> = { reserved: 'Vai levar', purchase_declared: 'Compra informada' }
const statusTones: Record<string, StatusTone> = { reserved: 'brand', purchase_declared: 'success' }

function Choices({ reservations }: { reservations: DashboardReservation[] }) {
  const groups = [['fralda', 'Fraldas'], ['mimo', 'Mimos']] as const
  return <section className="mt-10" aria-labelledby="promises"><h2 id="promises" className="text-2xl font-semibold">Escolhas dos convidados</h2>
    <p className="mt-2 text-muted">“Compra informada” é só uma declaração do convidado: o site não recebe pagamento nem confere a compra.</p>
    {!reservations.length ? <div className="mt-5"><EmptyState title="Nenhuma escolha ainda.">As escolhas dos convidados aparecerão aqui.</EmptyState></div> : groups.map(([category, label]) => {
      const list = reservations.filter(r => r.category === category)
      return <div key={category} className="mt-6"><h3 className="text-xl font-semibold">{label}</h3>
        {!list.length ? <p className="mt-2 text-muted">Nenhuma escolha de {label.toLowerCase()} ainda.</p> :
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{list.map((r, index) => <li className="card card-stack" key={r.id ?? index}>
            <header className="card-header">
              <div className="card-badges"><StatusBadge tone={statusTones[r.status] ?? 'neutral'}>{statusLabels[r.status] ?? r.status}</StatusBadge></div>
              <h4 className="card-title">{r.title} · {r.quantity} {r.category === 'fralda' ? (r.quantity === 1 ? 'pacote' : 'pacotes') : (r.quantity === 1 ? 'unidade' : 'unidades')}</h4>
            </header>
            <p className="break-words">{r.name}</p>
          </li>)}</ul>}
      </div>
    })}
  </section>
}
