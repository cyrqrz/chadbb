-- Exclusão de evento pelo organizador: dono, estado, versão, cascata, capa e auditoria.
-- Dados fictícios; tudo é desfeito no rollback final.
begin;
select no_plan();
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000021','dono-exclusao@example.test'),
 ('00000000-0000-4000-8000-000000000022','outro-exclusao@example.test');
insert into public.events (id, owner_id, status, title, starts_at, ends_at) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','draft','Rascunho fictício',null,null),
 ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000021','published','Publicado fictício', now() + interval '10 days', now() + interval '10 days 4 hours'),
 ('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000021','closed','Encerrado fictício', now() - interval '2 days', now() - interval '2 days' + interval '4 hours'),
 ('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000022','draft','Evento de outra pessoa',null,null);
insert into public.products (id, title, platform, external_reference, category, diaper_size) values
 ('30000000-0000-4000-8000-000000000021','Fraldas P fictícias','manual','teste:exclusao-001','fralda','P'),
 ('30000000-0000-4000-8000-000000000022','Mimo fictício','manual','teste:exclusao-002','mimo',null);
insert into public.event_items (id, event_id, product_id, quantity_requested, category, diaper_size) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000022',null,'mimo',null),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000021',6,'fralda','P'),
 ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000021',6,'fralda','P'),
 ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000022',null,'mimo',null);
insert into private.invitations (id, event_id, name, kind, capacity, token_hash, expires_at, response, attending) values
 ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','Família fictícia','family',3,repeat('a',64), now() + interval '5 days','yes',2),
 ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','Pessoa fictícia','individual',1,repeat('b',64), now() + interval '5 days','no',0),
 ('60000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','Convite preservado','individual',1,repeat('c',64), now() + interval '15 days','pending',0);
insert into private.guest_sessions (token_hash, invitation_id, expires_at) values
 (repeat('d',64),'60000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
 (repeat('e',64),'60000000-0000-4000-8000-000000000002', now() + interval '1 hour');
insert into public.reservations (invitation_id, item_id, quantity, status) values
 ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',2,'purchase_declared'),
 ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',1,'reserved'),
 ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004',1,'cancelled');
insert into private.guest_requests (invitation_id, request_id, payload, result) values
 ('60000000-0000-4000-8000-000000000001', gen_random_uuid(), '{}', '{}'),
 ('60000000-0000-4000-8000-000000000001', gen_random_uuid(), '{}', '{}'),
 ('60000000-0000-4000-8000-000000000002', gen_random_uuid(), '{}', '{}');

-- Superfície e permissões.
select has_function('public', 'delete_event', array['uuid','integer'], 'delete_event(uuid, integer) existe');
select is((select prosecdef from pg_proc where oid = 'public.delete_event(uuid,integer)'::regprocedure), true, 'delete_event é security definer');
select is((select proconfig from pg_proc where oid = 'public.delete_event(uuid,integer)'::regprocedure), array['search_path=""'], 'search_path vazio');
select ok(has_function_privilege('authenticated','public.delete_event(uuid,integer)','EXECUTE'), 'organizador executa delete_event');
select ok(not has_function_privilege('anon','public.delete_event(uuid,integer)','EXECUTE'), 'visitante não executa delete_event');
select ok(not has_function_privilege('service_role','public.delete_event(uuid,integer)','EXECUTE'), 'chave de servidor não exclui sem identidade do dono');
select ok(has_function_privilege('service_role','public.event_deletion_pending(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.event_deletion_storage_done(uuid,integer)','EXECUTE')
  and has_function_privilege('service_role','public.event_deletion_storage_failed(uuid)','EXECUTE'), 'service_role conduz a limpeza do Storage');
select ok(not has_function_privilege('authenticated','public.event_deletion_pending(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.event_deletion_storage_done(uuid,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.event_deletion_storage_failed(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.event_deletion_pending(uuid)','EXECUTE'), 'clientes não conduzem a limpeza do Storage');
select ok(not has_table_privilege('authenticated','private.event_deletions','SELECT')
  and not has_table_privilege('service_role','private.event_deletions','SELECT'), 'registro de exclusões não é lido pelos clientes nem pela chave de servidor');
select is(array(select column_name::text from information_schema.columns
  where table_schema='private' and table_name='event_deletions' order by ordinal_position),
  array['id','event_id','deleted_at','previous_status','items_removed','invitations_removed','guest_requests_removed',
    'reservations_removed','guest_sessions_removed','storage_prefix','storage_objects_removed','storage_failures','storage_cleaned_at'],
  'auditoria mínima: somente contagens técnicas e a pasta pendente');

-- A capa do rascunho existe no bucket público.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000021',true);
insert into storage.objects (bucket_id, name) values
 ('event-public','00000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000001/capa.png');
reset role;
update public.events set cover_path = '00000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000001/capa.png'
 where id = '40000000-0000-4000-8000-000000000001';

-- Sem identidade.
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000001', 2) $$, '42501', 'AUTH_REQUIRED', 'sem sessão não exclui');
reset role;
set local role anon;
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000001', 2) $$, '42501', 'permission denied for function delete_event', 'visitante não chama a função');
reset role;

-- Não dono, inexistente e nulo recebem o mesmo erro, sem revelar a existência.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000021',true);
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000004', 1) $$, '42501', 'EVENT_NOT_FOUND', 'não exclui evento de outra pessoa');
select throws_ok($$ select public.delete_event('4fffffff-0000-4000-8000-000000000000', 1) $$, '42501', 'EVENT_NOT_FOUND', 'evento inexistente tem erro claro');
select throws_ok($$ select public.delete_event(null, 1) $$, '42501', 'EVENT_NOT_FOUND', 'identificador nulo tem erro claro');
select throws_ok($$ delete from public.events where id = '40000000-0000-4000-8000-000000000001' $$, '42501', 'permission denied for table events', 'exclusão direta continua proibida');

-- Versão obrigatória e estado.
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000001', 1) $$, 'P0001', 'EVENT_VERSION_CONFLICT', 'versão antiga não exclui');
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000001', null) $$, 'P0001', 'EVENT_VERSION_CONFLICT', 'versão ausente não exclui');
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000002', 99) $$, 'P0001', 'EVENT_VERSION_CONFLICT', 'versão é conferida antes do estado');
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000002', 1) $$, 'P0001', 'EVENT_NOT_DELETABLE', 'evento publicado não é excluído');
reset role;
select is((select count(*)::integer from public.events where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000004')), 3,
  'recusas não apagam nada');
select is((select count(*)::integer from private.event_deletions), 0, 'recusas não geram registro');

-- Rascunho com capa.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000021',true);
select is(public.delete_event('40000000-0000-4000-8000-000000000001', 2),
  jsonb_build_object('event_id','40000000-0000-4000-8000-000000000001','items_removed',1,'invitations_removed',0,
    'reservations_removed',0,'storage_cleanup','pending'),
  'dono exclui rascunho e recebe contagens');
select is((select count(*)::integer from public.events where id = '40000000-0000-4000-8000-000000000001'), 0, 'dono deixa de ver o rascunho');
select throws_ok($$ select public.delete_event('40000000-0000-4000-8000-000000000001', 2) $$, '42501', 'EVENT_NOT_FOUND', 'repetição recebe erro claro');
reset role;
select is((select count(*)::integer from public.event_items where event_id = '40000000-0000-4000-8000-000000000001'), 0, 'itens do rascunho removidos');
select is((select count(*)::integer from public.products where id in ('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000022')), 2, 'catálogo preservado');
select is((select count(*)::integer from storage.objects where bucket_id = 'event-public'
  and name = '00000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000001/capa.png'), 1,
  'capa aguarda a remoção pela API de Storage (exclusão direta é bloqueada)');

-- Fila de limpeza da capa: service_role lê, conclui e registra falhas.
set local role service_role;
select results_eq($$ select event_id, storage_prefix from public.event_deletion_pending('40000000-0000-4000-8000-000000000001') $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000001') $$,
  'pasta do evento excluído fica pendente de limpeza');
select results_eq($$ select event_id from public.event_deletion_pending(null) $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid) $$, 'sem filtro lista todas as pendências');
select lives_ok($$ select public.event_deletion_storage_failed('40000000-0000-4000-8000-000000000001') $$, 'falha do Storage é registrada');
select is((select count(*)::integer from public.event_deletion_pending('40000000-0000-4000-8000-000000000001')), 1, 'falha mantém a pendência para nova tentativa');
select lives_ok($$ select public.event_deletion_storage_done('40000000-0000-4000-8000-000000000001', 1) $$, 'limpeza concluída é registrada');
select is((select count(*)::integer from public.event_deletion_pending(null)), 0, 'pendência encerrada');
select lives_ok($$ select public.event_deletion_storage_done('40000000-0000-4000-8000-000000000001', 0) $$, 'conclusão repetida é inofensiva');
select throws_ok($$ select public.event_deletion_storage_done('4fffffff-0000-4000-8000-000000000000', 0) $$, '22023', 'EVENT_DELETION_NOT_FOUND', 'conclusão exige exclusão registrada');
select throws_ok($$ select public.event_deletion_storage_done('40000000-0000-4000-8000-000000000001', -1) $$, '22023', 'INVALID_STORAGE_COUNT', 'contagem negativa recusada');
reset role;
select is((select row(previous_status, items_removed, invitations_removed, guest_requests_removed, reservations_removed,
    guest_sessions_removed, storage_prefix, storage_objects_removed, storage_failures, storage_cleaned_at is not null)::text
  from private.event_deletions where event_id = '40000000-0000-4000-8000-000000000001'),
  row('draft', 1, 0, 0, 0, 0, null::text, 1, 1, true)::text,
  'auditoria do rascunho: contagens, sem a pasta depois da limpeza, primeira contagem preservada');

-- Encerrado com convidados: cascata completa, sem tocar o evento publicado.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000021',true);
select is(public.delete_event('40000000-0000-4000-8000-000000000003', 1),
  jsonb_build_object('event_id','40000000-0000-4000-8000-000000000003','items_removed',2,'invitations_removed',2,
    'reservations_removed',3,'storage_cleanup','pending'),
  'dono exclui evento encerrado');
reset role;
select is((select count(*)::integer from public.events where id = '40000000-0000-4000-8000-000000000003'), 0, 'evento encerrado removido');
select is((select count(*)::integer from public.event_items where event_id = '40000000-0000-4000-8000-000000000003'), 0, 'itens removidos');
select is((select count(*)::integer from private.invitations where event_id = '40000000-0000-4000-8000-000000000003'), 0, 'convites removidos');
select is((select count(*)::integer from private.guest_sessions where invitation_id in
  ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')), 0, 'sessões removidas');
select is((select count(*)::integer from private.guest_requests where invitation_id in
  ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')), 0, 'respostas registradas removidas');
select is((select count(*)::integer from public.reservations where invitation_id in
  ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002')), 0, 'reservas removidas, inclusive canceladas');
select is((select row(previous_status, items_removed, invitations_removed, guest_requests_removed, reservations_removed,
    guest_sessions_removed, storage_prefix, storage_objects_removed, storage_failures, storage_cleaned_at)::text
  from private.event_deletions where event_id = '40000000-0000-4000-8000-000000000003'),
  row('closed', 2, 2, 3, 3, 2, '00000000-0000-4000-8000-000000000021/40000000-0000-4000-8000-000000000003', null::integer, 0, null::timestamptz)::text,
  'auditoria do encerrado: apenas contagens e pasta pendente');
select is((select count(*)::integer from public.events where id in ('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000004')), 2, 'outros eventos preservados');
select is((select count(*)::integer from private.invitations where id = '60000000-0000-4000-8000-000000000003'), 1, 'convite de outro evento preservado');
select is((select count(*)::integer from public.event_items where id = '50000000-0000-4000-8000-000000000002'), 1, 'item de outro evento preservado');

select * from finish();
rollback;
