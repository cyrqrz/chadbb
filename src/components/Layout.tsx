import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { supabase } from '../lib/supabase'
import { useOnline } from '../lib/useOnline'
import { ErrorState } from './States'

export function Layout() {
  const { session } = useAuth()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function signOut() {
    setBusy(true); setError(false)
    try { const result = await supabase?.auth.signOut({ scope: 'local' }); if (result?.error) throw result.error }
    catch { setError(true) } finally { setBusy(false) }
  }
  return <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 md:px-12">
    <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
    <header className="site-header border-b border-stone-300">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
        <Link to="/" aria-label="chadbb, início" className="brand inline-flex min-h-11 items-center gap-2.5 text-xl font-extrabold tracking-tight"><span className="brand-mark" aria-hidden="true">c</span>chadbb<span className="-ml-2.5 text-brand" aria-hidden="true">.</span></Link>
        <nav aria-label="Menu principal" className="flex flex-wrap items-center gap-1 text-sm">
          {session ? <><Link className="nav-link" to="/eventos">Seus eventos</Link><button className="nav-link" disabled={busy} onClick={() => void signOut()}>{busy ? 'Saindo…' : 'Sair'}</button></> : <Link className="nav-link" to="/entrar">Entrar para organizar</Link>}
        </nav>
      </div>
    </header>
    {error && <div className="mt-4"><ErrorState message="Não foi possível sair. Tente novamente." /></div>}
    {/* G5.3: `navigator.onLine` só fala da interface de rede do aparelho; a reconsulta ao
        voltar (src/lib/query.ts) é quem garante o dado atualizado, não este aviso. */}
    {!online && <p role="status" className="state state-warning mt-4">Sem conexão. O que está na tela continua visível, mas alterações não serão enviadas até a internet voltar.</p>}
    <main id="conteudo" className="min-w-0 flex-1"><Outlet /></main>
    <footer className="flex flex-wrap justify-between gap-2 border-t border-stone-300 py-6 text-sm text-stone-600"><span>chadbb · Pequenos começos, grandes encontros.</span><span>Presença, fraldas e mimos em um só lugar.</span></footer>
  </div>
}
