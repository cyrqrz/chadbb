begin;
select plan(4);
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon sem acesso ao schema privado');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated sem acesso ao schema privado');
create function public.test_default_privileges() returns integer language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public.test_default_privileges()', 'execute'), 'novas funções sem execução anon por padrão');
select ok(not has_function_privilege('authenticated', 'public.test_default_privileges()', 'execute'), 'novas funções sem execução authenticated por padrão');
select * from finish();
rollback;
