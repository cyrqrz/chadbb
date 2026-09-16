import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { backend, supabase } from '../../lib/supabase'
import { errorMessage } from '../../lib/errors'
import { useAuth } from './context'
import { LoadingState } from '../../components/States'

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
  return <section className="page max-w-xl">
    <p className="eyebrow">Seu encontro começa aqui</p><h1 className="page-title">Entre para organizar</h1>
    <p className="mt-4 text-stone-600">Receba um link de acesso por e-mail. Abra no mesmo navegador em que você o solicitou.</p>
    {backend.status !== 'ready' ? <div role="status" className="notice mt-8">O acesso ainda não está disponível neste ambiente. {backend.message}</div> :
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="field">Seu e-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
        <button className="button" disabled={busy}>{busy ? 'Enviando…' : sent ? 'Enviar outro link' : 'Receber link de acesso'}</button>
        {sent && <p role="status" className="notice">Confira sua caixa de entrada e o spam. Se o endereço puder receber acesso, o link chegará em instantes.</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </form>}
  </section>
}
