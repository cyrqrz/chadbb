import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { backend, supabase } from '../../lib/supabase'
import { errorMessage } from '../../lib/errors'
import { LINK_FAILED, useAuth } from './context'
import { rememberDestination, safeInternalPath, takeDestination } from './destination'
import { ErrorState, LoadingState, SuccessMessage } from '../../components/States'
import { Button } from '../../components/ui'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <section className="page"><LoadingState>Verificando seu acesso…</LoadingState></section>
  // Quem foi barrado diz para onde queria ir; o login devolve a pessoa a esse
  // lugar em vez de largá-la sempre em "Seus eventos".
  return session ? <Outlet /> : <Navigate to="/entrar" replace state={{ from: `${location.pathname}${location.search}` }} />
}
export function AuthCallback() {
  const { session, loading, error } = useAuth()
  // Uma vez por montagem: `takeDestination` consome o destino, e recalcular a
  // cada render devolveria "/eventos" na segunda passada.
  const [target] = useState(() => takeDestination() ?? '/eventos')
  if (loading) return <section className="page"><LoadingState>Concluindo seu acesso…</LoadingState></section>
  if (session) return <Navigate to={target} replace />
  return <section className="page"><h1 className="page-title">Não foi possível entrar</h1><p role="alert" className="mt-6 max-w-2xl">{error ?? LINK_FAILED}</p><Link to="/entrar" className="button mt-6">Entrar com o código</Link></section>
}


const COOLDOWN = 60
type Failure = { status?: number; code?: string; message?: string }
// Quanto esperar: o Auth informa os segundos no limite de 60 s; no limite por hora, não.
function sendFailure(cause: unknown): { text: string; wait: number } {
  const failure = (cause ?? {}) as Failure
  // O Auth responde 500 `unexpected_failure` quando não consegue entregar o
  // e-mail. Cair no texto genérico manda a pessoa conferir a conexão, que está
  // boa — o problema é o endereço ou o remetente.
  if (failure.status === 500 || failure.code === 'unexpected_failure') {
    return { text: 'Não conseguimos enviar o e-mail para este endereço. Confira se ele está escrito certo ou fale com a organização.', wait: 0 }
  }
  if (failure.status !== 429) return { text: errorMessage(cause), wait: 0 }
  const seconds = Number(/after (\d+) seconds?/i.exec(failure.message ?? '')?.[1])
  if (seconds > 0) return { text: `Muitos pedidos em sequência. Aguarde ${seconds} segundos para pedir outro código.`, wait: seconds }
  return { text: 'O limite de pedidos de acesso foi atingido. Aguarde pelo menos 1 minuto; se continuar, tente de novo em até 1 hora. Se já recebeu um código, use “Já tenho um código”.', wait: COOLDOWN }
}
function codeFailure(cause: unknown) {
  const failure = (cause ?? {}) as Failure
  if (failure.status === 429) return 'Muitas tentativas de código. Aguarde alguns minutos antes de tentar de novo.'
  if (failure.status === 403 || failure.code === 'otp_expired') return 'Código inválido ou expirado. Peça um novo.'
  return errorMessage(cause)
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const from = safeInternalPath((location.state as { from?: unknown } | null)?.from)
  // O link do e-mail pode abrir em outra aba: o destino precisa sobreviver a ela.
  useEffect(() => { if (from) rememberDestination(from) }, [from])
  const [target] = useState(() => from ?? takeDestination() ?? '/eventos')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  // `codeFor`: o e-mail do passo do código (fica travado até “Usar outro e-mail”).
  const [codeFor, setCodeFor] = useState<string | null>(null)
  // Quantos envios deram certo para este e-mail (0 = digitou um código que já tinha).
  const [sent, setSent] = useState(0)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<{ at: 'email' | 'code'; text: string } | null>(null)
  const [waitUntil, setWaitUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const sending = useRef(false)
  // Código só vale uma vez: um segundo toque não pode mandar outra verificação.
  const verifying = useRef(false)
  const emailField = useRef<HTMLInputElement>(null)
  const codeField = useRef<HTMLInputElement>(null)
  const left = Math.max(0, Math.ceil((waitUntil - now) / 1000))
  useEffect(() => {
    if (!waitUntil) return
    const timer = window.setInterval(() => { const current = Date.now(); setNow(current); if (current >= waitUntil) { setWaitUntil(0); window.clearInterval(timer) } }, 1000)
    return () => window.clearInterval(timer)
  }, [waitUntil])
  useEffect(() => { if (codeFor) codeField.current?.focus(); else emailField.current?.focus() }, [codeFor])
  function wait(seconds: number) { const current = Date.now(); setNow(current); setWaitUntil(current + seconds * 1000) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || sending.current || left > 0) return
    sending.current = true
    const address = email.trim()
    setBusy(true); setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      if (error) throw error
      setSent(count => codeFor === address ? count + 1 : 1); setCode(''); setCodeFor(address); wait(COOLDOWN)
    } catch (cause) {
      const failure = sendFailure(cause)
      setError({ at: 'email', text: failure.text })
      if (failure.wait) wait(failure.wait)
    } finally { setBusy(false); sending.current = false }
  }
  function haveCode() {
    const address = email.trim()
    if (!address || !emailField.current?.checkValidity()) { setError({ at: 'email', text: 'Digite o e-mail para o qual o código foi enviado.' }); emailField.current?.focus(); return }
    setError(null); setSent(0); setCodeFor(address)
  }
  function otherEmail() { setCodeFor(null); setSent(0); setCode(''); setError(null) }
  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !codeFor || verifying.current) return
    if (!/^\d{8}$/.test(code)) { setError({ at: 'code', text: 'Digite os 8 números do código.' }); codeField.current?.focus(); return }
    verifying.current = true
    setChecking(true); setError(null)
    try {
      const { error } = await supabase.auth.verifyOtp({ email: codeFor, token: code, type: 'email' })
      if (error) throw error
    } catch (cause) { setError({ at: 'code', text: codeFailure(cause) }); codeField.current?.focus() } finally { setChecking(false); verifying.current = false }
  }
  if (loading) return <section className="page"><LoadingState>Verificando seu acesso…</LoadingState></section>
  if (session) return <Navigate to={target} replace />
  const sendLabel = busy ? 'Enviando…' : left > 0 ? `Pedir outro código em ${left} s` : sent || codeFor ? 'Pedir outro código' : 'Receber código de acesso'
  return <section className="login-shell">
    <div className="login-form">
      <p className="eyebrow">Seu encontro começa aqui</p><h1 className="page-title">Entre para organizar</h1>
      <p className="mt-3 text-stone-600">Sem senha: enviamos para o seu e-mail um código de 8 dígitos e um link de acesso. O código funciona em qualquer navegador.</p>
      {backend.status !== 'ready' ? <div role="status" className="notice mt-8">O acesso ainda não está disponível neste ambiente. {backend.message}</div> : <>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
          <label className="field">Seu e-mail<input ref={emailField} type="email" autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" required maxLength={254} value={email} readOnly={Boolean(codeFor)} aria-invalid={error?.at === 'email' || undefined} aria-describedby={codeFor ? 'login-email-locked' : error?.at === 'email' ? 'login-email-error' : undefined} onChange={e => setEmail(e.target.value)} /></label>
          {codeFor && <p id="login-email-locked" className="hint -mt-3">O código vale para este e-mail. <button type="button" className="text-link inline-flex min-h-11 items-center" onClick={otherEmail}>Usar outro e-mail</button></p>}
          <Button type="submit" className="w-full justify-center" busy={busy || left > 0}>{sendLabel}</Button>
          {!codeFor && <Button variant="ghost" className="self-start" onClick={haveCode}>Já tenho um código</Button>}
          {sent > 0 && codeFor && <div id="login-sent"><SuccessMessage>{sent > 1 ? 'Enviamos um novo código' : 'Enviamos um código'} e um link para {codeFor}. Confira a caixa de entrada e o spam; pode levar alguns minutos.</SuccessMessage></div>}
          {error?.at === 'email' && <div id="login-email-error"><ErrorState message={error.text} /></div>}
        </form>
        {codeFor && <form noValidate onSubmit={verify} className="card mt-6 flex flex-col gap-4" aria-labelledby="login-code-title">
          <h2 id="login-code-title" className="text-lg font-bold">Digite o código do e-mail</h2>
          <label className="field">Código de 8 dígitos<input ref={codeField} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required value={code}
            aria-invalid={error?.at === 'code' || undefined} aria-describedby={[sent > 0 && 'login-sent', error?.at === 'code' && 'login-code-error', 'login-code-hint'].filter(Boolean).join(' ')}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} /></label>
          <p id="login-code-hint" className="hint">O código vale por 1 hora e só uma vez. Pedir outro invalida o anterior. O link do e-mail também funciona, se aberto neste mesmo navegador.</p>
          <Button type="submit" className="w-full justify-center" busy={checking}>{checking ? 'Entrando…' : 'Entrar'}</Button>
          {error?.at === 'code' && <div id="login-code-error"><ErrorState message={error.text} /></div>}
        </form>}
      </>}
      <p className="login-guest"><strong>É convidado?</strong> Não precisa entrar: use o link que a organização enviou pelo WhatsApp.</p>
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
