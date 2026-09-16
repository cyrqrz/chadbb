import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvent, eventKeys, listEvents } from './api'
import { statusLabels } from './model'
import { errorMessage } from '../../lib/errors'
import { failedLast, live } from '../../lib/query'
import { useLastError } from '../../lib/useLastError'
import { ErrorState, LoadingState, RefreshStatus } from '../../components/States'
import { useAuth } from '../auth/context'
import { Pagination } from '../../components/ui'

export function EventsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const navigate = useNavigate()
  const cache = useQueryClient()
  const query = useQuery({ queryKey: [...eventKeys.all, session?.user.id, page], queryFn: () => listEvents(page), ...live })
  const create = useMutation({ mutationFn: createEvent, onSuccess: async event => {
    await cache.invalidateQueries({ queryKey: eventKeys.all })
    navigate(`/eventos/${event.id}`)
  } })
  const loadError = useLastError(query.error)
  function submit(e: FormEvent) { e.preventDefault(); if (!create.isPending) create.mutate(title) }
  return <section className="page">
    <div className="flex flex-wrap items-center justify-between gap-6"><div><p className="eyebrow">Organize com carinho</p><h1 className="page-title">Seus eventos</h1>{query.isFetching && <p className="mt-2 text-sm text-stone-600">Atualizando…</p>}</div><button className="button" onClick={() => setCreating(!creating)}>{creating ? 'Fechar formulário' : 'Criar evento'}</button></div>
    {creating && <form onSubmit={submit} className="card mt-8 space-y-4"><label className="field">Nome do evento<input autoFocus maxLength={120} placeholder="Chá de bebê da família" value={title} onChange={e => setTitle(e.target.value)} /></label><p className="text-sm text-stone-600">Você pode completar os detalhes depois.</p><button className="button" disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar rascunho'}</button>{create.error && <p role="alert" className="error">{errorMessage(create.error)}</p>}</form>}
    {query.isPending && !(failedLast(query) && loadError) ? <LoadingState>Carregando eventos…</LoadingState> : !query.data ? <div className="mt-10"><ErrorState title="Não foi possível carregar seus eventos." message={errorMessage(loadError)} busy={query.isFetching} onRetry={() => void query.refetch()} /></div> : <>
      {query.isError && <RefreshStatus fetching={query.isFetching} failed onRetry={() => void query.refetch()} />}
      {query.data.events.length === 0 ? <div className="card mt-10"><h2 className="text-xl font-semibold">Seu primeiro encontro começa aqui.</h2><p className="mt-3 text-stone-600">Crie um evento para preparar os detalhes do chá de bebê.</p></div> :
        <div className="stagger mt-10 grid gap-5 md:grid-cols-2">{query.data.events.map(event => <Link className="card card-link block" to={`/eventos/${event.id}`} key={event.id}><span className="badge">{statusLabels[event.status]}</span><h2 className="mt-4 break-words text-2xl font-semibold">{event.title || 'Evento sem título'}</h2><p className="mt-3 text-stone-600">{event.starts_at ? new Date(event.starts_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : 'Data a definir'}</p><span className="text-link mt-6 inline-block">Ver detalhes →</span></Link>)}</div>}
      <Pagination page={page} count={query.data.count} pageSize={12} onChange={setPage} label="Paginação dos eventos" />
    </>}
  </section>
}
