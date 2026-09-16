import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { coverUrl, eventKeys, getEvent, saveEvent, transitionEvent, uploadCover } from './api'
import { statusLabels, toDraft, validateDraft, validateImage } from './model'
import type { EventDraft, EventRecord } from './model'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { useAuth } from '../auth/context'
import { ErrorState, LoadingState, RefreshStatus, SuccessMessage } from '../../components/States'
import { BackLink, Button } from '../../components/ui'

export function EventPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const query = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  const loadError = useLastError(query.error)
  // Erro só substitui a tela enquanto nada foi carregado; depois, o editor fica e avisa.
  if (query.isPending && !(failedLast(query) && loadError)) return <section className="page"><LoadingState>Carregando evento…</LoadingState></section>
  if (query.data === undefined) return <section className="page"><h1 className="page-title">Detalhes do evento</h1><div className="mt-6"><ErrorState title="Não foi possível abrir o evento." message={errorMessage(loadError)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div></section>
  if (!query.data) return <section className="page"><h1 className="page-title">Evento não encontrado</h1><p className="mt-4">Confira o endereço e se está na conta correta.</p><div className="mt-6"><BackLink to="/eventos">Seus eventos</BackLink></div></section>
  return <EventEditor key={query.data.id} server={query.data} refreshing={query.isFetching} refreshFailed={query.isError} retry={() => void query.refetch()} />
}
// `server` acompanha a consulta; `record` é a versão que este formulário editou.
// O rascunho digitado nunca é substituído por uma atualização recebida.
function EventEditor({ server, refreshing, refreshFailed, retry }: { server: EventRecord; refreshing: boolean; refreshFailed: boolean; retry: () => void }) {
  const [record, setRecord] = useState(server)
  const [draft, setDraft] = useState(() => toDraft(server))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [publicConsent, setPublicConsent] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const cache = useQueryClient()
  const { session } = useAuth()
  const purged = record.personal_data_purged_at !== null
  const closed = record.status === 'closed' || purged
  // Comparação por maior, e não por diferente: resposta antiga que chegue fora de
  // ordem depois de salvar não deve ser anunciada como alteração de outra sessão.
  const outdated = server.version > record.version
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record)) || imageFile !== null
  const update = (name: keyof EventDraft, value: string) => { setDraft(current => ({ ...current, [name]: value })); setMessage('') }
  async function accept(event: EventRecord) {
    setRecord(event); setDraft(toDraft(event)); setImageFile(null); setPublicConsent(false)
    // Resultado confirmado pelo servidor entra no cache antes da reconsulta, para
    // a tela não voltar por um instante ao estado anterior.
    cache.setQueryData([...eventKeys.detail(event.id), session?.user.id], event)
    await cache.invalidateQueries({ queryKey: eventKeys.all })
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const validation = validateDraft(draft, record.status === 'published')
    if (validation) { setError(validation); return }
    if (imageFile && !publicConsent) { setError('Autorize a divulgação da imagem antes de salvar.'); return }
    setBusy(true); setError(null); setMessage('')
    try {
      let nextDraft = draft
      if (imageFile) {
        const imageError = validateImage(imageFile)
        if (imageError) { setError(imageError); return }
        const path = await uploadCover(record, imageFile)
        nextDraft = { ...draft, cover_path: path }
        // Se salvar falhar, a retentativa reutiliza o upload já concluído.
        setDraft(nextDraft); setImageFile(null)
      }
      await accept(await saveEvent(record, nextDraft)); setMessage('Alterações salvas.')
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  async function transition(status: 'published' | 'closed') {
    if (busy || dirty) return
    const validation = status === 'published' ? validateDraft(draft, true) : null
    if (validation) { setError(validation); return }
    setBusy(true); setError(null); setMessage('')
    try { await accept(await transitionEvent(record, status)); setConfirmClose(false); setMessage(status === 'published' ? 'Evento publicado.' : 'Evento encerrado.') }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  async function reload() {
    if (dirty && !window.confirm('Descartar as alterações locais e carregar a versão salva?')) return
    setBusy(true); setError(null)
    try { const latest = await getEvent(record.id); if (!latest) throw new Error('EVENT_NOT_FOUND'); await accept(latest); setMessage('Dados recarregados.') }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  return <section className="page max-w-3xl">
    <BackLink to="/eventos">Seus eventos</BackLink>
    <div className="mt-7 flex flex-wrap items-center gap-4"><h1 className="page-title">Detalhes do evento</h1><span className="badge">{statusLabels[record.status]}</span><span className="refresh-status mt-0" aria-hidden={!refreshing}>{refreshing ? 'Atualizando…' : ''}</span></div>
    {refreshFailed && <RefreshStatus fetching={refreshing} failed onRetry={retry} />}
    {outdated && <div role="status" className="notice mt-6"><p>Este evento mudou em outra sessão. O que você digitou continua aqui.</p><Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => void reload()}>Recarregar dados</Button></div>}
    <nav aria-label="Áreas do evento" className="stagger mt-6 flex flex-wrap gap-3"><Link to={`/eventos/${record.id}/convites`} className="secondary">Convites e confirmações →</Link><Link to={`/eventos/${record.id}/presentes`} className="secondary">Lista de presentes →</Link></nav>
    {purged ? <p className="notice mt-6">Os dados pessoais deste evento foram excluídos conforme a política de retenção. Restam apenas título e datas.</p> :
      closed && <p className="notice mt-6">Este evento foi encerrado. Os detalhes estão disponíveis apenas para consulta.</p>}
    <form onSubmit={save} className="mt-8 space-y-8">
      <fieldset disabled={busy || closed} className="space-y-5">
        <legend className="mb-5 text-xl font-semibold">Para compartilhar</legend>
        <p className="text-sm text-stone-600">Título, descrição e imagem podem aparecer na prévia pública quando o evento for publicado.</p>
        <label className="field">Nome do evento<input maxLength={120} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Chá de bebê" /></label>
        <label className="field">Descrição pública<textarea rows={4} maxLength={2000} value={draft.public_description} onChange={e => update('public_description', e.target.value)} /></label>
        {draft.cover_path && <div><img className="max-h-64 w-full rounded-surface object-cover" src={coverUrl(draft.cover_path)} alt="Capa do evento" />{!closed && <Button variant="danger" size="sm" className="mt-3" onClick={() => setDraft({ ...draft, cover_path: null })}>Remover capa do evento</Button>}</div>}
        {!closed && <label className="field">Imagem de capa (opcional)<input key={imageFile ? 'selected' : 'empty'} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0] ?? null; setError(file ? validateImage(file) : null); setImageFile(file); setPublicConsent(false) }} /><span className="hint">JPEG, PNG ou WebP, até 5 MB.</span></label>}
        {imageFile && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={publicConsent} onChange={e => setPublicConsent(e.target.checked)} /><span>Tenho autorização para usar esta imagem e entendo que ela ficará acessível por link assim que for enviada, mesmo com o evento em rascunho.</span></label>}
      </fieldset>
      <fieldset disabled={busy || closed} className="space-y-5 border-t border-stone-300 pt-6">
        <legend className="pr-4 text-xl font-semibold">Só para convidados</legend>
        <p className="text-sm text-stone-600">Estes dados não entram na prévia pública.</p>
        <label className="field">Data e horário<input type="datetime-local" value={draft.localDate} onChange={e => update('localDate', e.target.value)} /><span className="hint">Horário de Brasília. Obrigatório para publicar.</span></label>
        <label className="field">Término<input type="datetime-local" value={draft.localEndDate} onChange={e => update('localEndDate', e.target.value)} /><span className="hint">Horário de Brasília. Obrigatório para publicar. Os dados pessoais dos convidados são excluídos 30 dias após o término.</span></label>
        <label className="field">Endereço privado<textarea rows={2} maxLength={500} value={draft.private_address} onChange={e => update('private_address', e.target.value)} /></label>
        <label className="field">Instruções aos convidados<textarea rows={3} maxLength={2000} value={draft.private_instructions} onChange={e => update('private_instructions', e.target.value)} /></label>
      </fieldset>
      {!closed && <button className="button" disabled={busy || !dirty}>{busy ? 'Aguarde…' : 'Salvar alterações'}</button>}
    </form>
    {error && <div className="mt-6"><ErrorState message={error} busy={busy} onRetry={() => void reload()} retryLabel="Recarregar dados" /></div>}
    {message && <div className="mt-6"><SuccessMessage>{message}</SuccessMessage></div>}
    {!closed && <div className="mt-10 border-t border-stone-300 pt-6">
      {dirty && <p className="mb-4 text-sm text-stone-600">Salve as alterações antes de publicar ou encerrar.</p>}
      {record.status === 'draft' ? <button className="secondary" disabled={busy || dirty} onClick={() => void transition('published')}>Publicar evento</button> :
        confirmClose ? <div className="notice"><p>Encerrar este evento? Ele não poderá receber novas reservas nem ser reaberto.</p><div className="mt-4 flex flex-wrap gap-4"><button className="btn-danger btn-danger-strong" disabled={busy || dirty} onClick={() => void transition('closed')}>Confirmar encerramento</button><Button variant="ghost" disabled={busy} onClick={() => setConfirmClose(false)}>Continuar com evento aberto</Button></div></div> :
          <button className="btn-danger" disabled={busy || dirty} onClick={() => setConfirmClose(true)}>Encerrar evento</button>}
    </div>}
  </section>
}
