create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  platform text not null check (platform in ('amazon', 'mercado_livre', 'shopee', 'manual')),
  external_reference text not null check (length(btrim(external_reference)) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform, external_reference)
);
create index products_catalog_idx on public.products (active, title, id);
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  product_id uuid not null references public.products(id),
  quantity_requested integer not null check (quantity_requested between 1 and 10000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, product_id)
);
create index event_items_product_idx on public.event_items(product_id);
alter table public.products enable row level security;
alter table public.event_items enable row level security;
revoke all on public.products, public.event_items from public, anon, authenticated;
grant select on public.products, public.event_items to authenticated;
-- Manutenção de produtos é exclusivamente administrativa. Não há função pública de cadastro.
grant select, insert, update, delete on public.products to service_role;
-- Item não admite escrita direta nem com chave de servidor: preserva o protocolo.
revoke insert, update, delete, truncate on public.event_items from service_role;
grant select on public.event_items to service_role;
create policy owner_reads_event_items on public.event_items for select to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
);
create policy organizer_reads_products on public.products for select to authenticated using (
  active or exists (select 1 from public.event_items i where i.product_id = products.id)
);

-- Links não aprovados não ficam nas tabelas/projeções disponíveis ao navegador.
create table private.partner_hosts (
  platform text not null check (platform in ('amazon', 'mercado_livre', 'shopee')),
  hostname text not null check (hostname = lower(hostname) and hostname ~ '^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$'),
  approval_reference text not null check (length(btrim(approval_reference)) > 0),
  primary key (platform, hostname)
);
create table private.product_links (
  product_id uuid primary key references public.products(id),
  url text not null check (length(url) <= 2048),
  approval_reference text not null check (length(btrim(approval_reference)) > 0)
);
revoke all on private.partner_hosts, private.product_links from public, anon, authenticated, service_role;

create function private.validate_product_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare host text; partner text;
begin
  -- Autoridade exata, sem userinfo, porta, escapes, fragmentos ou caracteres de controle.
  if new.url !~ '^https://' or new.url ~ '[[:space:]\\#<>"'']' then
    raise exception 'INVALID_PRODUCT_URL' using errcode = '23514';
  end if;
  host := substring(new.url from '^https://([^/?#]+)');
  if host is null or host !~ '^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$' then
    raise exception 'INVALID_PRODUCT_URL' using errcode = '23514';
  end if;
  select platform into partner from public.products where id = new.product_id;
  if not exists (select 1 from private.partner_hosts h where h.platform = partner and h.hostname = host) then
    raise exception 'PARTNER_NOT_APPROVED' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_product_link before insert or update on private.product_links
  for each row execute function private.validate_product_link();

-- Etapa 5 substituirá esta função, na mesma migration que introduzir reservations.
-- Falha fechada se uma tabela de reservas aparecer sem integrar a contagem.
create function private.committed_quantity(p_item_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if to_regclass('public.reservations') is not null then
    raise exception 'RESERVATION_INTEGRATION_REQUIRED' using errcode = 'P0001';
  end if;
  return 0;
end;
$$;
revoke all on function private.committed_quantity(uuid) from public, anon, authenticated, service_role;

create function public.add_event_item(p_event_id uuid, p_product_id uuid, p_quantity integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; result public.event_items;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if p_quantity is null or p_quantity not between 1 and 10000 then raise exception 'INVALID_QUANTITY' using errcode = '22023'; end if;
  perform 1 from public.products where id = p_product_id and active for share;
  if not found then raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001'; end if;
  insert into public.event_items(event_id, product_id, quantity_requested) values (p_event_id, p_product_id, p_quantity)
    on conflict(event_id, product_id) do nothing returning * into result;
  if not found then
    select * into result from public.event_items where event_id = p_event_id and product_id = p_product_id for update;
    if result.quantity_requested <> p_quantity then raise exception 'ITEM_ALREADY_EXISTS' using errcode = 'P0001'; end if;
  end if;
  return result;
end;
$$;

create function public.set_event_item_quantity(p_event_id uuid, p_item_id uuid, p_version integer, p_quantity integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; result public.event_items; committed bigint;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  select * into result from public.event_items where id = p_item_id and event_id = p_event_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = '42501'; end if;
  if p_version is distinct from result.version then raise exception 'ITEM_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if p_quantity is null or p_quantity not between 1 and 10000 then raise exception 'INVALID_QUANTITY' using errcode = '22023'; end if;
  committed := private.committed_quantity(result.id);
  if p_quantity < committed then raise exception 'QUANTITY_BELOW_COMMITTED' using errcode = 'P0001'; end if;
  update public.event_items set quantity_requested = p_quantity, version = version + 1, updated_at = now()
    where id = result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.add_event_item(uuid, uuid, integer) from public, anon, service_role;
revoke all on function public.set_event_item_quantity(uuid, uuid, integer, integer) from public, anon, service_role;
grant execute on function public.add_event_item(uuid, uuid, integer) to authenticated;
grant execute on function public.set_event_item_quantity(uuid, uuid, integer, integer) to authenticated;

-- A referência e a plataforma identificam o produto e não podem mudar depois do cadastro.
create function private.protect_product_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.platform is distinct from old.platform or new.external_reference is distinct from old.external_reference then
    raise exception 'PRODUCT_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger protect_product_identity before update on public.products
  for each row execute function private.protect_product_identity();
