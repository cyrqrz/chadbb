import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { backend, supabase } from '../../lib/supabase'
import { errorMessage } from '../../lib/errors'
import { useAuth } from './context'
import { ErrorState, LoadingState, SuccessMessage } from '../../components/States'

export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <section className="page"><LoadingState>Verificando seu acesso…</LoadingState></section>
  return session ? <Outlet /> : <Navigate to="/entrar" replace />
}
export function AuthCallback() {
  const { session, loading, error } = useAuth()
  if (loading) return <section className="page"><LoadingState>Concluindo seu acesso…</LoadingState></section>
  if (session) return <Navigate to="/eventos" replace />
  return <section className="page"><h1 className="page-title">Não foi possível entrar</h1><p role="alert" className="mt-6">{error ?? 'Solicite um novo link para acessar.'}</p><Link to="/entrar" className="button mt-6">Solicitar novo link</Link></section>
}
export function LoginPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true); setError(null); setSent(false)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      if (error) throw error
      setSent(true)
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  if (loading) return <section className="page"><LoadingState>Verificando seu acesso…</LoadingState></section>
  if (session) return <Navigate to="/eventos" replace />
  return <section className="login-shell">
    <div className="login-form">
      <p className="eyebrow">Seu encontro começa aqui</p><h1 className="page-title">Entre para organizar</h1>
      <p className="mt-3 text-stone-600">Sem senha: enviamos um link de acesso para o seu e-mail. Abra no mesmo navegador em que você o pediu.</p>
      {backend.status !== 'ready' ? <div role="status" className="notice mt-8">O acesso ainda não está disponível neste ambiente. {backend.message}</div> :
        <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
          <label className="field">Seu e-mail<input type="email" autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
          <button className="button w-full" disabled={busy}>{busy ? 'Enviando…' : sent ? 'Enviar outro link' : 'Receber link de acesso'}</button>
          {sent && <SuccessMessage>Confira sua caixa de entrada e o spam. Se o endereço puder receber acesso, o link chegará em instantes.</SuccessMessage>}
          {error && <ErrorState message={error} />}
        </form>}
      <p className="login-guest">É convidado? Não precisa entrar: use o link que a organização enviou pelo WhatsApp.</p>
    </div>
    <aside className="login-aside" aria-labelledby="login-features">
      <h2 id="login-features" className="sr-only">O que o chadbb organiza</h2>
      <ul className="login-features">{features.map(([icon, title, text]) => <li key={title} className="login-feature"><span className="login-icon" aria-hidden="true">{icons[icon]}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ul>
    </aside>
  </section>
}

const features = [
  ['check', 'Confirmação de presença', 'Cada convite tem o próprio link, e a família informa quantas pessoas vão.'],
  ['diaper', 'Fraldas por tamanho', 'P, M, G e XG com limite de pacotes, para os tamanhos ficarem equilibrados.'],
  ['gift', 'Mimos sem limite', 'O convidado escolhe um carinho a mais e informa quantas unidades vai levar.'],
  ['chat', 'Convite pelo WhatsApp', 'Quem é convidado não cria conta nem senha: basta abrir o link.'],
] as const

const svg = (path: string) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path.split('|').map(d => <path key={d} d={d} />)}</svg>
const icons = {
  check: svg('M20 6 9 17l-5-5'),
  diaper: svg('M3 6h18v4a9 9 0 0 1-18 0Z|M8 6v3|M16 6v3'),
  gift: svg('M4 11h16v9H4Z|M3 7h18v4H3Z|M12 7v13|M12 7C10 3 6.5 4 7.5 6.5 8 7 12 7 12 7Zm0 0c2-4 5.5-3 4.5-.5C16 7 12 7 12 7Z'),
  chat: svg('M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z'),
}
