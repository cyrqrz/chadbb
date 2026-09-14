-- Escopo confirmado em docs/FRALDAS-E-MIMOS.md: presença, fraldas por tamanho e
-- mimos. Categoria vem do cadastro, nunca do nome: "Toalha fralda" e "Fraldas de
-- boca" são mimos. O padrão existe apenas para classificar as linhas já criadas.
alter table public.products
  add column category text not null default 'mimo' check (category in ('fralda', 'mimo')),
  add column diaper_size text check (diaper_size in ('P', 'M', 'G', 'XG'));
alter table public.products alter column category drop default;
alter table public.products add constraint products_size_matches_category
  check ((category = 'fralda') = (diaper_size is not null));

-- Categoria e tamanho são copiados para o item na inclusão. A cópia não desvia
-- porque os dois lados são imutáveis, e torna o limite por evento/tamanho uma
-- restrição declarativa: dois itens "P" no mesmo evento criariam dois saldos
-- independentes e o limite de 6 pacotes deixaria de valer.
alter table public.event_items
  add column category text not null default 'mimo' check (category in ('fralda', 'mimo')),
  add column diaper_size text check (diaper_size in ('P', 'M', 'G', 'XG'));
alter table public.event_items alter column category drop default;
alter table public.event_items add constraint event_items_size_matches_category
  check ((category = 'fralda') = (diaper_size is not null));
-- NULL não conflita com NULL: vários mimos convivem no mesmo evento.
create unique index event_items_event_size_idx on public.event_items (event_id, diaper_size);

-- Decisão revisada em docs/FRALDAS-E-MIMOS.md: mimos não têm limite nenhum, nem
-- por convite nem no total; fraldas sempre têm limite por tamanho. Ausência de
-- limite é NULL, nunca zero nem número artificialmente alto. A bicondicional
-- impede que um número entre num mimo e vire cota fantasma esgotando o item.
alter table public.event_items alter column quantity_requested drop not null;
alter table public.event_items add constraint event_items_limit_matches_category
  check ((category = 'fralda') = (quantity_requested is not null));
comment on column public.event_items.quantity_requested is
  'Limite total de pacotes, obrigatório nas fraldas. Sempre NULL nos mimos: eles não têm limite.';
comment on column public.products.category is
  'fralda ou mimo. Explícito no cadastro; jamais inferido pelo título.';
comment on column public.products.diaper_size is
  'P, M, G ou XG nas fraldas; NULL nos mimos. Imutável depois do cadastro.';

-- Categoria e tamanho entram na identidade imutável: alterá-los transferiria
-- saldos entre tamanhos ou entre categorias sem passar por reserva nenhuma.
create or replace function private.protect_product_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.platform is distinct from old.platform
    or new.external_reference is distinct from old.external_reference
    or new.created_at is distinct from old.created_at
    or new.category is distinct from old.category
    or new.diaper_size is distinct from old.diaper_size then
    raise exception 'PRODUCT_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.stamp_event_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id
    or new.product_id is distinct from old.product_id or new.created_at is distinct from old.created_at
    or new.category is distinct from old.category or new.diaper_size is distinct from old.diaper_size then
    raise exception 'ITEM_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- p_quantity nulo passa a significar "sem limite definido". Continua recusado nas
-- fraldas, cujo limite por tamanho é a regra central do evento. O teto de 10000 é
-- limite técnico de entrada, não limite comercial por convite.
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
      on conflict(event_id, product_id) do nothing returning * into result;
  exception when unique_violation then
    -- ON CONFLICT só arbitra o par evento/produto. O índice de tamanho levanta
    -- violação por conta própria, inclusive quando duas inclusões concorrentes do
    -- MESMO produto disputam o tamanho. Quem é quem se decide na leitura abaixo.
    result := null;
  end;
  if result.id is null then
    select * into result from public.event_items where event_id = p_event_id and product_id = p_product_id for update;
    -- Sem linha para este produto, o conflito foi de tamanho: outro produto já
    -- ocupa o tamanho no evento e dois saldos para o mesmo limite não podem existir.
    if not found then raise exception 'DIAPER_SIZE_ALREADY_LISTED' using errcode = 'P0001'; end if;
    -- `is distinct from` porque repetir a inclusão sem limite tem NULL dos dois lados.
    if result.quantity_requested is distinct from p_quantity then raise exception 'ITEM_ALREADY_EXISTS' using errcode = 'P0001'; end if;
  end if;
  return result;
end;
$$;

create or replace function public.set_event_item_quantity(p_event_id uuid, p_item_id uuid, p_version integer, p_quantity integer)
returns public.event_items language plpgsql security definer set search_path = '' as $$
declare event_status text; result public.event_items; committed bigint;
begin
  select status into event_status from public.events where id = p_event_id and owner_id = auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if event_status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  select * into result from public.event_items where id = p_item_id and event_id = p_event_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = '42501'; end if;
  if p_version is distinct from result.version then raise exception 'ITEM_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if result.category = 'fralda' then
    if p_quantity is null then raise exception 'DIAPER_LIMIT_REQUIRED' using errcode = '22023'; end if;
    if p_quantity not between 1 and 10000 then raise exception 'INVALID_QUANTITY' using errcode = '22023'; end if;
  elsif p_quantity is not null then
    -- Mimo não recebe número: um limite aqui apareceria como "esgotado" ao convidado.
    raise exception 'TREAT_HAS_NO_LIMIT' using errcode = '22023';
  end if;
  committed := private.committed_quantity(result.id);
  if p_quantity is not null and p_quantity < committed then
    raise exception 'QUANTITY_BELOW_COMMITTED' using errcode = 'P0001';
  end if;
  update public.event_items set quantity_requested = p_quantity, version = version + 1, updated_at = now()
    where id = result.id returning * into result;
  return result;
end;
$$;
