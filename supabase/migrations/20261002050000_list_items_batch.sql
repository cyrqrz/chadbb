-- Inclusão e remoção em lote na lista de presentes (pedidos do titular em 02/10): seleção de
-- várias sugestões ou itens, e o atalho "Adicionar todos os tamanhos". Tudo ou nada.
-- add_diaper_sizes (20261002040000, por tamanho) só existiu no Supabase local: a inclusão
-- por produto a substitui, para a tela enviar exatamente as linhas que mostra.
drop function public.add_diaper_sizes(uuid, jsonb);

create function public.add_event_items(p_event_id uuid, p_items jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare e public.events; r record; p public.products; sizes text[] := '{}'; added uuid[] := '{}';
begin
  -- Formato e quantidades conferidos antes de qualquer bloqueio ou escrita.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  -- Objeto primeiro, em comando separado: jsonb_object_keys falha num escalar.
  if jsonb_array_length(p_items) not between 1 and 200
    or exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) <> 'object')
  then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x->'product_id') is distinct from 'string'
      or (x->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or exists (select 1 from jsonb_object_keys(x) k where k not in ('product_id','quantity'))
  ) or (select count(distinct lower(x->>'product_id')) from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items)
  then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(jsonb_typeof(x->'quantity'), 'null') <> 'null'
      and (jsonb_typeof(x->'quantity') <> 'number'
        or not case when (x->'quantity')::text ~ '^[0-9]{1,5}$' then ((x->'quantity')::text)::integer between 1 and 10000 else false end)
  ) then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  -- Evento FOR UPDATE antes de produto e item, como nas outras mudanças estruturais da lista.
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode='P0001'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED' using errcode='22023'; end if;
  -- Produtos em ordem de id: dois lotes nunca se bloqueiam em ordem inversa.
  for r in select (x->>'product_id')::uuid as product_id,
      case when coalesce(jsonb_typeof(x->'quantity'), 'null') = 'null' then null else ((x->'quantity')::text)::integer end as quantity
    from jsonb_array_elements(p_items) x order by 1 loop
    select * into p from public.products where id=r.product_id and active and (event_id is null or event_id=e.id) for share;
    if not found then raise exception 'PRODUCT_UNAVAILABLE' using errcode='P0001'; end if;
    -- Mesmo já listado, o produto precisa receber uma quantidade válida para a categoria.
    if p.category = 'fralda' and r.quantity is null then
      raise exception 'DIAPER_LIMIT_REQUIRED' using errcode='22023';
    elsif p.category = 'mimo' and r.quantity is not null then
      raise exception 'TREAT_HAS_NO_LIMIT' using errcode='22023';
    end if;
    -- Dois produtos do mesmo tamanho no lote: o segundo seria pulado sem aviso.
    if p.diaper_size is not null and p.diaper_size = any(sizes) then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
    if p.diaper_size is not null then sizes := sizes || p.diaper_size; end if;
    -- Já na lista (o produto ou o tamanho): fica como está, sem somar nem trocar a quantidade.
    continue when exists(select 1 from public.event_items where event_id=e.id
      and (product_id=p.id or (p.diaper_size is not null and diaper_size=p.diaper_size)));
    -- add_event_item repete as validações: categoria, quantidade e homônimo com mimo.
    perform public.add_event_item(e.id, p.id, r.quantity);
    added := added || p.id;
  end loop;
  return added;
end;
$$;
revoke all on function public.add_event_items(uuid,jsonb) from public,anon,service_role;
grant execute on function public.add_event_items(uuid,jsonb) to authenticated;

create function public.remove_event_items(p_event_id uuid, p_items jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare event_status text; r record; it public.event_items; present uuid[] := '{}'; versions integer[] := '{}'; blocked text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  -- Objeto primeiro, em comando separado: jsonb_object_keys falha num escalar.
  if jsonb_array_length(p_items) not between 1 and 200
    or exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) <> 'object')
  then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x->'id') is distinct from 'string'
      or (x->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(x->'version') is distinct from 'number' or (x->'version')::text !~ '^[0-9]{1,9}$'
      or exists (select 1 from jsonb_object_keys(x) k where k not in ('id','version'))
  ) or (select count(distinct lower(x->>'id')) from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items)
  then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  -- Mesma ordem de remove_event_item: evento → itens (por id) → reservas.
  select status into event_status from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if event_status='closed' then raise exception 'EVENT_CLOSED' using errcode='P0001'; end if;
  for r in select (x->>'id')::uuid as id, ((x->'version')::text)::integer as version from jsonb_array_elements(p_items) x order by 1 loop
    select * into it from public.event_items where id=r.id and event_id=p_event_id for update;
    -- Removido em outra aba: o resultado já é o que a pessoa pediu.
    continue when not found;
    if it.version <> r.version then raise exception 'ITEM_VERSION_CONFLICT' using errcode='P0001', detail=it.id::text; end if;
    present := present || it.id; versions := versions || r.version;
  end loop;
  perform 1 from public.reservations where item_id = any(present) order by id for update;
  -- Com reserva ativa, nada sai; o detalhe diz quais itens, para a tela nomear.
  select string_agg(distinct item_id::text, ',') into blocked from public.reservations where item_id = any(present) and status <> 'cancelled';
  if blocked is not null then raise exception 'ITEM_HAS_RESERVATIONS' using errcode='P0001', detail=blocked; end if;
  for i in 1 .. coalesce(array_length(present, 1), 0) loop
    perform public.remove_event_item(p_event_id, present[i], versions[i]);
  end loop;
  return present;
end;
$$;
revoke all on function public.remove_event_items(uuid,jsonb) from public,anon,service_role;
grant execute on function public.remove_event_items(uuid,jsonb) to authenticated;
