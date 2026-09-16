import { readPublicConfig } from '../../lib/config'

const backend = readPublicConfig(import.meta.env)

const steps = [
  ['01', 'Prepare o encontro', 'Os detalhes do chá de bebê reunidos em um lugar.'],
  ['02', 'Convide com carinho', 'Um convite individual para cada pessoa especial.'],
  ['03', 'Organize os presentes', 'Uma lista compartilhada para ajudar nas escolhas.'],
]

export function HomePage() {
  return <>
    <section className="page grid gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
      <div>
        <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-[var(--brand)]">Um novo capítulo vem aí</p>
        <h1>Mais carinho.<br />Menos complicação.</h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">Um lugar para reunir quem você ama e preparar a chegada de alguém muito especial.</p>
        <a href="#como-funciona" className="button mt-8">Conheça o chadbb <span aria-hidden="true">↗</span></a>
      </div>
      <aside className="flex flex-col justify-center rounded-[2rem] border border-[var(--line)] bg-[var(--brand-soft)] shadow-sm p-8 md:p-10">
        <span aria-hidden="true" className="mb-8 text-5xl text-[var(--brand)]">✳</span>
        <h2 className="text-2xl font-semibold">Cada chegada merece<br />um encontro especial.</h2>
        <p className="mt-4 leading-relaxed text-stone-700">Prepare os detalhes do chá de bebê: escolha um nome, uma data e o lugar onde vocês vão celebrar.</p>
        <p role="status" className="mt-8 border-t border-[var(--line)] pt-5 text-sm text-stone-700">{backend.status === 'ready' ? 'Crie seu evento e monte a lista de presentes pelo menu acima. Convites estão em preparação.' : backend.message}</p>
      </aside>
    </section>
    <section id="como-funciona" className="pb-20">
      <h2 className="mb-8 text-2xl font-semibold">Do convite ao abraço.</h2>
      <div className="stagger grid gap-8 md:grid-cols-3">{steps.map(([number, title, description]) =>
        <article key={number} className="border-t border-stone-300 pt-5"><span className="text-sm text-[var(--brand)]">{number}</span><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 leading-relaxed text-stone-600">{description}</p></article>,
      )}</div>
    </section>
  </>
}
