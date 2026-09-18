-- Lista de presentes editável pelo organizador: remover itens sem reserva ativa e
-- criar mimos próprios (só nome e descrição), que valem apenas para o evento.

-- Mimo próprio é um produto `manual` preso ao evento: a tela do convidado e o painel
-- continuam lendo título e descrição pelo produto, sem caminho novo. Some com o evento.
alter table public.products add column event_id uuid references public.events(id) on delete cascade;
create index products_event_idx on public.products (event_id) where event_id is not null;
alter table public.products add constraint products_event_is_treat
  check (event_id is null or (category = 'mimo' and platform = 'manual'));
comment on column public.products.event_id is
  'Preenchido só nos mimos criados pelo organizador: o produto pertence a este evento e não entra no catálogo.';

-- Mimo próprio só é visível ao dono do evento; o catálogo continua como antes.
drop policy organizer_reads_products on public.products;
create policy organizer_reads_products on public.products for select to authenticated using (
  (event_id is null and (active or exists (select 1 from public.event_items i where i.product_id = products.id)))
  or exists (select 1 from public.events e where e.id = products.event_id and e.owner_id = (select auth.uid()))
);

-- Igual à versão de 20260911040000, mais a recusa de produto preso a outro evento.
create or replace function public.add_event_item(p_event_id uuid, p_product_id uuid, p_quantity integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; product public.products; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for share;
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

-- Nome repetido na lista do evento (sem diferença de maiúsculas e espaços) é recusado,
-- seja de outro mimo próprio ou de um item do catálogo já incluído: o convidado não
-- vê dois presentes iguais. Cobre também o clique duplo.
create function public.add_custom_treat(p_event_id uuid, p_title text, p_description text default '')
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; v_title text := btrim(coalesce(p_title, '')); v_product uuid; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if length(v_title) not between 1 and 160 or length(coalesce(p_description, '')) > 2000 then
    raise exception 'INVALID_TREAT' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_items i join public.products p on p.id = i.product_id
    where i.event_id = p_event_id and lower(p.title) = lower(v_title)) then
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

-- Ordem global: evento → item → reserva. Item com reserva ativa não sai: um
-- convidado já escolheu. Reservas canceladas do item são apagadas junto; o mimo
-- próprio também, porque só existia para esta lista.
create function public.remove_event_item(p_event_id uuid, p_item_id uuid, p_version integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for share;
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

revoke all on function public.add_custom_treat(uuid, text, text) from public, anon, service_role;
revoke all on function public.remove_event_item(uuid, uuid, integer) from public, anon, service_role;
grant execute on function public.add_custom_treat(uuid, text, text) to authenticated;
grant execute on function public.remove_event_item(uuid, uuid, integer) to authenticated;
