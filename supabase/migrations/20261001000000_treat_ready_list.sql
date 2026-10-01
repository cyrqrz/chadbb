-- Lista pronta só de mimos (decisão do titular em 01/10): as fraldas o organizador
-- escolhe do zero, tamanho por tamanho, pelo catálogo. `prepare_family_list` fica
-- como está para scripts e testes que preparam a lista completa.
create function public.prepare_treat_list(p_event_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; added integer := 0;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode='P0001'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED' using errcode='22023'; end if;
  for p in select * from public.products where platform='manual' and external_reference like 'cha:%' and category='mimo' and active and event_id is null order by id loop
    if exists(select 1 from public.event_items where event_id=e.id and product_id=p.id) then continue; end if;
    if private.event_item_title_conflicts(e.id, p.id, p.title, p.category) then continue; end if;
    perform public.add_event_item(e.id,p.id,null);
    added := added+1;
  end loop;
  return added;
end;
$$;
revoke all on function public.prepare_treat_list(uuid) from public,anon,service_role;
grant execute on function public.prepare_treat_list(uuid) to authenticated;
