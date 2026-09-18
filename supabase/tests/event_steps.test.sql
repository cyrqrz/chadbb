begin;
select no_plan();
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000001','alice@example.test'),
 ('00000000-0000-4000-8000-000000000002','bob@example.test');
insert into public.events (id,owner_id,title,status,starts_at,ends_at) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Publicado','published', now() + interval '1 day', now() + interval '2 days'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Rascunho','draft', null, null),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Encerrado','closed', now() - interval '2 days', now() - interval '1 day'),
 ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','Alheio','published', now() + interval '1 day', now() + interval '2 days');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

select is((select guests_done_at from public.events where id='10000000-0000-4000-8000-000000000001'), null, 'etapa começa pendente');
select lives_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',1,'guests',true) $$, 'dono conclui convidados');
select ok((select guests_done_at is not null and gifts_done_at is null and version = 2 from public.events where id='10000000-0000-4000-8000-000000000001'), 'só convidados concluído, versão avança');
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',1,'gifts',true) $$,'P0001','VERSION_CONFLICT','versão antiga é recusada');
select lives_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',2,'gifts',true) $$, 'dono conclui presentes');
select lives_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',3,'guests',false) $$, 'dono reabre convidados');
select ok((select guests_done_at is null and gifts_done_at is not null from public.events where id='10000000-0000-4000-8000-000000000001'), 'reabrir limpa só a etapa pedida');
select lives_ok($$ select public.save_event('10000000-0000-4000-8000-000000000001',4,'Publicado 2','',now()+interval '1 day',now()+interval '2 days','','',null) $$, 'dono salva os dados');
select ok((select gifts_done_at is not null from public.events where id='10000000-0000-4000-8000-000000000001'), 'salvar os dados preserva a etapa');
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',5,'outra',true) $$,'P0001','INVALID_PAYLOAD','etapa desconhecida');
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',5,'gifts',null) $$,'P0001','INVALID_PAYLOAD','conclusão nula');
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000002',1,'guests',true) $$,'P0001','EVENT_NOT_PUBLISHED','rascunho não conclui etapa');
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000003',1,'guests',true) $$,'P0001','EVENT_CLOSED','encerrado não conclui etapa');
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000004',1,'guests',true) $$,'42501','EVENT_NOT_FOUND','não conclui etapa de evento alheio');
select throws_ok($$ update public.events set guests_done_at = now() $$,'42501','permission denied for table events','não altera a coluna diretamente');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$ select public.set_event_step('10000000-0000-4000-8000-000000000001',5,'guests',true) $$,'42501','permission denied for function set_event_step','visitante não conclui etapa');
reset role;
select * from finish();
rollback;
