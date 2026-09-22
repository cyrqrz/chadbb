-- R2/R3: identidade de mimos consistente e mutações estruturais serializadas
-- por evento. Não altera migrations publicadas nem remove duplicatas existentes.
-- O lock exclusivo vem antes de produto/item; reservas e edições de quantidade
-- continuam seguindo evento → item → reserva e aguardam a transação curta.

-- Fonte única da identidade na inclusão: quando ao menos um item é mimo,
-- o título ignora maiúsculas e espaços externos. Fraldas entre si usam tamanho.
-- Excluir o próprio produto preserva o replay idempotente de add_event_item.
-- Chamadores devem bloquear o evento FOR UPDATE antes de consultar.
create function private.event_item_title_conflicts(
  p_event_id uuid, p_product_id uuid, p_title text, p_category text
) returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.event_items i join public.products p on p.id = i.product_id
    where i.event_id = p_event_id
      and i.product_id is distinct from p_product_id
      and (p_category = 'mimo' or i.category = 'mimo')
      and lower(btrim(p.title)) = lower(btrim(p_title))
  );
$$;
revoke all on function private.event_item_title_conflicts(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.add_event_item(p_event_id uuid, p_product_id uuid, p_quantity integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; product public.products; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  select * into product from public.products
    where id = p_product_id and active and (event_id is null or event_id = p_event_id) for share;
  if not found then raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001'; end if;
  if product.category = 'fralda' then
    if p_quantity is null then raise exception 'DIAPER_LIMIT_REQUIRED' using errcode = '22023'; end if;
    if p_quantity not between 1 and 10000 then raise exception 'INVALID_QUANTITY' using errcode = '22023'; end if;
  elsif p_quantity is not null then
    raise exception 'TREAT_HAS_NO_LIMIT' using errcode = '22023';
  end if;
  -- Duplicatas anteriores à correção não devem quebrar o replay de um item.
  if not exists (select 1 from public.event_items where event_id = p_event_id and product_id = product.id)
    and private.event_item_title_conflicts(p_event_id, product.id, product.title, product.category) then
    raise exception 'ITEM_ALREADY_EXISTS' using errcode = 'P0001';
  end if;
  begin
    insert into public.event_items(event_id, product_id, quantity_requested, category, diaper_size)
      values (p_event_id, p_product_id, p_quantity, product.category, product.diaper_size)
      on conflict do nothing returning * into result;
  exception when unique_violation then
    raise exception 'DIAPER_SIZE_ALREADY_LISTED' using errcode = 'P0001';
  end;
  if not found then
    select * into result from public.event_items where event_id = p_event_id and product_id = p_product_id for update;
    if not found then raise exception 'DIAPER_SIZE_ALREADY_LISTED' using errcode='P0001'; end if;
    if result.quantity_requested is distinct from p_quantity then raise exception 'ITEM_ALREADY_EXISTS' using errcode = 'P0001'; end if;
  end if;
  return result;
end;
$$;

create or replace function public.add_custom_treat(p_event_id uuid, p_title text, p_description text default '')
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; v_title text := btrim(coalesce(p_title, '')); v_product uuid; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if length(v_title) not between 1 and 160 or length(coalesce(p_description, '')) > 2000 then
    raise exception 'INVALID_TREAT' using errcode = '22023';
  end if;
  if private.event_item_title_conflicts(p_event_id, null, v_title, 'mimo') then
    raise exception 'ITEM_ALREADY_EXISTS' using errcode = 'P0001';
  end if;
  insert into public.products(title, description, platform, external_reference, category, event_id)
    values (v_title, btrim(coalesce(p_description, '')), 'manual', 'evento:' || p_event_id || ':' || gen_random_uuid(), 'mimo', p_event_id)
    returning id into v_product;
  insert into public.event_items(event_id, product_id, quantity_requested, category, diaper_size)
    values (p_event_id, v_product, null, 'mimo', null) returning * into result;
  return result;
end;
$$;

create or replace function public.remove_event_item(p_event_id uuid, p_item_id uuid, p_version integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  select * into result from public.event_items where id = p_item_id and event_id = p_event_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_version is distinct from result.version then raise exception 'ITEM_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  perform 1 from public.reservations where item_id = p_item_id order by id for update;
  if exists (select 1 from public.reservations where item_id = p_item_id and status <> 'cancelled') then
    raise exception 'ITEM_HAS_RESERVATIONS' using errcode = 'P0001';
  end if;
  delete from public.reservations where item_id = p_item_id;
  delete from public.event_items where id = p_item_id;
  delete from public.products where id = result.product_id and event_id = p_event_id;
  return result;
end;
$$;

-- Lista pronta preserva o homônimo existente e conta só inclusões efetivas.
create or replace function public.prepare_family_list(p_event_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; amount integer; added integer := 0;
begin
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
      select quantity into amount from private.family_list_defaults where diaper_size=p.diaper_size;
      if not found then raise exception 'DIAPER_DEFAULT_REQUIRED' using errcode='22023'; end if;
    end if;
    perform public.add_event_item(e.id,p.id,amount);
    added := added+1;
  end loop;
  return added;
end;
$$;
