-- Término explícito: a retenção de dados pessoais conta a partir dele.
alter table public.events add column ends_at timestamptz;
alter table public.events add column personal_data_purged_at timestamptz;
alter table public.events add constraint events_ends_after_start check (ends_at is null or ends_at > starts_at);
alter table public.events add constraint events_published_have_end check (status = 'draft' or ends_at is not null);

drop function public.save_event(uuid, integer, text, text, timestamptz, text, text, text);
create function public.save_event(
  p_event_id uuid, p_version integer, p_title text, p_public_description text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_private_address text, p_private_instructions text, p_cover_path text
) returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  select * into result from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if result.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if result.status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if p_version is distinct from result.version then raise exception 'VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if p_ends_at is not null and (p_starts_at is null or p_ends_at <= p_starts_at) then
    raise exception 'EVENT_ENDS_BEFORE_START' using errcode = 'P0001';
  end if;
  if result.status = 'published' and (p_starts_at is null or p_starts_at <= now() or p_ends_at is null or length(btrim(p_title)) = 0) then
    raise exception 'PUBLICATION_INVALID' using errcode = 'P0001';
  end if;
  if p_cover_path is not null and (
    p_cover_path not like auth.uid()::text || '/' || p_event_id::text || '/%'
    or not exists(select 1 from storage.objects where bucket_id = 'event-public' and name = p_cover_path)
  ) then raise exception 'INVALID_COVER' using errcode = '42501'; end if;
  update public.events set title = btrim(p_title), public_description = p_public_description,
    starts_at = p_starts_at, ends_at = p_ends_at, private_address = p_private_address,
    private_instructions = p_private_instructions, cover_path = p_cover_path
    where id = p_event_id returning * into result;
  return result;
end;
$$;

create or replace function public.transition_event(p_event_id uuid, p_version integer, p_status text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  -- Incompatível com FOR SHARE das reservas. Ordem: evento → item → reserva.
  select * into result from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if result.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if p_version is distinct from result.version then raise exception 'VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if p_status is null or not ((result.status = 'draft' and p_status = 'published')
    or (result.status = 'published' and p_status = 'closed')) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'published' and (length(btrim(result.title)) = 0 or result.starts_at is null
    or result.starts_at <= now() or result.ends_at is null) then
    raise exception 'PUBLICATION_INVALID' using errcode = 'P0001';
  end if;
  update public.events set status = p_status where id = p_event_id returning * into result;
  return result;
end;
$$;
revoke all on function public.save_event(uuid, integer, text, text, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.save_event(uuid, integer, text, text, timestamptz, timestamptz, text, text, text) to authenticated;
