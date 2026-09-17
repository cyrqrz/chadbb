# Retomada do Claude (front) — atualizada em 2026-09-17

G3 e G3.1 estão na `main` (PR #9, squash `315e22c`, mergeado em 2026-09-17)
e publicados em `chadbb.pages.dev`. O próximo trabalho é a G4.

## Como retomar (PC do trabalho)

1. `cd ~/projetos/chadbb-claude && git checkout claude/front && git pull`.
2. `npm ci` (Node 22): nenhuma dependência nova, mas é barato.
3. Ler `AGENTS.md`, `docs/TAREFAS-AGENTES.md`, `docs/design/PLANO-VISUAL.md`,
   `docs/design/CARDS.md` e este arquivo.
4. `git pull origin main` se houver PR novo mergeado.
5. `test:browser:local` precisa da stack do Codex **e** de
   `npm run functions:serve` aberto em `~/projetos/chadbb-codex`. Se o banco
   local estiver antigo (erro `relation "private.retention_audit" does not exist`),
   ele tem menos migrations que o repositório: pedir aprovação e rodar
   `npm run db:reset` no clone do Codex.

## Onde paramos

| Gate | Situação |
|---|---|
| G0, G1 | mergeados (PR #7) |
| G2, G2.1 | mergeados (PR #8); fontes Manrope + Fraunces aprovadas |
| G3 (convite, página inicial, prévia WhatsApp) | **aprovado** em 2026-09-16 |
| G3.1 (sistema de cards, `docs/design/CARDS.md`) | **aprovado** em 2026-09-16: check 44/44, e2e 164/164, browser 8/8, QA com ressalvas em `CARDS.md` §4. Revisão: https://claude.ai/artifact/5T2XkXsw1iyJvkWY5seSWN |
| **PR #9 (G3 + G3.1)** | **mergeado** em 2026-09-17 (squash `315e22c`). Inclui as correções R1/R2 da revisão do Codex (`4dc63ae`: quantidade bloqueada durante o envio com foco mantido; versão do rascunho preservada em conflito). Evidências: check 44/44, e2e 172/172, browser 8/8 |
| G4 (shell do evento, painel, lista) | **próximo**, janela 26–30/09 |

## Próximos passos

1. **G4** (`PLANO-VISUAL.md` §3): cabeçalho do evento, resumo, fraldas como
   progresso, mimos, lista com menos caixas. Levar junto:
   - ressalvas da G3.1 (`CARDS.md` §4): prop `error` no `QuantityField`,
     título antes dos selos no DOM, número repetido no painel, estado
     “Adicionando…” e foco depois de incluir; estado visual e “Enviando…”
     no campo e no CTA do convite; foco dos controles com `disabled={busy}`;
   - componentes React para os cards, `ActionMenu` e `ConfirmDialog` (Radix);
   - audit A11–A14 e A16–A19;
   - axe nas telas do organizador (T-F3).
   Fluxo: plano com gates → testes antes (TDD) → código → QA (`qa-ux`) →
   capturas + página de revisão → aprovação → commit/PR.
2. Depois: G5 (estados globais, offline, QA) em 01/10; congelamento em 05/10;
   ensaio em 02–04/10.

## SMTP (T-B1, do Codex) — situação conhecida

- O usuário já criou uma chave de API no Resend **no PC do trabalho**.
- Na máquina de casa não existe `~/.config/chadbb/resend-api-key`, o arquivo
  que `docs/PLANO-SMTP-T-B1.md` espera. No PC do trabalho, conferir se o
  arquivo existe (só `ls -l`, nunca exibir o conteúdo) e se a chave já foi
  configurada no Auth do `chadbb-cha`. Essa checagem é do Codex e, por ser
  remota, precisa de aprovação.
- Sem domínio próprio, o remetente é `onboarding@resend.dev` e só entrega ao
  e-mail da conta Resend (o organizador).
- Sem SMTP, ninguém entra no site; por isso o usuário ainda não consegue ver
  as telas novas em `chadbb.pages.dev`. Localmente: `npm run dev` + Inbucket
  (`http://127.0.0.1:54324`) para o link de login.

## Máquina de casa (para quando voltar a ela)

- Os 3 clones em `~/projetos`: `chadbb` (main), `chadbb-codex` (codex/back),
  `chadbb-claude` (claude/front).
- Docker Desktop com integração WSL ligada; stack local com as 20 migrations.
- Bibliotecas do Chromium instaladas (`libnss3`, `libnspr4`, `libasound2t64`).
- `.env.local` só com as variáveis públicas do Supabase local.
- Falta instalar e autenticar o `gh` (`sudo apt install gh` + `gh auth login`).

## Pendências gerais

- Pedidos ao Codex no quadro: resumo do painel, `available`, `id` das
  reservas, `diapers` no resumo, deadlock intermitente.
- A branch `codex/back` está em WIP de retomada; não mergear sem revisão.
- Testes que falharam uma vez com a máquina carregada e passaram isolados:
  “G2.1 · só uma ação domina”, “tentar de novo pelo teclado mantém o foco” e
  “falha de atualização nos detalhes não apaga…”. Observar; se repetir, tratar
  como teste instável.
