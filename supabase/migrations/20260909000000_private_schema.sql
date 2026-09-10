-- Base sem entidades de domínio: elas entram com as próximas etapas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
-- EXECUTE para PUBLIC é um padrão global do PostgreSQL; revogação apenas
-- por schema não remove esse padrão global.
alter default privileges revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from anon, authenticated;
-- Novas funções públicas precisam conceder execução explicitamente.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
