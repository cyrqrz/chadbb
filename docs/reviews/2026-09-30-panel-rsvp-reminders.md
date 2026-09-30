# Avisos de lembretes no painel — 30/09/2026

Solicitação do titular: implementar as sugestões de painel do handoff de 24/09.
Branch `clone-main`, base `6718b06`. Trabalho local; sem commit/push ou migration
aplicada em produção nesta tarefa.

## G1 — contrato e testes antes da implementação

Contrato em `CONTRATOS-TRANSACIONAIS.md`, seção “Observabilidade no painel”.
Novo `invitations[].auto_declined` e `summary.reminders: { pending, attention }`.
Seis testes de banco falharam pelos campos ausentes; teste de navegador falhou
pela ausência da seção de lembretes antes de alterar o produto.

## G2 — implementação e revisão

- Migration adiciona booleano privado de origem da resposta (padrão falso,
  restrito a `no`). Somente a conversão automática marca; nova resposta manual
  limpa, inclusive `no` → `no`. Replay preserva o estado atual.
- Helper privado calcula contagens por evento, no mesmo instante SQL. Exclui
  enviados, convites revogados/expirados e eventos fechados/iniciados.
- Atenção cobre ausência de fila, janela de retentativa encerrada e atraso
  superior a 30 minutos após o maior prazo operacional. Lease ativo continua
  pendente. Nenhum contato ou lease sai no payload do painel.
- Painel mostra “Não poderá ir (automático)” e explica o prazo vencido. Seção
  de lembretes mostra “Aguardando envio” e “Precisam de atenção”, com orientação
  para procurar suporte quando necessário. A consulta periódica existente
  atualiza ambos sem cálculo de prazo ou contagem no navegador.
- Revisão independente do `tdd_senior`: sem achados. Comparação das funções
  redefinidas confirmou preservação das validações, autorização e locks;
  diferenças restritas à marca e aos novos campos do painel.

## G3 — validação local

- `npm run check`: lint, tipos, 68 testes unitários e build aprovados.
- `npm run test:db:portable`: 99/99 aprovados, incluindo 19 cenários de RSVP.
  Abrange permissões do helper, isolamento, limites temporais, replay,
  concorrência existente, marca manual/automática e preservação da origem ao
  editar/revogar/reemitir convite.
- Navegador: 30/30 testes direcionados aprovados em desktop/mobile, cobrindo
  painel, atualização, erros, teclado, offline, acessibilidade (axe) e largura
  de 320 px. Comando: `npx playwright test tests/e2e/panel.spec.ts
  tests/e2e/offline.spec.ts -g 'lembretes no painel|painel separa|painel usa|painel
  vazio|falha ao abrir o painel|criar convite offline|reconsulta|revogar com
  edição|reemitir link com edição|homônimos|tentar de novo pelo teclado|links de
  voltar e abas' --workers=4` (expressão em uma linha).
- `git diff --check`: aprovado.
- Na primeira regressão de banco, a expectativa antiga do resumo precisava
  incluir o novo objeto; ajustada. Nos testes novos de navegador, seletores
  foram corrigidos para distinguir texto explicativo e ícone do selo. Rodada
  ampla de navegador interrompida após essas correções para executar os casos
  pertinentes ao painel; não é evidência de suíte e2e completa aprovada.

## G4 — publicação pendente

Diff pronto para revisão. Aplicar a migration antes de publicar o front, que
espera os novos campos obrigatórios. A migration é aditiva, mas redefine três
funções para devolver o novo contrato e registrar a origem das respostas.
Não requer novos segredos, cron ou deploy de Edge Functions.

Não reconstruir marca automática para respostas históricas: a origem não foi
guardada. O teste de banco portátil não substitui validação da migration e do
payload no ambiente publicado. Restauração com dados reais permanece pendente
em outra frente; esta alteração não a encerra.
