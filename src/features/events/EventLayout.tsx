import { Suspense } from 'react'
import { Link, NavLink, Navigate, Outlet, useMatch, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { eventKeys, getEvent } from './api'
import { daysUntil, inSetup, pendingSteps, statusLabels } from './model'
import { SetupDock } from './SetupDock'
import { live } from '../../lib/query'
import { useAuth } from '../auth/context'
import { BackLink, StatusBadge } from '../../components/ui'
import { LoadingState } from '../../components/States'

const tabs = [['', 'Painel'], ['presentes', 'Presentes'], ['dados', 'Dados do evento']] as const

function countdown(days: number | null) {
  if (days === null || days < 0) return null
  return days === 0 ? 'É hoje' : days === 1 ? 'Falta 1 dia' : `Faltam ${days} dias`
}

// G4: cabeçalho e abas comuns às telas do organizador. Cada aba cuida dos
// próprios estados (carregando, erro, não encontrado); aqui só a identidade.
export function EventLayout() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const query = useQuery({ queryKey: [...eventKeys.detail(id), session?.user.id], queryFn: () => getEvent(id), retry: false, ...live })
  const event = query.data
  const when = event?.starts_at ? new Date(event.starts_at).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : null
  const left = event && event.status !== 'closed' ? countdown(daysUntil(event.starts_at)) : null
  // Na configuração (rascunho ou etapa pendente), a tela de dados fica sem abas:
  // o caminho segue pelos botões do fluxo e pela barra de pendências.
  const onData = useMatch('/eventos/:id/dados') !== null
  // Enquanto o evento carrega, a tela de dados fica sem abas: evita que apareçam e sumam.
  const showTabs = event !== null && !(onData && (!event || inSetup(event)))
  const docked = Boolean(event && pendingSteps(event).length)
  return <section className={docked ? 'page page-docked' : 'page'}>
    <BackLink to="/eventos">Seus eventos</BackLink>
    <header className="event-header">
      <div className="event-header-text">
        {event && <div className="card-badges"><StatusBadge tone={event.status === 'published' ? 'success' : 'neutral'}>{statusLabels[event.status]}</StatusBadge>{left && <StatusBadge tone="brand">{left}</StatusBadge>}</div>}
        <h1 className="page-title break-words">{event ? event.title || 'Evento sem título' : 'Seu evento'}</h1>
        {event && <p className="text-muted">{when ?? 'Data a definir'}</p>}
      </div>
      {event !== null && <Link className="secondary self-start" to={`/eventos/${id}/previa`}>Ver como o convidado vê</Link>}
    </header>
    {/* Evento inexistente: a aba mostra “Evento não encontrado”; abas e prévia não levariam a nada. */}
    {showTabs && <nav aria-label="Áreas do evento" className="event-tabs">
      {tabs.map(([path, label]) => <NavLink key={label} end to={`/eventos/${id}${path ? `/${path}` : ''}`}>{label}</NavLink>)}
    </nav>}
    {/* A troca de aba carrega só o conteúdo; o cabeçalho fica. */}
    <Suspense fallback={<LoadingState>Carregando…</LoadingState>}><Outlet /></Suspense>
    {event && <SetupDock event={event} />}
  </section>
}

// Endereço antigo do painel (“Convites e confirmações”).
export function LegacyPanelRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/eventos/${id}`} replace />
}

export function EventNotFound() {
  return <div className="tab-panel"><h2 className="tab-title">Evento não encontrado</h2><p className="mt-4">Confira o endereço e se está na conta correta.</p></div>
}
