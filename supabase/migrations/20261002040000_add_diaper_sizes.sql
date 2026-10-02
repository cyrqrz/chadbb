-- Atalho "Adicionar todos os tamanhos" (pedido do titular em 02/10): inclui de uma vez
-- os tamanhos de fralda pedidos, cada um com os pacotes informados na própria linha.
-- Tudo ou nada: qualquer recusa desfaz a chamada inteira. `prepare_family_list` não
-- serve porque inclui também os mimos sugeridos.
create function public.add_diaper_sizes(p_event_id uuid, p_diapers jsonb) returns text[]
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; v_size text; added text[] := '{}';
begin
  -- Pacotes conferidos antes de qualquer bloqueio ou escrita, com a regra de prepare_family_list.
  -- Sem padrão para tamanho omitido: entra só o que a tela mandou.
  if p_diapers is null or jsonb_typeof(p_diapers) <> 'object' or p_diapers = '{}'::jsonb
    or exists (
      select 1 from jsonb_each(p_diapers) x
      where x.key not in ('P','M','G','XG')
        or jsonb_typeof(x.value) <> 'number'
        or not case when x.value::text ~ '^[0-9]{1,5}$' then (x.value::text)::integer between 1 and 10000 else false end
    ) then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  -- Evento FOR UPDATE antes de produto e item, como nas outras mudanças estruturais da lista.
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode='P0001'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED' using errcode='22023'; end if;
  -- Ordem fixa: os produtos são bloqueados sempre na mesma sequência.
  foreach v_size in array array['P','M','G','XG'] loop
    continue when not (p_diapers ? v_size);
    -- Tamanho já na lista fica como está: não soma nem troca a quantidade.
    continue when exists(select 1 from public.event_items where event_id=e.id and diaper_size=v_size);
    select * into p from public.products
      where category='fralda' and diaper_size=v_size and active and event_id is null
      order by (platform='manual' and external_reference like 'cha:%') desc, id limit 1;
    if not found then raise exception 'PRODUCT_UNAVAILABLE' using errcode='P0001'; end if;
    -- add_event_item repete as validações e recusa homônimo com mimo (ITEM_ALREADY_EXISTS).
    perform public.add_event_item(e.id, p.id, (p_diapers ->> v_size)::integer);
    added := added || v_size;
  end loop;
  return added;
end;
$$;
revoke all on function public.add_diaper_sizes(uuid,jsonb) from public,anon,service_role;
grant execute on function public.add_diaper_sizes(uuid,jsonb) to authenticated;
