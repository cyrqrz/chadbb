# Retomada do Claude (front) — 2026-09-17, fim do dia

> Próxima sessão no **PC do trabalho**. Tudo está no GitHub; nada ficou só na
> máquina de casa. Comece pelo PR #18, que está aberto e com a CI verde.

A G4 está **na `main` e em produção**. O front do MVP tem o painel do evento,
o convite, o sistema de cards e o login por código funcionando em
`chadbb.pages.dev`, conferidos contra o banco de verdade.

## Como retomar (PC do trabalho)

1. `cd ~/projetos/chadbb-claude && git fetch origin`
2. `git checkout claude/front && git pull origin main`
3. `npm ci` (Node 22).
4. Ler `AGENTS.md`, `docs/TAREFAS-AGENTES.md`, `docs/design/PLANO-VISUAL.md`,
   `docs/design/CARDS.md`, `docs/design/G4-PAINEL.md` e este arquivo.
5. Abrir a sessão **a partir de `~/projetos/chadbb-claude`**, e não do clone do
   Codex: os agentes do projeto (entre eles o `qa-ux`) vêm do diretório de
   trabalho.
6. Conferir o que o PC do trabalho tem: Docker, `gh` autenticado, a faixa de
   portas reservada para o Supabase local e a chave do Resend em
   `~/.config/chadbb/`. A seção do ambiente no fim deste arquivo descreve a
   máquina de casa e **não vale** aqui.

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

## `claude/wip-ausencia` — limpa, no PR #18

Era um commit WIP único, misturando duas coisas, em cima de código de antes da
G4. Em 2026-09-17 foi reconstruída sobre a `main` (`fedd88e`) e separada em dois
commits, que podem ser julgados um de cada vez. **PR #18 aberto, CI verde.**

| Commit | O que é | Situação |
|---|---|---|
| `cb0362e` | Ausência com presente reservado: o aviso no convite e o selo "Vai enviar presente" no painel | **revisado**, pronto para mergear |
| `42507cd` | Visual da página inicial e do destaque do login, mais `.stagger` de `both` para `backwards` | **revisão de UX não terminou** |

Decisão do titular que sustenta o primeiro: o site **não cancela reserva
sozinho** quando alguém diz que não vai, porque muita gente não vai e mesmo
assim manda o presente.

O selo do painel casa reserva com convite **pelo nome**, porque
`organizer_invitations` devolve as reservas só com `name`. Com dois convites de
mesmo nome o selo fica de fora nos dois, de propósito. O pedido de
`invitation_id` está no quadro.

O `42507cd` traz junto uma correção de bug: com `animation-fill-mode: both` o
estado final de `rise` ficava preenchido, ganhava do cascade e travava o
`transform` — a elevação no hover não saía do lugar em nenhuma lista em cascata.

**O que falta nele:** a revisão de UX. Ele foi escrito pelo agente `qa-ux` numa
sessão interrompida e a revisão não terminou. Está separado de propósito: dá
para mergear só o `cb0362e`. Para chamar o `qa-ux`, é preciso abrir a sessão
**a partir de `~/projetos/chadbb-claude`** — os agentes do projeto vêm do
diretório de trabalho, e numa sessão aberta no clone do Codex ele não carrega.

Evidências do PR #18: `check` 49 unitários; e2e **332/332** com o `cb0362e`
isolado e **354/354** com os dois; `test:browser:local` **8/8**.

Achado no caminho: os testes da cascata esperavam o `h1` antes de medir, mas a
G4 carrega a aba dentro de um `Suspense` e o `h1` é do cabeçalho comum. A espera
passou a ser pelo próprio item em cascata.

## Ambiente da máquina de casa

Nada aqui vale para o PC do trabalho; está registrado para quando voltar a ela.

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
