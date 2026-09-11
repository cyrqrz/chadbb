import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { queryClient } from './lib/query'
import { HomePage } from './features/home/HomePage'
import { Layout } from './components/Layout'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthCallback, LoginPage, RequireAuth } from './features/auth/LoginPage'

const EventsPage = lazy(() => import('./features/events/EventsPage').then(m => ({ default: m.EventsPage })))
const EventPage = lazy(() => import('./features/events/EventPage').then(m => ({ default: m.EventPage })))

const GiftListPage = lazy(() => import('./features/gifts/GiftListPage').then(m => ({ default: m.GiftListPage })))

const GuestPage = lazy(() => import('./features/guests/GuestPage').then(m => ({ default: m.GuestPage })))
const InvitationsPage = lazy(() => import('./features/guests/InvitationsPage').then(m => ({ default: m.InvitationsPage })))

export function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider>
    <Suspense fallback={<p role="status" className="p-10">Carregando…</p>}>
      <Routes><Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/convite" element={<GuestPage />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/eventos" element={<EventsPage />} />
          <Route path="/eventos/:id/convites" element={<InvitationsPage />} />
          <Route path="/eventos/:id/presentes" element={<GiftListPage />} />
          <Route path="/eventos/:id" element={<EventPage />} />
        </Route>
        <Route path="*" element={<section className="py-24"><h1>Página não encontrada</h1><p className="mt-4">Confira o endereço ou volte ao início.</p><a className="button mt-8" href="/">Voltar ao início</a></section>} />
      </Route></Routes>
    </Suspense>
  </AuthProvider></BrowserRouter></QueryClientProvider>
}
