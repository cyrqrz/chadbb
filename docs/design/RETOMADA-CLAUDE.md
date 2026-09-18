# Retomada do Claude (front) — 2026-09-17, fim do dia

A G4 está **na `main` e em produção**. O front do MVP tem o painel do evento,
o convite, o sistema de cards e o login por código funcionando em
`chadbb.pages.dev`, conferidos contra o banco de verdade.

## Como retomar

1. `cd ~/projetos/chadbb-claude && git fetch origin`
2. `git checkout claude/front && git pull origin main`
3. `npm ci` (Node 22).
4. Ler `AGENTS.md`, `docs/TAREFAS-AGENTES.md`, `docs/design/PLANO-VISUAL.md`,
   `docs/design/CARDS.md`, `docs/design/G4-PAINEL.md` e este arquivo.

## Onde paramos

| Gate | Situação |
|---|---|
| G0, G1 | mergeados (PR #7) |
| G2, G2.1 | mergeados (PR #8); Manrope + Fraunces aprovadas |
| G3, G3.1 | aprovados em 2026-09-16, mergeados no PR #9. Ressalvas em `CARDS.md` §4 |
| **G4** (painel, abas, prévia) | **mergeada** em 2026-09-17, PR #15 (`6ecfb4c`). Plano em `G4-PAINEL.md` |
| G4b (lista de presentes com menos caixas, A11–A13) | **próximo** |
| G5 (estados globais, offline, QA) | 01/10. Congelamento em 05/10; ensaio em 02–04/10 |

Também entraram na `main` em 17/09:

- PR #14: entrar com o código do e-mail (o link só valia no navegador que pediu)
  e fim da tremida na reconsulta (`SlowRefresh`, `useDelayedFlag`).
- PR #15: a G4, mais `font-src 'self' data:` na CSP de `public/_headers` —
  o Vite embute subsets de fonte como `data:` e o console da produção acusava
  bloqueio. `tests/headers.test.ts` guarda a diretiva.
- PR #16 (`4b0eccc`): endereço com id inválido diz "evento não encontrado".
  `/eventos/convites` e um placeholder colado casam com `/eventos/:id`; o texto
  ia ao servidor, o Postgres recusava com 400 e código `22P02`, fora do mapa do
  `errorMessage`, e a tela culpava a conexão do organizador. `isEventId` corta
  antes da consulta.

## Evidências da `main` atual (`e86a59f`)

Rodadas em 2026-09-17, nesta máquina:

| Suíte | Resultado |
|---|---|
| `npm run check` | 49 unitários, lint, typecheck e build verdes |
| `npm run test:e2e` | 296/296 |
| `npm run test:browser:local` | 8/8, contra o Supabase local |

Na produção, sem sessão: home, `/entrar` com código, `/eventos/:id` e
`/eventos/:id/previa` mandando para `/entrar`, tags `og:` corretas, CSP com
`font-src` e **console sem erro**.

Do roteiro logado, o titular confirmou o painel abrindo pelo card, com selo de
status, título, data e abas. **Falta conferir:** a prévia do convite, o
cabeçalho com "Faltam N dias" depois de preencher a data, o "Convidar alguém"
destravando ao publicar, e as fraldas em lista de progresso. Há um evento de
teste em rascunho na produção para apagar quando terminar.

## `claude/wip-ausencia` — o que fazer com ela

A branch está parada em `56be8f8` e o commit mistura duas coisas. Ela nasceu
antes da G4, então precisa da `main` nova antes de qualquer coisa.

**Revisado e testado** (e2e 264/264, browser 8/8 na época):

- `GuestPage.tsx` (`Presence`): quem responde "Não poderá ir" com reserva ativa
  vê a lista do que está reservado e escolhe entre "Cancelar reserva(s)" e
  "Manter: vou enviar o presente". Decisão do titular: **não cancelar sozinho**,
  porque muita gente não vai e mesmo assim envia o presente.
- `InvitationsPage.tsx`: selo "Vai enviar presente" no card de quem não vai. O
  vínculo é **pelo nome**; o pedido de `invitation_id` nas reservas está no
  quadro, em "Pedidos do front para o back".
- Testes: grupo "ausência com presente reservado" em `tests/e2e/guest.spec.ts` e
  um teste em `tests/e2e/panel.spec.ts`.

**Não revisado** (o agente de QA foi interrompido no meio): cartões dos passos
na página inicial (`HomePage.tsx`, `.step-card`, `.step-number`), destaque do
"É convidado?" (`.login-guest`), `.stagger` com `animation … backwards`, e
testes novos em `guest.spec.ts`, `login.spec.ts` e `panel.spec.ts`.
`npm run check` passava, mas o e2e completo não rodou depois desses ajustes.

Plano: trazer a `main`, rodar o e2e completo, separar o que passar e fizer
sentido num commit próprio ("visual da página inicial") e descartar o resto.
Depois chamar o `qa-ux` de novo, porque a revisão dessa parte não terminou.

## Ambiente desta máquina (casa)

- Três clones em `~/projetos`: `chadbb` (main), `chadbb-codex` (codex/back),
  `chadbb-claude` (claude/front).
- **Docker Engine nativo no WSL** (29.8.1, com systemd), não o Docker Desktop,
  que foi desinstalado. Sobraram symlinks mortos dele: ignorar, não reinstalar.
  compose v5.5.1 e buildx v0.37.1 em `~/.docker/cli-plugins`.
- Portas 54320–54330 reservadas em `/etc/sysctl.d/99-supabase.conf`. Sem isso,
  `npm run db:start` falha de vez em quando com `address already in use` sem
  ninguém ouvindo a porta. Documentar no `README.md` é item do Codex no quadro.
- `test:browser:local` precisa da stack do Codex **e** de
  `npm run functions:serve` aberto em `~/projetos/chadbb-codex`.
- `gh` instalado, mas **sem login**. Enquanto isso, PR é o titular quem abre no
  navegador. `gh auth login` é interativo: vai para ele, com `!`.
- O `sudo` pede senha interativa; passos com root vão para o titular.

## Pendências gerais

- Pedidos ao Codex no quadro: resumo do painel, `available`, `id` das reservas,
  `diapers` no resumo, deadlock intermitente, `invitation_id` nas reservas e a
  documentação da reserva de portas.
- PR #13 (`codex/back`) segue aberto, com pedidos de visual e de login para o
  front que ainda não foram atendidos.
- Prévia do WhatsApp: o site entrega as tags certas. Quando o cartão não
  aparece, é mensagem encaminhada ou o app não buscou o site a tempo; colar o
  link e esperar 2–3 s resolve.
- O evento "cha da liz" está **encerrado** na produção, e encerrado não reabre.
  Se era o evento real, é preciso criar e publicar outro.
- Testes que falharam uma vez com a máquina carregada e passaram isolados:
  "G2.1 · só uma ação domina", "tentar de novo pelo teclado mantém o foco" e
  "falha de atualização nos detalhes não apaga…". Se repetir, tratar como
  teste instável.
