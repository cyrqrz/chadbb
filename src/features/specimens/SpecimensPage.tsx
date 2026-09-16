import { useState } from 'react'
import { EmptyState, ErrorState, LoadingState, SuccessMessage } from '../../components/States'
import { BackLink, Button, Field, Progress, Section, Skeleton, StatusBadge, Tabs } from '../../components/ui'

// Página de amostras da foundation (G2). Só existe em desenvolvimento.
const colors = [
  ['canvas', 'Fundo'], ['surface', 'Superfície'], ['surface-soft', 'Superfície suave'], ['ink', 'Texto'], ['muted', 'Texto secundário'],
  ['line', 'Divisória'], ['line-strong', 'Contorno de controle'], ['brand', 'Marca'], ['brand-hover', 'Marca (hover)'], ['brand-soft', 'Marca suave'],
  ['success', 'Sucesso (barra)'], ['success-text', 'Sucesso (texto)'], ['warning', 'Aviso'], ['danger', 'Erro'],
] as const

export function SpecimensPage() {
  const [tab, setTab] = useState<'fralda' | 'mimo'>('fralda')
  const [busy, setBusy] = useState(false)
  return <div className="page flex flex-col gap-12">
    <header className="flex flex-col gap-2">
      <p className="eyebrow">Foundation · G2 e G2.1 · Manrope + Fraunces</p>
      <h1 className="page-title">Amostras do sistema visual</h1>
      <p className="section-description">Organizar deve ser simples; participar deve ser memorável.</p>
    </header>

    <Section title="Tipografia" description="Fonte editorial só no nome do evento e nos momentos do convite; o resto usa a fonte de interface.">
      <div className="flex flex-col gap-4">
        <p className="text-display font-display font-medium tracking-tight">Chá de teste</p>
        <p className="text-h1 font-bold tracking-tight">Convites e confirmações</p>
        <p className="text-h2 font-bold">Fraldas por tamanho</p>
        <p className="text-h3 font-bold">Tamanho M</p>
        <p className="text-body max-w-prose">Escolha um ou mais pacotes. As quantidades disponíveis ajudam a equilibrar os tamanhos para o bebê.</p>
        <p className="text-body-sm text-muted">Horário de Brasília. Obrigatório para publicar.</p>
        <p className="text-label font-semibold">Pacotes de fraldas tamanho P</p>
        <p className="text-caption text-muted">Legenda · 13 px</p>
        <p className="stat">42</p>
      </div>
    </Section>

    <Section title="Cores" description="Contrastes medidos em docs/design/foundation.md.">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{colors.map(([token, label]) =>
        <li key={token} className="specimen-swatch">
          <span className="block h-10 rounded-control border border-line" style={{ background: `var(--color-${token})` }} aria-hidden="true" />
          <span className="mt-2 font-semibold">{label}</span><span className="text-muted">{token}</span>
        </li>)}
      </ul>
    </Section>

    <Section title="Ações" description="Uma primary por contexto; secondary para o que importa; ghost para o auxiliar; danger para o destrutivo. Pill só em selos.">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Criar convite</Button>
        <Button variant="secondary">Editar convite</Button>
        <Button variant="ghost">Reemitir link</Button>
        <Button variant="danger">Revogar acesso</Button>
        <Button variant="icon" aria-label="Copiar link"><span aria-hidden="true">⧉</span></Button>
        <Button busy={busy} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1500) }}>{busy ? 'Salvando…' : 'Salvar (fica ocupado)'}</Button>
        <Button disabled>Tamanho completo</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm">Pequeno (44 px)</Button>
        <p>Ação dentro de frase: <Button variant="link">usar resposta atual</Button>.</p>
        <BackLink to="/amostras">Detalhes do evento</BackLink>
      </div>
    </Section>

    <Section title="Card de convidado" description="Superfície de 16 px; ações empilham quando o card é estreito.">
      <ul className="grid gap-4 md:grid-cols-2">
        <li className="card guest-card">
          <div className="flex flex-wrap gap-2"><StatusBadge tone="neutral">Família · até 4 pessoas</StatusBadge></div>
          <h3 className="text-h3 font-bold">Convidado fictício 1</h3>
          <p><StatusBadge tone="success">Vai participar · 3 pessoa(s)</StatusBadge></p>
          <div className="card-actions">
            <Button variant="secondary" size="sm">Editar convite<span className="sr-only"> de Convidado fictício 1</span></Button>
            <Button variant="ghost" size="sm">Reemitir link</Button>
            <Button variant="danger" size="sm">Revogar acesso</Button>
          </div>
        </li>
        <li className="card guest-card">
          <div className="flex flex-wrap gap-2"><StatusBadge tone="neutral">Individual</StatusBadge><StatusBadge tone="danger">Acesso revogado</StatusBadge></div>
          <h3 className="text-h3 font-bold">Convidado fictício 2</h3>
          <p><StatusBadge tone="neutral">Sem resposta</StatusBadge></p>
          <p className="hint">O link antigo não funciona mais; as respostas e escolhas foram preservadas.</p>
          <div className="card-actions">
            <Button variant="secondary" size="sm">Editar convite<span className="sr-only"> de Convidado fictício 2</span></Button>
            <Button variant="ghost" size="sm">Reemitir link</Button>
          </div>
        </li>
      </ul>
    </Section>

    <Section title="Campos">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nome da pessoa ou família" hint="Aparece no convite.">{props => <input {...props} placeholder="Convidado fictício" />}</Field>
        <Field label="Quantas pessoas vão?" error="A quantidade passa do limite deste convite.">{props => <input {...props} type="number" defaultValue={5} />}</Field>
        <Field label="Tipo de convite">{props => <select {...props}><option>Individual</option><option>Família</option></select>}</Field>
        <Field label="Endereço privado" hint="Somente leitura: evento encerrado.">{props => <textarea {...props} rows={2} disabled defaultValue="Endereço fictício, 123" />}</Field>
      </div>
      <fieldset className="mt-2 flex flex-col gap-3"><legend className="mb-2 font-semibold">Sua confirmação</legend>
        <label className="choice"><input type="radio" name="amostra" defaultChecked />Vai participar</label>
        <label className="choice"><input type="radio" name="amostra" />Não poderá ir</label>
      </fieldset>
    </Section>

    <Section title="Abas, selos e progresso">
      <Tabs label="Categorias de amostra" value={tab} onChange={setTab} options={[['fralda', 'Fraldas'], ['mimo', 'Mimos']]} />
      <div className="flex flex-wrap gap-2">
        <StatusBadge>Tamanho P</StatusBadge>
        <StatusBadge tone="neutral">Mimo</StatusBadge>
        <StatusBadge tone="success">Tamanho completo</StatusBadge>
        <StatusBadge tone="warning">Sem resposta</StatusBadge>
        <StatusBadge tone="danger">Acesso revogado</StatusBadge>
      </div>
      <ul className="grid max-w-md gap-3">{[['P', 6, 6], ['M', 4, 19], ['G', 12, 19], ['XG', 0, 6]].map(([size, value, max]) =>
        <li key={size} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-3">
          <span className="font-bold">{size}</span><Progress value={Number(value)} max={Number(max)} />
          <span className="text-right tabular-nums">{value} / {max}{value === max ? ' ✓' : ''}</span>
        </li>)}
      </ul>
    </Section>

    <Section title="Estados">
      <div className="grid gap-4 md:grid-cols-2">
        <LoadingState>Carregando seu painel…</LoadingState>
        <div className="flex flex-col gap-2"><Skeleton height="1.5rem" width="60%" /><Skeleton /><Skeleton width="80%" /></div>
        <SuccessMessage>Presente reservado para você.</SuccessMessage>
        <p className="state state-warning">Há uma confirmação pendente. Use “Verificar tentativa anterior”.</p>
        <ErrorState title="Não foi possível atualizar." message="Os dados abaixo são da última consulta." onRetry={() => undefined} />
        <EmptyState title="Nenhum mimo na lista.">Os mimos são opcionais. Inclua-os pela lista de presentes, se quiser.</EmptyState>
      </div>
    </Section>

    <Section title="Superfícies" description="Cartão só quando agrupa ou destaca; seções abertas no resto.">
      <div className="grid gap-4 md:grid-cols-3">
        <article className="card"><p className="eyebrow">Pessoas</p><p className="stat">5</p><p>pessoas confirmadas</p></article>
        <article className="card card-link"><p className="eyebrow">Com efeito ao passar o mouse</p><p>Chá de teste</p></article>
        <p className="notice">Publique o evento para criar convites.</p>
      </div>
    </Section>
  </div>
}
