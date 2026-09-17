import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { queryClient } from './lib/query'
import { HomePage } from './features/home/HomePage'
import { Layout } from './components/Layout'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthCallback, LoginPage, RequireAuth } from './features/auth/LoginPage'
import { LoadingState } from './components/States'

const EventsPage = lazy(() => import('./features/events/EventsPage').then(m => ({ default: m.EventsPage })))
const EventLayout = lazy(() => import('./features/events/EventLayout').then(m => ({ default: m.EventLayout })))
const LegacyPanelRedirect = lazy(() => import('./features/events/EventLayout').then(m => ({ default: m.LegacyPanelRedirect })))
const EventPage = lazy(() => import('./features/events/EventPage').then(m => ({ default: m.EventPage })))

const GiftListPage = lazy(() => import('./features/gifts/GiftListPage').then(m => ({ default: m.GiftListPage })))

const GuestPage = lazy(() => import('./features/guests/GuestPage').then(m => ({ default: m.GuestPage })))
// Amostras do design system: só no servidor de desenvolvimento (fora do build).
const SpecimensPage = import.meta.env.DEV ? lazy(() => import('./features/specimens/SpecimensPage').then(m => ({ default: m.SpecimensPage }))) : null
const InvitePreview = lazy(() => import('./features/guests/InvitePreview').then(m => ({ default: m.InvitePreview })))
const InvitationsPage = lazy(() => import('./features/guests/InvitationsPage').then(m => ({ default: m.InvitationsPage })))

export function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider>
    <Suspense fallback={<section className="page"><LoadingState>Carregando…</LoadingState></section>}>
      <Routes><Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/convite" element={<GuestPage />} />
        <Route path="/entrar" element={<LoginPage />} />
        {SpecimensPage && <Route path="/amostras" element={<SpecimensPage />} />}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/eventos" element={<EventsPage />} />
          <Route path="/eventos/:id" element={<EventLayout />}>
            <Route index element={<InvitationsPage />} />
            <Route path="convites" element={<LegacyPanelRedirect />} />
            <Route path="presentes" element={<GiftListPage />} />
            <Route path="dados" element={<EventPage />} />
          </Route>
          <Route path="/eventos/:id/previa" element={<InvitePreview />} />
        </Route>
        <Route path="*" element={<section className="py-24"><h1>Página não encontrada</h1><p className="mt-4">Confira o endereço ou volte ao início.</p><a className="button mt-8" href="/">Voltar ao início</a></section>} />
      </Route></Routes>
    </Suspense>
  </AuthProvider></BrowserRouter></QueryClientProvider>
}
