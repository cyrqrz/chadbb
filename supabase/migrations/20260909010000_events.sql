create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  type text not null default 'baby_shower' check (type = 'baby_shower'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  title text not null default '' check (char_length(title) <= 120),
  public_description text not null default '' check (char_length(public_description) <= 2000),
  starts_at timestamptz,
  private_address text not null default '' check (char_length(private_address) <= 500),
  private_instructions text not null default '' check (char_length(private_instructions) <= 2000),
  cover_path text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or (length(btrim(title)) > 0 and starts_at is not null))
);
create index events_owner_created_idx on public.events (owner_id, created_at desc, id);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select on public.events to authenticated;
create policy owner_reads_events on public.events for select to authenticated
  using (owner_id = (select auth.uid()));

-- Todas as escritas passam pelas funções; identidade nunca vem do payload.
create function public.create_event(p_title text default '') returns public.events
language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into public.events(owner_id, title) values (auth.uid(), btrim(p_title)) returning * into result;
  return result;
end;
$$;

create function public.save_event(
  p_event_id uuid, p_version integer, p_title text, p_public_description text,
  p_starts_at timestamptz, p_private_address text, p_private_instructions text, p_cover_path text
) returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  select * into result from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if result.status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if p_version is distinct from result.version then raise exception 'VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if result.status = 'published' and (p_starts_at is null or p_starts_at <= now() or length(btrim(p_title)) = 0) then
    raise exception 'PUBLICATION_INVALID' using errcode = 'P0001';
  end if;
  if p_cover_path is not null and (
    p_cover_path not like auth.uid()::text || '/' || p_event_id::text || '/%'
    or not exists(select 1 from storage.objects where bucket_id = 'event-public' and name = p_cover_path)
  ) then raise exception 'INVALID_COVER' using errcode = '42501'; end if;
  update public.events set title = btrim(p_title), public_description = p_public_description,
    starts_at = p_starts_at, private_address = p_private_address, private_instructions = p_private_instructions,
    cover_path = p_cover_path, version = version + 1, updated_at = now()
    where id = p_event_id returning * into result;
  return result;
end;
$$;

create function public.transition_event(p_event_id uuid, p_version integer, p_status text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  -- Incompatível com FOR SHARE das futuras reservas. Ordem: evento → item → reserva.
  select * into result from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if p_version is distinct from result.version then raise exception 'VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if p_status is null or not ((result.status = 'draft' and p_status = 'published')
    or (result.status = 'published' and p_status = 'closed')) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'published' and (length(btrim(result.title)) = 0 or result.starts_at is null or result.starts_at <= now()) then
    raise exception 'PUBLICATION_INVALID' using errcode = 'P0001';
  end if;
  update public.events set status = p_status, version = version + 1, updated_at = now()
    where id = p_event_id returning * into result;
  return result;
end;
$$;
revoke all on function public.create_event(text) from public, anon;
revoke all on function public.save_event(uuid, integer, text, text, timestamptz, text, text, text) from public, anon;
revoke all on function public.transition_event(uuid, integer, text) from public, anon;
grant execute on function public.create_event(text) to authenticated;
grant execute on function public.save_event(uuid, integer, text, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.transition_event(uuid, integer, text) to authenticated;
