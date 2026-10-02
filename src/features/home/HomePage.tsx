import { usePageTitle } from '../../lib/usePageTitle'
import { BabyMotif } from '../../components/BabyMotif'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { readPublicConfig } from '../../lib/config'
import { useAuth } from '../auth/context'

const backend = readPublicConfig(import.meta.env)

// Sequência real do uso: os números indicam a ordem.
const steps = [
  ['1', 'Prepare o encontro', 'Data, local e instruções do chá de bebê em um lugar só.'],
  ['2', 'Convide com carinho', 'Um link individual para cada pessoa ou família, enviado pelo WhatsApp.'],
  ['3', 'Acompanhe os presentes', 'Fraldas por tamanho e mimos, com o que já foi escolhido e o que falta.'],
]

// Ícones de traço, decorativos: o título do cartão diz o benefício.
const icon = (paths: ReactNode) => <svg className="benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths}</svg>
// Só o que o chadbb faz hoje; nada de dinheiro, que o produto não movimenta.
const benefits: [ReactNode, string, string][] = [
  [icon(<><circle cx="11" cy="8" r="4" /><path d="M3.5 20c0-4 3.5-6.5 7.5-6.5" /><path d="m14.5 18 2 2 4.5-4.5" /></>), 'Convidado não cria conta', 'Abre o link, confirma presença e escolhe o presente, sem senha e sem cadastro.'],
  [icon(<><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></>), 'Um convite por família', 'Cada pessoa ou família recebe o próprio link, com quantas pessoas podem ir.'],
  [icon(<><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" /><path d="M12 7C10 3 6 3 6 6c0 1 1 1 6 1Zm0 0c2-4 6-4 6-1 0 1-1 1-6 1Z" /></>), 'Presentes sem repetição', 'Fraldas por tamanho e mimos com quantidade: o que já foi escolhido sai da lista na hora.'],
  [icon(<><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4Z" /><path d="M10 21h4" /></>), 'Prazo e lembrete', 'Você escolhe até quando confirmar; quem marcou “Talvez” recebe um lembrete por e-mail.'],
  [icon(<><path d="M5 11h14v10H5z" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>), 'Endereço protegido', 'Data, endereço e instruções aparecem só para quem abre o convite pelo link.'],
  [icon(<><path d="M7 3h10v18H7z" /><path d="M11 18h2" /></>), 'Feito para o celular', 'Pensado para o WhatsApp: abre rápido no celular de qualquer convidado.'],
]

const faq: [string, ReactNode][] = [
  ['Os convidados precisam criar conta?', 'Não. Cada convidado recebe um link individual pelo WhatsApp e responde direto, sem senha.'],
  ['Quanto custa?', 'Nesta fase, o chadbb é gratuito para as famílias convidadas.'],
  ['Quem pode criar um evento?', 'Por enquanto, só famílias convidadas. O cadastro aberto a todos vem depois.'],
  ['O endereço da festa fica público?', 'Não. Quem recebe o link vê na prévia só o título, a descrição e a imagem. Data, endereço e instruções aparecem apenas dentro do convite.'],
  ['E se dois convidados escolherem o mesmo presente?', 'Não acontece: a escolha reserva o item, e a quantidade disponível diminui na hora para todos.'],
  ['O convidado pode mudar a resposta?', 'Sim, abrindo o mesmo link, até o prazo de confirmação que aparece no convite.'],
  ['Por quanto tempo os dados ficam guardados?', <>Os dados pessoais dos convidados são apagados 30 dias depois do fim do evento. Detalhes na <Link className="text-link" to="/privacidade#convidados">política de privacidade</Link>.</>],
]

// Nuvem atrás do número da etapa (decorativa).
const cloud = <svg className="step-cloud" viewBox="36 14 124 52" fill="none" aria-hidden="true" focusable="false"><path d="M56 62h79c16 0 20-19 6-24-3-19-29-20-34-4-13-15-36-6-35 10-14-6-28 13-16 18Z" /></svg>

export function HomePage() {
  usePageTitle(null)
  const { session } = useAuth()
  const { hash } = useLocation()
  // Links do rodapé (/#como-funciona, /#duvidas): o roteador não rola até a âncora sozinho.
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null
    if (target) { target.scrollIntoView(); target.focus({ preventScroll: true }) }
  }, [hash])
  const start = (label: string) => session
    ? <Link to="/eventos" className="button">Ir para seus eventos</Link>
    : <Link to="/entrar" className="button">{label}</Link>
  return <>
    <section className="page grid gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
      <div className="flex flex-col items-start gap-6">
        <p className="eyebrow">Chá de bebê</p>
        <h1 className="invite-title">Mais carinho.<br />Menos complicação.</h1>
        <p className="max-w-lg text-lg text-muted">Um lugar para reunir quem você ama e preparar a chegada de alguém muito especial.</p>
        {start('Começar a organizar')}
      </div>
      <aside className="flex flex-col justify-center gap-4 rounded-panel border border-line baby-welcome p-8 md:p-10">
        <BabyMotif />
        <h2 className="font-display text-h2 font-medium">Cada chegada merece um encontro especial.</h2>
        <p className="text-stone-700">Convidados confirmam presença e escolhem fraldas ou mimos pelo celular, sem criar conta.</p>
        <p className="border-t border-line pt-4 text-body-sm text-stone-700">{backend.status === 'ready'
          ? 'Para organizar, entre com seu e-mail: enviamos um código de acesso.'
          : backend.message}</p>
      </aside>
    </section>

    <section aria-labelledby="como-funciona" className="home-section">
      <h2 id="como-funciona" tabIndex={-1} className="home-title"><span className="title-accent">Três</span> etapas do convite ao abraço</h2>
      <ol className="home-steps stagger">{steps.map(([number, title, description]) =>
        <li key={number} className="card step-card home-step">
          <span className="step-badge">{cloud}<span className="step-badge-number" aria-hidden="true">{number}</span></span>
          <h3 className="step-title"><span className="sr-only">Etapa {number}: </span>{title}</h3>
          <p className="text-muted">{description}</p>
        </li>)}
      </ol>
      <div className="home-cta">{start('Organizar meu chá')}</div>
    </section>

    <section aria-labelledby="beneficios" className="home-band">
      <h2 id="beneficios" className="home-title">Por que organizar com o <span className="title-accent">chadbb</span></h2>
      <ul className="benefit-grid">{benefits.map(([svg, title, text]) =>
        <li key={title} className="benefit-card">{svg}<h3 className="benefit-title">{title}</h3><p>{text}</p></li>)}
      </ul>
    </section>

    <section aria-labelledby="duvidas" className="home-section">
      <h2 id="duvidas" tabIndex={-1} className="home-title">Tire suas <span className="title-accent">dúvidas</span>, estamos aqui para ajudar</h2>
      <div className="faq-list">{faq.map(([question, answer]) =>
        <details key={question} className="faq-item"><summary>{question}<span className="faq-icon" aria-hidden="true" /></summary><div className="faq-answer">{answer}</div></details>)}
      </div>
      <p className="faq-more"><Link className="text-link" to="/privacidade#contato">Ainda com dúvidas? Fale com a gente</Link></p>
    </section>
  </>
}
