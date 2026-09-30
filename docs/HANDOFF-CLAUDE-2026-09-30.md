# Retomada para Claude — 30/09/2026

## Começar aqui

O titular pediu encerrar a sessão do Codex e continuar com Claude. O trabalho
está salvo **sem commit**, na branch `clone-main`, base `6718b06`, na pasta
`C:\Users\leonardo.martins\chadbb` (WSL:
`/mnt/c/Users/leonardo.martins/chadbb`). Existe outro clone em `Documents/chadbb`:
**as alterações desta sessão estão no primeiro caminho**, não naquele clone.

Leia `AGENTS.md`, confira `git status` e o diff antes de sincronizar. Preserve
todas as alterações e arquivos novos; não faça reset/checkout para descartá-los.
O PR #31 já foi mergeado em 24/09; `main` e `clone-main` remotas estavam iguais
na última conferência. Não há PR novo desta sessão.

## Pedido em andamento e resultado

O titular escolheu **implementar os avisos de lembretes no painel**.
Implementação local concluída e validada:

- Selo “Não poderá ir (automático)” e explicação do prazo vencido.
- Contadores “Aguardando envio” e “Precisam de atenção”, vindos do banco.
- Atualização periódica existente preservada; nenhum e-mail exposto no painel.
- Nova resposta manual limpa a marca automática; replay preserva o estado
  atual. Editar, revogar ou reemitir convite preserva a origem da resposta.
- Contagens excluem lembretes enviados, convites revogados/expirados e eventos
  fechados/iniciados. Atenção inclui fila ausente, janela de retentativa
  encerrada e atraso operacional superior a 30 minutos. Regras completas no
  contrato; o front não recalcula prazos nem contagens.

## Arquivos e evidências

- `supabase/migrations/20260930000000_panel_rsvp_reminders.sql` — **arquivo novo,
  ainda não rastreado**. Adiciona `private.invitations.auto_declined`, helper
  privado de contagens e redefine `guest_action`, `rsvp_reminders_claim` e
  `organizer_invitations`, preservando autorização, validações e locks.
- `src/features/guests/InvitationsPage.tsx` e `api.ts` — UI e contrato tipado.
- `tests/database/rsvp-reminders.integration.mjs` — novos casos; testes
  existentes do resumo ajustados em `events.integration.mjs`.
- `tests/e2e/panel.spec.ts`, `organizer.spec.ts`, `offline.spec.ts` — novo
  cenário e fixtures com os campos obrigatórios.
- `docs/CONTRATOS-TRANSACIONAIS.md`, `TAREFAS-AGENTES.md` e handoff de 24/09
  atualizados. Revisão detalhada em
  `docs/reviews/2026-09-30-panel-rsvp-reminders.md` (**arquivo novo**).

Validação final:

- `npm run check`: lint, tipos, **68 unitários** e build aprovados.
- `npm run test:db:portable`: **99/99**, incluindo **19** cenários de RSVP.
- Playwright direcionado: **30/30**, desktop/mobile, atualização, erros,
  teclado, offline, axe e largura de 320 px. Comando na revisão.
- `git diff --check`: aprovado.
- Revisão independente do `tdd_senior`: sem achados. Comparou funções
  redefinidas e conferiu autorização/privacidade/locks. Testes novos de banco
  tiveram RED antes da implementação.

Não declarar suíte e2e completa aprovada: uma rodada ampla foi interrompida
após corrigir seletores do teste novo; a rodada direcionada final passou.
Esses resultados são locais, não validação da nova migration em produção.

## Próximo passo — G4 pendente

Codex perguntou ao titular se autorizava commit, push, aplicação da migration
e abertura do PR. **Não houve aprovação**: a resposta foi preparar esta troca
de sessão. A implementação já está concreta e revisável; não precisa refazê-la.

1. Apresentar/revisar o diff e obter a autorização exigida em `AGENTS.md` para
   commit/push e escrita em produção. A troca de sessão não autoriza publicar.
2. Conferir migrations remotas e preparar dry-run da única migration nova.
   Não usar `supabase link`, `--linked` ou `--db-url` contra produção: vale a
   regra do `AGENTS.md`, apesar de instruções antigas divergentes no handoff.
3. **Banco antes do front:** aplicar a migration autorizada e verificar o novo
   payload antes do merge/publicação. O novo front exige os campos obrigatórios.
   Não precisa mudar segredos, cron ou publicar Edge Functions.
4. Commit/push e PR `clone-main` → `main` conforme autorização. Merge segue a
   regra do repositório/titular; não presumir autorização para ele.

Respostas antigas começam com `auto_declined=false`: não há histórico que
permita reconstruir se foram automáticas. Não inventar backfill.

## Operação conferida nesta sessão (anterior à mudança do painel)

- Titular confirmou domínio `chadbb.online` **Verified** no Resend.
- Cron `rsvp-reminders` lido no banco: ativo, a cada 15 min; últimas execuções
  consultadas com `succeeded`. Fila estava vazia antes do smoke.
- Smoke remoto explicitamente solicitado pelo titular, com dados fictícios e
  `delivered@resend.dev`: sem segredo 401; com segredo 200, um lembrete aceito,
  prazo de três dias; replay sem duplicação; vencimento simulado converteu para
  `no` e apagou contato. Todos os IDs fictícios removidos, contagens finais zero.
  Não é comprovação de entrega em caixa postal humana.
- Consulta ao histórico do Resend com `~/.config/chadbb/resend-api-key` retornou
  **401**. A credencial da Edge funcionou no envio. Nenhum segredo foi alterado;
  não trocar a credencial de produção pela local sem investigar.
- Backups de 28 e 29/09 passaram. Em 27/09 a captura falhou em `dump roles`,
  antes de publicar no R2; causa específica indisponível com debug desativado.
  Saúde de produção de 30/09 às 11:43 UTC passou. Links no handoff de 24/09.
- O evento contém **dados de teste**, segundo o titular. Cadastro real,
  restauração com dados/Storage reais e medição de RTO continuam pendentes,
  assim como ensaio familiar, leitor de tela e entrevista `/grill-produto`.

## Segredos e artefatos locais

Credenciais existem em `~/.config/chadbb/`, fora do Git. Senha do banco no
arquivo `chadbb-cha.db-password`; segredo de cron em `rsvp-cron-secret`.
Nunca imprimir valores nem pedir que o titular os cole no chat.

Logs auxiliares desta máquina: `/tmp/chadbb-panel-db-tests.log` e
`/tmp/chadbb-panel-e2e.log`. O runner temporário do smoke remoto está em
`/tmp/chadbb-rsvp-smoke-20260930.mjs`: **não reexecutar automaticamente**; cria
dados e aciona a fila global. A evidência durável está nos documentos do repo.

Se a troca for só de agente nesta máquina, basta abrir a pasta correta. Se for
troca de máquina, estas alterações ainda não estão no GitHub: transportar a
pasta de trabalho por meio apropriado ou autorizar commit/push antes de sair.
