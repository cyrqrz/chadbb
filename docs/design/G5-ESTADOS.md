# G5 · Estados globais, offline e acabamentos (plano)

Data: 2026-09-22. Responsável: Claude (front). Base: `clone-main` em `1504b8b`.
Origem: `docs/design/PLANO-VISUAL.md` §3 ("G5 | 8 · Estados + 9 · QA | Skeleton,
offline, somente leitura; QA visual, funcional, acessibilidade e desempenho").

Ao retomar o plano visual em 2026-09-22, o G4 (painel, abas, prévia) e o G4b
(lista de presentes com menos caixas) já estavam prontos e mergeados — o
quadro (`docs/TAREFAS-AGENTES.md`) estava desatualizado dizendo "Próximo: G4".
Este documento organiza o que falta: o G5, absorvendo T-F3 (acessibilidade) e
T-F4 (contrato de atualização), conforme já previsto em `PLANO-VISUAL.md` §8.

## Sub-gates

| Gate | Entrega | Situação |
|---|---|---|
| G5.1 | `ConfirmDialog` (`<dialog>` nativo) no lugar das seis chamadas de `window.confirm` | **feito** (2026-09-22) |
| G5.2 | Skeleton nas telas que ainda usam só `LoadingState`; achado A17 (`ConfirmDialog` em "Encerrar"/"Excluir evento") e `ActionMenu` | **feito** (2026-09-22) |
| G5.3 | Estado sem conexão (T-F4): detectar `online`/`offline`, avisar antes de tentar salvar, não confundir com "atualizando" | próximo |
| G5.4 | Acabamentos de acessibilidade restantes do `audit.md`: A14 (leitor de tela durante a tentativa), A16 (uma ação primária por tela), A18/A19 (contrato de quantidade) | próximo |
| G5.5 | QA de UX, `npm run check`, e2e completo, `test:browser:local`, capturas antes/depois, medida de build | próximo |
| G5.6 | Aprovação do usuário → commit, push e PR | próximo |

## G5.1 · `ConfirmDialog` (feito)

### Decisão

`<dialog>` nativo do HTML, sem Radix (não instalado; o projeto evita
dependência nova quando dá, mesmo raciocínio já usado para não trazer lib de
animação). `showModal()` entrega foco preso e Esc (evento `cancel`) de graça;
o retorno do foco ao elemento que abriu é feito à mão, porque o navegador não
garante isso em todos os casos.

### O que mudou

- Novo `src/components/ui/ConfirmDialog.tsx`: `open`, `title`, `description?`,
  `confirmLabel`, `cancelLabel` (padrão "Cancelar"), `tone` (`default` ou
  `danger`), `busy?`, `onConfirm`, `onCancel`. Clique fora do conteúdo
  (`::backdrop` ou o padding do próprio `<dialog>`) cancela, como Esc.
- CSS em `src/styles.css`: `--radius-panel`, `::backdrop` escurecido, entrada
  com `--duration-normal`/`--ease-emphasized` (zerada em
  `prefers-reduced-motion`), contorno reforçado em `forced-colors`.
- Seis pontos trocados (antes usavam `window.confirm`):
  `EventLayout.tsx` (sair da edição pelo cabeçalho ou pelas abas, com
  navegação adiada até a confirmação), `EventPage.tsx` ("Recarregar dados"),
  `GiftListPage.tsx` ("Recarregar quantidade", por linha), `InvitationsPage.tsx`
  (fechar o formulário com link não copiado, reemitir link, revogar acesso).
- `EventsPage.tsx` ("Excluir evento") não mudou: já usava confirmação inline
  em disclosure, sem `window.confirm` — fora deste gate.
- Amostra em `/amostras` (`SpecimensPage.tsx`, seção "Diálogo de confirmação")
  e teste dedicado em `tests/e2e/specimens.spec.ts` (axe com o diálogo aberto,
  Esc, clique fora, foco de volta ao botão).
- Testes existentes que usavam `page.on('dialog', …)` (Playwright, modal
  nativo do navegador) passaram a clicar nos botões do diálogo em página:
  `tests/e2e/organizer.spec.ts` e `tests/e2e/panel.spec.ts`.

### Evidência

`npm run check` (lint, typecheck, 51 testes unitários, build) e
`npm run test:e2e` completo: **463 passed, 3 skipped** — sem regressão.

## G5.2 · Skeleton, A17 e ActionMenu (feito)

### Skeleton nas telas que só tinham `LoadingState`

Mesmo padrão do `ListSkeleton` da lista de presentes (G4b.4): `<LoadingState>`
continua fazendo o anúncio para leitor de tela, e um bloco `aria-hidden`
com a forma do conteúdo real aparece ao lado, usando `src/components/ui/Skeleton.tsx`.

- `EventsPage.tsx` ("Seus eventos"): `EventsSkeleton`, dois cards no formato
  selo + título + data.
- `InvitationsPage.tsx` (painel): `PanelSkeleton`, dois cards de resumo e dois
  de convite.
- `GuestPage.tsx` (convite): `GuestSkeleton`. Como o acesso ainda não trocou
  (não se sabe se há capa), a forma é genérica: título, linha de data, dois
  blocos — evita um salto grande quando o convite de verdade aparece.

Não entraram: `EventLayout` (o `Suspense` já troca de aba rápido, sem
depender de rede própria), `EventPage`/`GiftListPage` no carregamento do
evento (o corpo é um formulário, não uma lista — a forma de um formulário
vazio não ajuda) e `LoginPage`/`InvitePreview` (trocas de estado muito
rápidas, sem lista para desenhar).

### A17 · decisão: não migrar "Encerrar evento" / "Excluir evento"

A confirmação inline em disclosure (`EventPage.tsx`, `EventsPage.tsx`) já é
acessível e nunca usou `window.confirm`. Um `ConfirmDialog` modal não é uma
melhoria clara sobre manter a pergunta no lugar da ação — a literatura de UX
atual prefere confirmação inline a modal quando o contexto cabe na tela — e
trocar sem necessidade arriscava regressão nos testes desses dois fluxos sem
ganho correspondente. Registrado em `audit.md` (A17) como decisão, não como
pendência.

### `ActionMenu`: adiado por falta de caso de uso

A foundation previa um menu "…" para "ações raras", mas nenhuma tela atual
tem mais ações secundárias do que cabe como botões visíveis (o card de
convidado, com três ações, já foi decidido no G2.1 para ficar com botões
abaixo do divisor, não atrás de um menu). Construir o componente agora seria
especulativo, sem consumidor. Fica adiado até que uma tela precise mesmo
esconder ações atrás de um menu.

### Evidência

`npm run check` e `npm run test:e2e` completo, sem regressão (ver commit).
