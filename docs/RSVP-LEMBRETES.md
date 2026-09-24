# Prazo de Talvez e lembretes

Decisão do titular em 24/09/2026: ocultar e recusar Talvez dez dias antes do
início, pedir o e-mail ao selecionar Talvez, lembrar e dar três dias para uma
resposta definitiva. Sem resposta após o prazo, marcar Não poderá ir. O horário
é o mesmo do início do evento, em Brasília. O prazo textual antigo de 18/10 não
bloqueia RSVP; deve ser revisto pelo organizador para não contradizer a regra.

## Funcionamento

O snapshot e o painel recebem a política calculada pelo Postgres. Contatos ficam
na fila privada, fora de logs, painel e snapshots. O endereço sai da fila quando
há resposta definitiva, revogação, exclusão ou expurgo. Convites antigos em
Talvez sem e-mail não recebem conversão automática: precisam confirmar ou
informar contato antes do corte.

A Edge `rsvp-reminders` faz claim, revalida, envia e registra o aceite. Sem aceite
não há conversão. O prazo final é no mínimo três dias depois do registro do
aceite. O texto do e-mail orienta reabrir o convite original, não cria novo acesso.
Reservas de presentes não são apagadas ao converter a presença.

A execução é a cada 15 minutos, em lotes de dez. A conversão ocorre na primeira
execução após o prazo. Reagendamento reinicia o ciclo. Eventos encerrados e
convites revogados/expirados não são processados.

## Gates para publicação

- **G1/G2, locais:** contrato, migration, handler e regressões/revisão.
- **G3, local:** checks, PostgreSQL descartável, navegador e evidências.
- **G4, remoto:** mostrar diff/dry-run e obter aprovação conforme `AGENTS.md`.
  A implementação local não ativa e-mail ou cron na produção.

Ordem do G4, depois da aprovação:

1. Conferir dry-run da migration `20260924000000_rsvp_reminders.sql`; aplicar
   antes de publicar o front. O contrato adiciona `rsvp` obrigatório.
2. Configurar `RSVP_CRON_SECRET` (mínimo 32 caracteres aleatórios),
   `RSVP_RESEND_API_KEY` e `RSVP_EMAIL_FROM` no ambiente da Edge. Chave restrita
   ao envio e remetente de domínio verificado. Não copiar para variáveis VITE.
3. Guardar o mesmo segredo no Vault como `rsvp_cron_secret`; `project_url` já é
   usado pelo job de retenção. Os valores nunca entram em terminal/log/diff.
4. Publicar `guest` e `rsvp-reminders`; conferir autenticação do handler e testar
   somente com um destinatário fictício de teste do provedor, se aprovado.
5. Ativar `scripts/rsvp/enable.sql`. Ele exige Vault configurado e agenda um
   único job `rsvp-reminders`. Publicar o front depois da infraestrutura pronta.
6. Conferir contagens de retorno e execuções no cron. Confirmar entrega real em
   caixa exige teste separado; aceite do provedor não é prova de entrega.

## Falhas e reexecução

A chave idempotente é estável por ciclo, `rsvp-reminder/<id>`, com lease de cinco
minutos. O [Resend retém chaves por 24 horas](https://resend.com/changelog/idempotency-keys);
por isso a fila só repete automaticamente por 23 horas após a primeira tentativa.
Fora dessa janela, o job fica pendente para investigação, sem reenvio nem mudança
automática da presença. Não gerar outro ID sem conferir o resultado no provedor.

Uma mudança de remetente/template durante retries pode gerar conflito de
idempotência: manter a versão até drenar a fila. Uma resposta entre a revalidação
e o HTTP ainda pode receber lembrete; o texto explica que quem já respondeu pode
ignorá-lo, e o registro final não altera a resposta atual.

Aceite/erro/logs só produzem contagens. Não imprimir as linhas da fila nem os
payloads do provedor. Desativação operacional: `cron.alter_job` com `active=false`
para o job indicado, após aprovação remota. Não apagar a fila para “destravar”.
