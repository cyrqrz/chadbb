begin;
select plan(3);
select is((select count(*)::integer from cron.job where jobname='guest-data-retention' and active), 1,
  'um job ativo faz o expurgo sem depender de requisições');
select is((select schedule from cron.job where jobname='guest-data-retention'), '17 3 * * *',
  'expurgo diário às 03:17 no fuso do cron');
select is((select command from cron.job where jobname='guest-data-retention'), 'select private.cleanup_guest_data()',
  'job executa a função protegida de retenção');
select * from finish();
rollback;
