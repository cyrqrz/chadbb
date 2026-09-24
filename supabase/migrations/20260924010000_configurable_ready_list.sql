-- Lista pronta ajustável por evento: o organizador escolhe os pacotes por
-- tamanho ao preparar a lista. Tamanho omitido usa o padrão sugerido.
-- Chamada antiga (só p_event_id) continua válida pelo default de p_diapers.
drop function public.prepare_family_list(uuid);

create function public.prepare_family_list(p_event_id uuid, p_diapers jsonb default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; amount integer; added integer := 0;
begin
  if p_diapers is not null and (
    jsonb_typeof(p_diapers) <> 'object'
    or exists (
      select 1 from jsonb_each(p_diapers) x
      where x.key not in ('P','M','G','XG')
        or jsonb_typeof(x.value) <> 'number'
        or not case when x.value::text ~ '^[0-9]{1,5}$' then (x.value::text)::integer between 1 and 10000 else false end
    )
  ) then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode='P0001'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED' using errcode='22023'; end if;
  for p in select * from public.products where platform='manual' and external_reference like 'cha:%' and active and event_id is null order by id loop
    if exists(select 1 from public.event_items where event_id=e.id and
      (product_id=p.id or (p.diaper_size is not null and diaper_size=p.diaper_size))) then continue; end if;
    if private.event_item_title_conflicts(e.id, p.id, p.title, p.category) then continue; end if;
    amount := null;
    if p.category='fralda' then
      amount := (p_diapers ->> p.diaper_size)::integer;
      if amount is null then
        select quantity into amount from private.family_list_defaults where diaper_size=p.diaper_size;
        if not found then raise exception 'DIAPER_DEFAULT_REQUIRED' using errcode='22023'; end if;
      end if;
    end if;
    perform public.add_event_item(e.id,p.id,amount);
    added := added+1;
  end loop;
  return added;
end;
$$;
revoke all on function public.prepare_family_list(uuid,jsonb) from public,anon,service_role;
grant execute on function public.prepare_family_list(uuid,jsonb) to authenticated;

-- Padrões sugeridos, para a tela não repetir os números do servidor.
create function public.family_list_defaults() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(diaper_size, quantity), '{}'::jsonb) from private.family_list_defaults
$$;
revoke all on function public.family_list_defaults() from public,anon,service_role;
grant execute on function public.family_list_defaults() to authenticated;
