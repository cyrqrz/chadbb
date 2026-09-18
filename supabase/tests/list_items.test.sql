begin;
select no_plan();
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-000000000001','alice@example.test'),
 ('00000000-0000-4000-8000-000000000002','bob@example.test');
insert into public.events (id,owner_id,title,status,starts_at,ends_at) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Evento A','published', now() + interval '1 day', now() + interval '2 days'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Evento B','published', now() + interval '1 day', now() + interval '2 days'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Encerrado','closed', now() - interval '2 days', now() - interval '1 day');
insert into public.products (id,title,platform,external_reference,category) values
 ('20000000-0000-4000-8000-000000000001','Mimo de teste A','manual','teste:mimo-a','mimo'),
 ('20000000-0000-4000-8000-000000000002','Mimo de teste B','manual','teste:mimo-b','mimo');
insert into public.event_items (id,event_id,product_id,quantity_requested,category) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,'mimo'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',null,'mimo'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',null,'mimo');
insert into private.invitations (id,event_id,name,kind,capacity,token_hash,expires_at) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Convidado fictício','individual',1,'hash-teste-lista',now() + interval '7 days');
insert into public.reservations (invitation_id,item_id,quantity,status) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1,'reserved'),
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'cancelled');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

-- Remover
select throws_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1) $$,'P0001','ITEM_HAS_RESERVATIONS','item com reserva ativa não sai');
select throws_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',9) $$,'P0001','ITEM_VERSION_CONFLICT','versão antiga é recusada');
select lives_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1) $$,'item só com reserva cancelada sai');
select is((select count(*)::integer from public.event_items where event_id='10000000-0000-4000-8000-000000000001'),1,'sobra só o item reservado');
select is((select count(*)::integer from public.products where id='20000000-0000-4000-8000-000000000001'),1,'produto do catálogo continua existindo');
select throws_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1) $$,'P0001','ITEM_NOT_FOUND','item já removido');
select throws_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',1) $$,'P0001','EVENT_CLOSED','evento encerrado não perde itens');

-- Mimo próprio
select lives_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000001','  Livro de pano  ','Qualquer cor') $$,'dono cria mimo próprio');
select is((select p.title from public.event_items i join public.products p on p.id=i.product_id where p.event_id='10000000-0000-4000-8000-000000000001'),'Livro de pano','título sem espaços nas pontas');
select ok((select i.quantity_requested is null and i.category='mimo' from public.event_items i join public.products p on p.id=i.product_id where p.event_id='10000000-0000-4000-8000-000000000001'),'mimo próprio sem limite');
select throws_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000001','LIVRO DE PANO') $$,'P0001','ITEM_ALREADY_EXISTS','nome repetido é recusado');
select throws_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000001','mimo de teste b') $$,'P0001','ITEM_ALREADY_EXISTS','nome igual a item do catálogo na lista é recusado');
select throws_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000001','   ') $$,'22023','INVALID_TREAT','nome vazio é recusado');
select throws_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000003','Novo mimo') $$,'P0001','EVENT_CLOSED','evento encerrado não recebe mimo');
select throws_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000002','Invasão') $$,'42501','EVENT_NOT_FOUND','não cria mimo em evento alheio');
select throws_ok($$ insert into public.products(title,platform,external_reference,category) values ('x','manual','x','mimo') $$,'42501','permission denied for table products','não cadastra produto direto');

-- Outro organizador não vê nem usa o mimo próprio
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.products where event_id is not null),0,'mimo próprio não aparece para outro organizador');
reset role;
select set_config('test.custom', (select id::text from public.products where event_id='10000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select throws_ok($$ select public.add_event_item('10000000-0000-4000-8000-000000000002', current_setting('test.custom')::uuid, null) $$,'P0001','PRODUCT_UNAVAILABLE','mimo próprio não entra na lista de outro evento');

-- Remover o mimo próprio apaga o produto
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select lives_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000001',
  (select id from public.event_items where product_id = current_setting('test.custom')::uuid), 1) $$,'dono remove o mimo próprio');
reset role;
select is((select count(*)::integer from public.products where event_id='10000000-0000-4000-8000-000000000001'),0,'produto do mimo próprio é apagado junto');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$ select public.remove_event_item('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1) $$,'42501','permission denied for function remove_event_item','visitante não remove item');
select throws_ok($$ select public.add_custom_treat('10000000-0000-4000-8000-000000000001','x') $$,'42501','permission denied for function add_custom_treat','visitante não cria mimo');
reset role;
select * from finish();
rollback;
