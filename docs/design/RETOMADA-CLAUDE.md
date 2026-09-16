# Retomada do Claude (front) — 2026-09-16, fim da sessão

Estado salvo às pressas para continuar em outra máquina. **Os commits
“WIP” desta data não passaram por aprovação de diff nem estão com todos os
testes verdes**; não abrir PR antes de terminar os passos abaixo.

## Como retomar

1. `cd ~/projetos/chadbb-claude && git checkout claude/front && git pull`
2. `npm ci` (Node 22).
3. Ler `AGENTS.md`, `docs/TAREFAS-AGENTES.md`, `docs/design/PLANO-VISUAL.md`
   e este arquivo. A memória do Claude é local da outra máquina; tudo o que
   importa está aqui e no quadro.
4. Hook `.claude/hooks/check-on-stop.sh` roda `npm run check` ao fim de cada
   resposta; agente `.claude/agents/qa-ux.md` revisa cada mudança (se não
   carregar, usar o agente geral pedindo para seguir esse arquivo).
5. `test:browser:local` precisa da stack do Codex **e** de
   `npm run functions:serve` rodando (em terminal aberto) em `~/projetos/chadbb-codex`.

## Onde paramos

| Gate | Situação |
|---|---|
| G0, G1 | mergeados (PR #7) |
| G2, G2.1 | mergeados (PR #8); fontes Manrope + Fraunces aprovadas |
| G3 (convite, página inicial, prévia WhatsApp) | **pronto e testado** (check ok, e2e 112/112, browser 8/8, QA aprovado com ressalvas); **aguardando aprovação do usuário** para commit/PR. Páginas: visual https://claude.ai/artifact/8uLLVMPz2fR3KGYm7hSWEZ · diff https://claude.ai/artifact/Gzn5aPFpNYe9k3KqRFdRv3 |
| G3.1 (sistema de cards, `docs/design/cards-original.md`) | **em andamento, incompleto** |

### G3.1 — feito até agora

- Tokens de card em `src/styles.css` (`--card-*`, `--control-radius`,
  `--action-gap`, `--divider-color`) e classes `.card-stack`, `.card-header`,
  `.card-badges`, `.card-title`, `.card-description`, `.card-reservation`,
  `.card-actions` (divisor), `.card-disclosure`, `.availability`, `.stepper`.
- `Progress` com semântica de `progressbar` quando recebe `label`.
- Novo `Availability` (texto “N de M disponíveis” antes da barra).
- `QuantityField` virou stepper único (− | valor | +), rótulo “Quantidade” +
  contexto só para leitor de tela.
- Card de fralda do convite (`GuestGift` em `GuestPage.tsx`) reescrito:
  cabeçalho com selos (Tamanho, Completo, Reservado/Compra informada), “Sua
  reserva N pacotes” sem caixa rosa, CTA único (“Escolher presente” /
  “Atualizar quantidade”), ações abaixo do divisor, “Trocar tamanho” como
  disclosure (`aria-expanded`, foco no select “Novo tamanho”, “Confirmar troca”).
- Testes: grupo “G3.1 · card de fralda” em `tests/e2e/guest.spec.ts`; textos
  atualizados em `tests/e2e/guest.spec.ts` e `tests/browser/family.integration.mjs`
  (“Sua reserva 2 pacotes”, “4 de 6 disponíveis”, “Atualizar quantidade”,
  “Trocar tamanho”).

### G3.1 — próximos passos

1. **Corrigir o axe** (`aria-progressbar-name`): em
   `src/components/ui/Progress.tsx`, incluir `'aria-label': label` no objeto
   da `progressbar`. Na última rodada falhavam 4 testes × 2 projetos por isso
   (“reserva, compra informada…”, “evento encerrado…”, “320 px…”, “card sem reserva”).
2. Rodar `npx playwright test tests/e2e/guest.spec.ts` e depois a suíte toda.
3. Aplicar o mesmo padrão aos outros cards (sem mudar a estrutura das telas, que é G4):
   - `GuestCard` (`InvitationsPage.tsx`): `card-stack`/`card-header`/`card-actions`
     (as regras `.guest-card .card-actions` já estão no CSS);
   - `Diapers` do painel: `Progress` com `label` e selo “✓ Completo”
     (atualizar `tests/e2e/panel.spec.ts`: hoje espera “Tamanho completo”,
     “15 disponíveis”, “11 disponíveis”);
   - `ItemCard` e `ProductCard` (`GiftListPage.tsx`): anatomia e `QuantityField`
     (máx. 10 000);
   - cards de resumo e de evento: mesma base.
4. Escrever `docs/design/CARDS.md` (versão adaptada, como foi feito com a
   G2.1) e atualizar `foundation.md` (tokens de card, `Availability`, stepper).
5. Rodar `npm run check`, e2e, `test:browser:local`; QA de UX; capturas e
   páginas de revisão; pedir aprovação do usuário.
6. Com aprovação: reorganizar os commits WIP (ou fazer um commit final
   descrevendo G3 + G3.1) e abrir o PR.

## Pendências gerais

- Pedidos ao Codex no quadro (resumo do painel, `available`, `id` das reservas,
  `diapers` no resumo, deadlock intermitente).
- A branch `codex/back` também está em WIP para retomada; não mergear.
- Audit: A11–A14, A16–A19 abertos para G4/G5.
- Depois do G3/G3.1: G4 (painel e lista), G5 (estados globais, offline, QA),
  congelamento em 05/10.
