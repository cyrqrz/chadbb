import { Link } from 'react-router-dom'
import { readPublicConfig } from '../../lib/config'
import { useAuth } from '../auth/context'

const backend = readPublicConfig(import.meta.env)

// Sequência real do uso: os números indicam a ordem.
const steps = [
  ['01', 'Prepare o encontro', 'Data, local e instruções do chá de bebê em um lugar só.'],
  ['02', 'Convide com carinho', 'Um link individual para cada pessoa ou família, enviado pelo WhatsApp.'],
  ['03', 'Acompanhe os presentes', 'Fraldas por tamanho e mimos, com o que já foi escolhido e o que falta.'],
]

export function HomePage() {
  const { session } = useAuth()
  return <>
    <section className="page grid gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
      <div className="flex flex-col items-start gap-6">
        <p className="eyebrow">Chá de bebê</p>
        <h1 className="invite-title">Mais carinho.<br />Menos complicação.</h1>
        <p className="max-w-lg text-lg text-muted">Um lugar para reunir quem você ama e preparar a chegada de alguém muito especial.</p>
        {session
          ? <Link to="/eventos" className="button">Ir para seus eventos</Link>
          : <Link to="/entrar" className="button">Começar a organizar</Link>}
      </div>
      <aside className="flex flex-col justify-center gap-4 rounded-panel border border-line bg-brand-soft p-8 md:p-10">
        <h2 className="font-display text-h2 font-medium">Cada chegada merece um encontro especial.</h2>
        <p className="text-stone-700">Convidados confirmam presença e escolhem fraldas ou mimos pelo celular, sem criar conta.</p>
        <p className="border-t border-line pt-4 text-body-sm text-stone-700">{backend.status === 'ready'
          ? 'Para organizar, entre com seu e-mail: enviamos um código de acesso.'
          : backend.message}</p>
      </aside>
    </section>
    <section aria-labelledby="como-funciona" className="pb-20">
      <h2 id="como-funciona" className="mb-8 text-h2 font-bold">Do convite ao abraço</h2>
      <ol className="stagger grid gap-8 md:grid-cols-3">{steps.map(([number, title, description]) =>
        <li key={number} className="border-t border-line pt-5"><span className="text-label font-bold text-brand" aria-hidden="true">{number}</span><h3 className="mt-3 text-h3 font-bold">{title}</h3><p className="mt-2 text-muted">{description}</p></li>,
      )}</ol>
    </section>
  </>
}
