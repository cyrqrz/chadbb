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
| G5.2 | Skeleton nas telas que ainda usam só `LoadingState` (painel, "Seus eventos", convite); migrar "Encerrar evento" e "Excluir evento" para `ConfirmDialog` (achado A17); `ActionMenu` | próximo |
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

### Fora deste gate

Achado A17 do `audit.md` (confirmação de encerramento/exclusão de evento):
`ConfirmDialog` já existe, mas "Encerrar evento" e "Excluir evento" continuam
com a confirmação inline em disclosure — migrar ou não fica para o G5.2, com
decisão do usuário se vale a pena trocar um padrão que já funciona bem.
