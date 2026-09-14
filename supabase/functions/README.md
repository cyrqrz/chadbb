# Edge Functions

`guest` atende troca de convite, leitura, RSVP e reservas. As credenciais são
validadas pelas RPCs; a chave de servidor permanece na função. A origem do site
é configurada por `GUEST_ALLOWED_ORIGINS`.

`retention` executa a retenção de dados pessoais 30 dias após o término do evento,
com segredo `RETENTION_CRON_SECRET`. O cron chama `private.invoke_retention()`.

As duas funções estão publicadas no projeto exclusivo `chadbb-cha`. Consulte
[execução e smoke remoto](../../docs/EXECUCAO-MVP-FAMILIAR.md) e
[preparação operacional](../../docs/OPERACAO-M6.md).
