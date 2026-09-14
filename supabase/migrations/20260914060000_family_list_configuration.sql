-- Defaults configuráveis pelo administrador, sem modificar migrations aplicadas.
create table private.family_list_defaults (
  diaper_size text primary key check(diaper_size in ('P','M','G','XG')),
  quantity integer not null check(quantity between 1 and 10000)
);
insert into private.family_list_defaults values ('P',6),('M',19),('G',19),('XG',6);
revoke all on private.family_list_defaults from public,anon,authenticated,service_role;
-- A bicondicional de diapers_and_treats já garante a mesma regra.
alter table public.event_items drop constraint treats_have_no_quota;
-- O UPDATE no-op fica somente no histórico imutável de migrations.
create or replace function public.prepare_family_list(p_event_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; amount integer; added integer := 0;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED' using errcode='22023'; end if;
  for p in select * from public.products where platform='manual' and external_reference like 'cha:%' and active order by id loop
    if exists(select 1 from public.event_items where event_id=e.id and
      (product_id=p.id or (p.diaper_size is not null and diaper_size=p.diaper_size))) then continue; end if;
    amount := null;
    if p.category='fralda' then
      select quantity into amount from private.family_list_defaults where diaper_size=p.diaper_size;
      if not found then raise exception 'DIAPER_DEFAULT_REQUIRED' using errcode='22023'; end if;
    end if;
    perform public.add_event_item(e.id,p.id,amount);
    added := added+1;
  end loop;
  return added;
end;
$$;
revoke all on function public.prepare_family_list(uuid) from public,anon,service_role;
grant execute on function public.prepare_family_list(uuid) to authenticated;

