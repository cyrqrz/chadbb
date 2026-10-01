import { SiteFooter } from './SiteFooter'
import { useLayoutEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useAuth } from '../features/auth/context'
import { supabase } from '../lib/supabase'
import { useOnline } from '../lib/useOnline'
import { ErrorState } from './States'

export function Layout() {
  const { session } = useAuth()
  const online = useOnline()
  const { pathname, hash } = useLocation()
  const navigation = useNavigationType()
  // O roteador não rola ao trocar de página: a nova abria na altura em que a
  // anterior estava (no celular, a política abria já no rodapé e parecia que o
  // link não funcionava). Link novo começa no topo; com âncora, a própria página
  // rola até a seção; “voltar” do navegador (POP) mantém a posição. `instant`
  // porque o CSS rola suave: a página nova apareceria no rodapé subindo animada.
  useLayoutEffect(() => { if (navigation !== 'POP' && !hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [pathname, hash, navigation])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function signOut() {
    setBusy(true); setError(false)
    try { const result = await supabase?.auth.signOut({ scope: 'local' }); if (result?.error) throw result.error }
    catch { setError(true) } finally { setBusy(false) }
  }
  // O rodapé fica fora da coluna central para a barra vinho ocupar a largura toda.
  return <div className="flex min-h-screen flex-col"><div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 md:px-12">
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
    </div>
    <SiteFooter compact={pathname === '/convite'} />
  </div>
}
