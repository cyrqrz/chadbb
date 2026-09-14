begin;
select no_plan();
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000011','versao@example.test');
insert into public.events (id, owner_id, title, starts_at) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Evento versionado', now() + interval '1 day');
insert into public.products (id, title, platform, external_reference, category, diaper_size) values
 ('30000000-0000-4000-8000-000000000001','Fraldas tamanho M','manual','teste:versao-001','fralda','M'),
 ('30000000-0000-4000-8000-000000000002','Mimo fictício','manual','teste:versao-002','mimo',null);

-- Versão e relógio não dependem do caminho de escrita: a escrita pede valores
-- próprios e o banco impõe os corretos, para a aba aberta detectar a alteração.
update public.events set title = 'corrigido', version = 1, updated_at = '2000-01-01T00:00:00Z'
 where id = '20000000-0000-4000-8000-000000000001';
select is((select version from public.events where id = '20000000-0000-4000-8000-000000000001'), 2,
  'versão do evento avança mesmo em escrita direta que pede versão menor');
select ok((select updated_at from public.events where id = '20000000-0000-4000-8000-000000000001') > now() - interval '1 minute',
  'updated_at do evento é o relógio do banco, não o valor enviado');
select throws_ok($$ update public.events set owner_id = '00000000-0000-4000-8000-000000000001' where id = '20000000-0000-4000-8000-000000000001' $$,
  '23514', 'EVENT_IDENTITY_IMMUTABLE', 'proprietário do evento é imutável');
select throws_ok($$ update public.events set created_at = created_at + interval '1 second' where id = '20000000-0000-4000-8000-000000000001' $$,
  '23514', 'EVENT_IDENTITY_IMMUTABLE', 'data de criação do evento é imutável');

insert into public.event_items (id, event_id, product_id, quantity_requested, category, diaper_size) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001', 2, 'fralda', 'M'),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002', null, 'mimo', null);
update public.event_items set quantity_requested = 7, version = 1, updated_at = '2000-01-01T00:00:00Z'
 where id = '40000000-0000-4000-8000-000000000001';
select is((select version from public.event_items where id = '40000000-0000-4000-8000-000000000001'), 2,
  'versão do item avança mesmo em escrita direta que pede versão menor');
select throws_ok($$ update public.event_items set event_id = '20000000-0000-4000-8000-000000000001'::uuid, product_id = gen_random_uuid() where id = '40000000-0000-4000-8000-000000000001' $$,
  '23514', 'ITEM_IDENTITY_IMMUTABLE', 'vínculo do item com o produto é imutável');

update public.products set title = 'Presente revisado', updated_at = '2000-01-01T00:00:00Z'
 where id = '30000000-0000-4000-8000-000000000001';
select ok((select updated_at from public.products where id = '30000000-0000-4000-8000-000000000001') > now() - interval '1 minute',
  'catálogo registra quando o produto foi revisado');
select throws_ok($$ update public.products set created_at = created_at + interval '1 second' where id = '30000000-0000-4000-8000-000000000001' $$,
  '23514', 'PRODUCT_IDENTITY_IMMUTABLE', 'data de cadastro do produto é imutável');

-- A chave de servidor lê o estado, mas nenhuma escrita do protocolo passa por ela.
select ok(not has_table_privilege('service_role', 'public.events', 'UPDATE'), 'service_role não altera eventos');
select ok(not has_table_privilege('service_role', 'public.events', 'INSERT'), 'service_role não insere eventos');
select ok(not has_table_privilege('service_role', 'public.events', 'DELETE'), 'service_role não exclui eventos');
select ok(has_table_privilege('service_role', 'public.events', 'SELECT'), 'service_role continua lendo eventos');
select ok((select count(*) from pg_indexes where schemaname = 'public' and indexname = 'event_items_event_created_idx') = 1,
  'lista do evento tem índice para filtro, ordenação e paginação');
-- Categoria e tamanho do item também são identidade, não podem mudar depois.
select throws_ok($$ update public.event_items set diaper_size = 'P' where id = '40000000-0000-4000-8000-000000000001' $$,
  '23514', 'ITEM_IDENTITY_IMMUTABLE', 'tamanho do item do evento é imutável');
-- Mimo sem limite e fralda com limite: a bicondicional impede cota fantasma.
select is((select quantity_requested from public.event_items where id = '40000000-0000-4000-8000-000000000002'), null,
  'mimo entra na lista sem limite de quantidade');
select throws_ok($$ insert into public.event_items (event_id, product_id, quantity_requested, category) values ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002', 3, 'mimo') $$,
  '23514', 'new row for relation "event_items" violates check constraint "event_items_limit_matches_category"',
  'mimo não aceita limite numérico');
select throws_ok($$ update public.event_items set quantity_requested = null where id = '40000000-0000-4000-8000-000000000001' $$,
  '23514', 'new row for relation "event_items" violates check constraint "event_items_limit_matches_category"',
  'fralda não fica sem limite');
select * from finish();
rollback;
