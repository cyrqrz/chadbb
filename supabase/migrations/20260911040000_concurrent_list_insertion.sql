-- Tratar simultaneamente unicidade por produto e por tamanho.
create or replace function public.add_event_item(p_event_id uuid, p_product_id uuid, p_quantity integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; product public.products; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  select * into product from public.products where id = p_product_id and active for share;
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
    -- Outro produto já ocupa este tamanho no evento: o saldo do tamanho é único.
    raise exception 'DIAPER_SIZE_ALREADY_LISTED' using errcode = 'P0001';
  end;
  if not found then
    select * into result from public.event_items where event_id = p_event_id and product_id = p_product_id for update;
    if not found then raise exception 'DIAPER_SIZE_ALREADY_LISTED' using errcode='P0001'; end if;
    -- `is distinct from` porque repetir a inclusão sem limite tem NULL dos dois lados.
    if result.quantity_requested is distinct from p_quantity then raise exception 'ITEM_ALREADY_EXISTS' using errcode = 'P0001'; end if;
  end if;
  return result;
end;
$$;

