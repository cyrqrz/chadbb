-- T-B5: as três cotas da Edge guest numa única chamada, com a mesma regra de
-- check_guest_rate (ordem ip → token → global, parando na primeira recusa).
begin;
select no_plan();
delete from private.guest_rate;

select has_function('public', 'check_guest_rates', array['text[]'], 'check_guest_rates(text[]) existe');
select ok(has_function_privilege('service_role','public.check_guest_rates(text[])','EXECUTE'), 'service_role executa');
select ok(not has_function_privilege('anon','public.check_guest_rates(text[])','EXECUTE')
  and not has_function_privilege('authenticated','public.check_guest_rates(text[])','EXECUTE'), 'clientes não executam');
select is((select proconfig from pg_proc where oid = 'public.check_guest_rates(text[])'::regprocedure), array['search_path=""'], 'search_path vazio');

create temporary table rate_key(k text primary key, h text);
insert into rate_key values
 ('ip:teste', encode(sha256(convert_to('ip:teste','UTF8')),'hex')),
 ('token:teste', encode(sha256(convert_to('token:teste','UTF8')),'hex')),
 ('global', encode(sha256(convert_to('global','UTF8')),'hex'));
create function pg_temp.used(p_key text) returns integer language sql as $$
  select coalesce((select requests from private.guest_rate r join rate_key k on k.h = r.key_hash where k.k = p_key), 0)
$$;

select is(public.check_guest_rates(array['ip:teste','token:teste','global']), true, 'pedido dentro das cotas passa');
select is(array[pg_temp.used('ip:teste'), pg_temp.used('token:teste'), pg_temp.used('global')], array[1,1,1], 'as três cotas contam uma vez');

-- Cota de IP esgotada: nem credencial nem global são consumidas.
update private.guest_rate set requests = 1200 where key_hash = (select h from rate_key where k = 'ip:teste');
select is(public.check_guest_rates(array['ip:teste','token:teste','global']), false, 'IP acima do limite recusa');
select is(array[pg_temp.used('ip:teste'), pg_temp.used('token:teste'), pg_temp.used('global')], array[1201,1,1],
  'recusa pela cota de IP conta o IP e não consome as seguintes');

-- Cota da credencial esgotada: IP conta, global não.
update private.guest_rate set requests = 0 where key_hash = (select h from rate_key where k = 'ip:teste');
update private.guest_rate set requests = 120 where key_hash = (select h from rate_key where k = 'token:teste');
select is(public.check_guest_rates(array['ip:teste','token:teste','global']), false, 'credencial acima do limite recusa');
select is(array[pg_temp.used('ip:teste'), pg_temp.used('token:teste'), pg_temp.used('global')], array[1,121,1],
  'recusa pela credencial conta IP e credencial e não consome a global');

-- Mesmos limites da função existente.
update private.guest_rate set requests = 2399 where key_hash = (select h from rate_key where k = 'global');
update private.guest_rate set requests = 0 where key_hash = (select h from rate_key where k = 'token:teste');
select is(public.check_guest_rates(array['ip:teste','token:teste','global']), true, 'global no limite exato (2400) passa');
select is(public.check_guest_rates(array['ip:teste','token:teste','global']), false, 'global acima de 2400 recusa');

-- Entrada inválida não consome nada.
select throws_ok($$ select public.check_guest_rates(null) $$, '22023', 'INVALID_RATE_KEYS', 'lista nula recusada');
select throws_ok($$ select public.check_guest_rates(array[]::text[]) $$, '22023', 'INVALID_RATE_KEYS', 'lista vazia recusada');
select throws_ok($$ select public.check_guest_rates(array['ip:a', null]) $$, '22023', 'INVALID_RATE_KEYS', 'chave nula recusada');
select throws_ok($$ select public.check_guest_rates(array['a','b','c','d']) $$, '22023', 'INVALID_RATE_KEYS', 'mais de três chaves recusadas');

select * from finish();
rollback;
