import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { supabase } from '../lib/supabase'

export function Layout() {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function signOut() {
    setBusy(true); setError(false)
    try { const result = await supabase?.auth.signOut({ scope: 'local' }); if (result?.error) throw result.error }
    catch { setError(true) } finally { setBusy(false) }
  }
  return <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 md:px-12">
    <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-300 py-7">
      <Link to="/" aria-label="chadbb, início" className="text-2xl font-bold tracking-tight">chadbb<span className="text-orange-700">.</span></Link>
      <nav aria-label="Menu principal" className="flex items-center gap-5 text-sm">
        {session ? <><Link className="text-link" to="/eventos">Seus eventos</Link><button disabled={busy} onClick={() => void signOut()}>{busy ? 'Saindo…' : 'Sair'}</button></> : <Link className="text-link" to="/entrar">Organizar um evento</Link>}
      </nav>
    </header>
    {error && <p role="alert" className="error mt-4">Não foi possível sair. Tente novamente.</p>}
    <main id="conteudo" className="flex-1"><Outlet /></main>
    <footer className="border-t border-stone-300 py-6 text-sm text-stone-600">chadbb · Pequenos começos, grandes encontros.</footer>
  </div>
}
