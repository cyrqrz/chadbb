begin;
select no_plan();
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000001','alice@example.test'),
 ('00000000-0000-4000-8000-000000000002','bob@example.test');
insert into public.events (id,owner_id,title,starts_at) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Evento A', now() + interval '1 day'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Evento B', null);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.events),1,'organizador A vê apenas seu evento');
select throws_ok($$ insert into public.events(owner_id) values ('00000000-0000-4000-8000-000000000002') $$,'42501','permission denied for table events','não insere evento com outro dono');
select throws_ok($$ update public.events set owner_id='00000000-0000-4000-8000-000000000002' $$,'42501','permission denied for table events','não troca proprietário diretamente');
select throws_ok($$ delete from public.events $$,'42501','permission denied for table events','não exclui diretamente');
select throws_ok($$ select public.transition_event('10000000-0000-4000-8000-000000000002',1,'published') $$,'42501','EVENT_NOT_FOUND','não publica evento alheio');
select throws_ok($$ select public.save_event('10000000-0000-4000-8000-000000000002',1,'ataque','',now(),'','',null) $$,'42501','EVENT_NOT_FOUND','não edita evento alheio');
select lives_ok($$ select public.transition_event('10000000-0000-4000-8000-000000000001',1,'published') $$,'proprietário publica evento completo');
select throws_ok($$ select public.transition_event('10000000-0000-4000-8000-000000000001',1,'closed') $$,'P0001','VERSION_CONFLICT','versão antiga não sobrescreve alterações');
select lives_ok($$ select public.transition_event('10000000-0000-4000-8000-000000000001',2,'closed') $$,'proprietário encerra evento');
select throws_ok($$ select public.save_event('10000000-0000-4000-8000-000000000001',3,'alterado','',now(),'','',null) $$,'P0001','EVENT_CLOSED','evento encerrado não aceita edição');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.events),1,'organizador B vê apenas seu evento');
select throws_ok($$ select public.transition_event('10000000-0000-4000-8000-000000000002',1,'published') $$,'P0001','PUBLICATION_INVALID','publicação exige data');
select lives_ok($$ insert into storage.objects(bucket_id,name) values ('event-private','00000000-0000-4000-8000-000000000002/10000000-0000-4000-8000-000000000002/foto.png') $$,'proprietário envia arquivo para sua pasta');
select throws_ok($$ insert into storage.objects(bucket_id,name) values ('event-public','00000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/foto.png') $$,'42501','new row violates row-level security policy for table "objects"','não envia para pasta alheia');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from storage.objects where bucket_id='event-private'),0,'A não lê arquivo privado de B');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$ select * from public.events $$,'42501','permission denied for table events','visitante não lê tabela de eventos');
select throws_ok($$ select public.create_event('x') $$,'42501','permission denied for function create_event','visitante não cria evento');
reset role;
select * from finish();
rollback;
