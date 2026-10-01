import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/context'

// Rodapé. `compact` é o do convite: o convite guarda a sessão só na memória da
// página, então lá não há links que troquem a página; a privacidade abre em nova
// aba. No resto do site, o rodapé completo com os links úteis.
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth()
  const year = new Date().getFullYear()
  const privacy = compact
    ? <a className="footer-bar-link" href="/privacidade" target="_blank" rel="noopener">Política de Privacidade<span className="sr-only"> (abre em nova aba)</span></a>
    : <Link className="footer-bar-link" to="/privacidade">Política de Privacidade</Link>
  return <footer className="site-footer">
    {!compact && <div className="footer-inner footer-columns">
      <div className="footer-brand">
        <Link to="/" aria-label="chadbb, início" className="brand inline-flex min-h-11 items-center gap-2.5 text-xl font-extrabold tracking-tight"><span className="brand-mark" aria-hidden="true">c</span>chadbb<span className="-ml-2.5 text-brand" aria-hidden="true">.</span></Link>
        <p>Seu chá de bebê com carinho e praticidade: presença, fraldas e mimos em um só lugar.</p>
      </div>
      <nav aria-labelledby="footer-links" className="footer-nav">
        <h2 id="footer-links" className="footer-heading">Links úteis</h2>
        <ul>
          <li><Link to="/">Início</Link></li>
          <li><Link to="/#como-funciona">Como funciona</Link></li>
          <li><Link to="/#duvidas">Perguntas frequentes</Link></li>
          <li>{session ? <Link to="/eventos">Seus eventos</Link> : <Link to="/entrar">Entrar para organizar</Link>}</li>
          <li><Link to="/privacidade">Política de privacidade</Link></li>
          <li><Link to="/privacidade#organizadores">Termos de uso</Link></li>
          <li><Link to="/privacidade#contato">Contato</Link></li>
        </ul>
      </nav>
      <section aria-labelledby="footer-guests" className="footer-nav">
        <h2 id="footer-guests" className="footer-heading">Recebeu um convite?</h2>
        <p>Não precisa criar conta: abra o link que a família enviou pelo WhatsApp para confirmar presença e escolher o presente.</p>
      </section>
    </div>}
    <div className="footer-bar">
      <p className="footer-inner">© {year} chadbb · {privacy}</p>
    </div>
  </footer>
}
