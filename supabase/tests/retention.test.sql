begin;
select plan(12);
select is((select count(*)::integer from cron.job where jobname='personal-data-retention' and active), 1,
  'um único job ativo executa a retenção');
select is((select count(*)::integer from cron.job where jobname='guest-data-retention'), 0,
  'job técnico de 90 dias foi desagendado');
select is((select schedule from cron.job where jobname='personal-data-retention'), '17 6 * * *',
  'diário às 06:17 UTC (03:17 em Brasília)');
select is((select command from cron.job where jobname='personal-data-retention'), 'select private.invoke_retention()',
  'job chama a Edge Function com URL e segredo do Vault');
select is(to_regprocedure('private.cleanup_guest_data()'), null, 'função de 90 dias removida');
select is(array(select column_name::text from information_schema.columns
  where table_schema='private' and table_name='retention_audit' order by ordinal_position),
  array['id','event_id','ran_at','status','invitations_removed','guest_requests_removed',
    'reservations_removed','guest_sessions_removed','storage_objects_removed'],
  'auditoria mínima: apenas contagens técnicas');
select ok(not has_function_privilege('anon','public.retention_run()','EXECUTE')
  and not has_function_privilege('authenticated','public.retention_run()','EXECUTE'), 'retention_run fechado a clientes');
select ok(has_function_privilege('service_role','public.retention_purge_event(uuid,integer)','EXECUTE'), 'service_role executa o expurgo');
select ok(not has_function_privilege('authenticated','public.retention_purge_event(uuid,integer)','EXECUTE'), 'organizador não executa o expurgo');
select ok(not has_function_privilege('service_role','private.purge_event_personal_data(uuid,integer)','EXECUTE'), 'função privada só via wrapper');
select ok(not has_table_privilege('service_role','private.retention_audit','SELECT'), 'auditoria não é lida pela chave de servidor');
select is(private.invoke_retention(), null, 'sem segredos no Vault o job não faz nada');
select * from finish();
rollback;
