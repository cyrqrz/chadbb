-- Corrige corrida da prévia: a arte desenhada com um snapshot antigo não pode
-- substituir a de um evento já atualizado. O registro exige a versão do snapshot
-- e a confere sob o lock do evento.
drop function public.set_event_preview(uuid, text);
create function public.set_event_preview(p_event_id uuid, p_path text, p_version integer) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.events; old text;
begin
  select * into e from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if e.status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = '22023'; end if;
  if p_version is null or p_version is distinct from e.version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if p_path is null or p_path not like e.owner_id::text || '/' || e.id::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'event-public' and name = p_path) then
    raise exception 'INVALID_PREVIEW' using errcode = '22023';
  end if;
  select image_path into old from public.event_previews where event_id = e.id;
  insert into public.event_previews(event_id, image_path) values (e.id, p_path)
  on conflict (event_id) do update set image_path = excluded.image_path, updated_at = now();
  return old;
end;
$$;
revoke all on function public.set_event_preview(uuid, text, integer) from public, anon, service_role;
grant execute on function public.set_event_preview(uuid, text, integer) to authenticated;
