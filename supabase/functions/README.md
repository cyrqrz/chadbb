# Edge Functions

`guest` atende troca de convite, leitura, RSVP e reservas. As credenciais são
validadas pelas RPCs; a chave de servidor permanece na função. A origem do site
é configurada por `GUEST_ALLOWED_ORIGINS`.

`retention` executa a retenção de dados pessoais 30 dias após o término do evento,
com segredo `RETENTION_CRON_SECRET`. O cron chama `private.invoke_retention()`.

`delete-event` exclui um evento `draft` ou `closed` do organizador autenticado.
Chama a RPC `delete_event` com o JWT recebido e remove a pasta do evento nos
buckets pela API de Storage. Pendências de limpeza são repetidas pela `retention`.
O código comum de Storage fica em `_shared/storage.ts`.

As três funções estão publicadas no projeto exclusivo `chadbb-cha`
(`delete-event` desde 2026-09-17), só com a origem `https://chadbb.pages.dev`. Consulte
[execução e smoke remoto](../../docs/EXECUCAO-MVP-FAMILIAR.md) e
[preparação operacional](../../docs/OPERACAO-M6.md).
