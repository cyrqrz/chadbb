-- Etapas de configuração depois de publicar: convidados e presença, e lista de
-- presentes. O organizador marca cada uma como concluída; o front só lê as datas
-- para mostrar o que falta. Não há ordem obrigatória entre as duas.
alter table public.events
  add column guests_done_at timestamptz,
  add column gifts_done_at timestamptz;

-- Eventos que já estavam em uso não passam a mostrar pendência que não existe.
update public.events e set guests_done_at = now()
  where e.status <> 'draft' and exists(select 1 from private.invitations i where i.event_id = e.id);
update public.events e set gifts_done_at = now()
  where e.status <> 'draft' and exists(select 1 from public.event_items i where i.event_id = e.id);

create function public.set_event_step(p_event_id uuid, p_version integer, p_step text, p_done boolean)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  select * into result from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if p_step is null or p_step not in ('guests', 'gifts') or p_done is null then
    raise exception 'INVALID_PAYLOAD' using errcode = 'P0001';
  end if;
  if result.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if result.status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if result.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED' using errcode = 'P0001'; end if;
  if result.ends_at is not null and now() >= private.retention_due_at(result.ends_at) then
    raise exception 'EVENT_RETENTION_DUE' using errcode = 'P0001';
  end if;
  if p_version is distinct from result.version then raise exception 'VERSION_CONFLICT' using errcode = 'P0001'; end if;
  -- Marcar de novo mantém a data original; o trigger stamp_event avança a versão.
  if p_step = 'guests' then
    update public.events set guests_done_at = case when p_done then coalesce(guests_done_at, now()) end
      where id = p_event_id returning * into result;
  else
    update public.events set gifts_done_at = case when p_done then coalesce(gifts_done_at, now()) end
      where id = p_event_id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.set_event_step(uuid, integer, text, boolean) from public, anon;
grant execute on function public.set_event_step(uuid, integer, text, boolean) to authenticated;
