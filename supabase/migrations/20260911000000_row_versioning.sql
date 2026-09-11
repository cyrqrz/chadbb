-- Versão e updated_at deixam de depender do caminho de escrita. Antes, apenas
-- save_event/transition_event/set_event_item_quantity avançavam a versão: uma
-- correção administrativa direta mudava o dado sem mudar a versão, e a aba já
-- aberta salvava por cima sem receber VERSION_CONFLICT. Agora qualquer UPDATE
-- avança a versão, então a próxima chamada do organizador enxerga a alteração.
-- Consequência aceita: um backfill em massa invalida as abas abertas, que é o
-- comportamento correto quando o dado realmente mudou.
create function private.stamp_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
    or new.type is distinct from old.type or new.created_at is distinct from old.created_at then
    raise exception 'EVENT_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger stamp_event before update on public.events
  for each row execute function private.stamp_event();

create function private.stamp_event_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id
    or new.product_id is distinct from old.product_id or new.created_at is distinct from old.created_at then
    raise exception 'ITEM_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger stamp_event_item before update on public.event_items
  for each row execute function private.stamp_event_item();

-- O catálogo não tinha marca temporal: não havia como saber se a cópia lida pelo
-- navegador ainda corresponde ao produto revisado. A identidade continua imutável.
alter table public.products add column updated_at timestamptz not null default now();
create or replace function private.protect_product_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.platform is distinct from old.platform
    or new.external_reference is distinct from old.external_reference
    or new.created_at is distinct from old.created_at then
    raise exception 'PRODUCT_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Consulta real da lista: filtro por evento com ordenação estável e paginação.
-- O índice único (event_id, product_id) atendia o filtro, mas exigia ordenação.
create index event_items_event_created_idx on public.event_items (event_id, created_at, id);

-- Mesma regra já aplicada a event_items: o protocolo transacional não é
-- contornável pela chave de servidor, que também não avança versão de forma
-- auditável. Retenção e correção de dados exigirão função própria.
revoke insert, update, delete, truncate on public.events from service_role;
grant select on public.events to service_role;
