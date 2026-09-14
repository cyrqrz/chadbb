-- Política aprovada: 30 dias após o término, hard delete dos dados pessoais dos
-- convidados e dos dados privados do evento. A auditoria prova que a limpeza
-- ocorreu; não guarda nenhuma versão dos dados eliminados.

-- Fonte única do prazo, em dias de calendário no fuso do evento.
create function private.retention_due_at(p_ends_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_ends_at at time zone 'America/Sao_Paulo') + interval '30 days') at time zone 'America/Sao_Paulo'
$$;

create table private.retention_audit (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  ran_at timestamptz not null default now(),
  status text not null check (status in ('purged', 'already_purged', 'storage_failed', 'db_failed', 'invitation_erased')),
  invitations_removed integer,
  guest_requests_removed integer,
  reservations_removed integer,
  guest_sessions_removed integer,
  storage_objects_removed integer
);
revoke all on private.retention_audit from public, anon, authenticated, service_role;

create function private.purge_event_personal_data(p_event_id uuid, p_storage_removed integer default null)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.events; n_requests integer; n_reservations integer; n_sessions integer; n_invitations integer;
begin
  select * into e from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if e.personal_data_purged_at is not null then
    insert into private.retention_audit(event_id, status, storage_objects_removed) values (e.id, 'already_purged', p_storage_removed);
    return 'already_purged';
  end if;
  if e.ends_at is null or now() < private.retention_due_at(e.ends_at) then return 'not_due'; end if;
  -- reservations e guest_requests não têm cascade; sessões são removidas explicitamente para contagem.
  delete from private.guest_requests r using private.invitations i where r.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_requests = row_count;
  delete from public.reservations r using private.invitations i where r.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_reservations = row_count;
  delete from private.guest_sessions s using private.invitations i where s.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_sessions = row_count;
  delete from private.invitations where event_id = e.id;
  get diagnostics n_invitations = row_count;
  update public.events set private_address = '', private_instructions = '', cover_path = null where id = e.id;
  -- A marca vem por último: só existe se todas as exclusões acima concluíram.
  update public.events set personal_data_purged_at = now() where id = e.id;
  insert into private.retention_audit(event_id, status, invitations_removed, guest_requests_removed,
    reservations_removed, guest_sessions_removed, storage_objects_removed)
    values (e.id, 'purged', n_invitations, n_requests, n_reservations, n_sessions, p_storage_removed);
  return 'purged';
end;
$$;

-- Pedido do titular (LGPD): mesma ordem de exclusão, limitada a um convite.
create function private.erase_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; n_requests integer; n_reservations integer; n_sessions integer;
begin
  select event_id into v_event from private.invitations where id = p_invitation_id;
  if not found then raise exception 'INVITATION_NOT_FOUND' using errcode = '42501'; end if;
  perform 1 from public.events where id = v_event for update;
  perform 1 from private.invitations where id = p_invitation_id for update;
  delete from private.guest_requests where invitation_id = p_invitation_id;
  get diagnostics n_requests = row_count;
  delete from public.reservations where invitation_id = p_invitation_id;
  get diagnostics n_reservations = row_count;
  delete from private.guest_sessions where invitation_id = p_invitation_id;
  get diagnostics n_sessions = row_count;
  delete from private.invitations where id = p_invitation_id;
  insert into private.retention_audit(event_id, status, invitations_removed, guest_requests_removed,
    reservations_removed, guest_sessions_removed) values (v_event, 'invitation_erased', 1, n_requests, n_reservations, n_sessions);
end;
$$;

-- Substitui o expurgo de 90 dias: pedidos saem apenas com o evento.
create function private.cleanup_guest_technical() returns void
language sql security definer set search_path = '' as $$
  delete from private.guest_sessions where expires_at <= now();
  delete from private.guest_rate where window_start < now() - interval '5 minutes';
$$;

-- Chamado pelo cron. Sem URL ou segredo no Vault, não faz nada.
create function private.invoke_retention() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'retention_cron_secret';
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(url := v_url || '/functions/v1/retention',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-retention-secret', v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
end;
$$;

revoke all on function private.retention_due_at(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.purge_event_personal_data(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.erase_invitation(uuid) from public, anon, authenticated, service_role;
revoke all on function private.cleanup_guest_technical() from public, anon, authenticated, service_role;
revoke all on function private.invoke_retention() from public, anon, authenticated, service_role;

-- Superfície da Edge Function retention: somente service_role.
create function public.retention_run() returns table(event_id uuid, owner_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cleanup_guest_technical();
  return query select e.id, e.owner_id from public.events e
    where e.personal_data_purged_at is null and e.ends_at is not null and now() >= private.retention_due_at(e.ends_at)
    order by e.ends_at, e.id;
end;
$$;
create function public.retention_referenced_paths(p_event_id uuid, p_paths text[]) returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct e.cover_path from public.events e
  where e.id <> p_event_id and e.cover_path = any(p_paths)
$$;
create function public.retention_purge_event(p_event_id uuid, p_storage_removed integer) returns text
language sql security definer set search_path = '' as $$
  select private.purge_event_personal_data(p_event_id, p_storage_removed)
$$;
create function public.retention_record_failure(p_event_id uuid, p_status text, p_storage_removed integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status is null or p_status not in ('storage_failed', 'db_failed') then
    raise exception 'INVALID_RETENTION_STATUS' using errcode = '22023';
  end if;
  insert into private.retention_audit(event_id, status, storage_objects_removed) values (p_event_id, p_status, p_storage_removed);
end;
$$;
revoke all on function public.retention_run() from public, anon, authenticated;
revoke all on function public.retention_referenced_paths(uuid, text[]) from public, anon, authenticated;
revoke all on function public.retention_purge_event(uuid, integer) from public, anon, authenticated;
revoke all on function public.retention_record_failure(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.retention_run() to service_role;
grant execute on function public.retention_referenced_paths(uuid, text[]) to service_role;
grant execute on function public.retention_purge_event(uuid, integer) to service_role;
grant execute on function public.retention_record_failure(uuid, text, integer) to service_role;

-- Um único mecanismo agendado. O PostgreSQL portátil não tem pg_cron/pg_net.
do $$ begin
  if exists(select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists(select 1 from cron.job where jobname = 'guest-data-retention') then
      perform cron.unschedule('guest-data-retention');
    end if;
    if exists(select 1 from pg_available_extensions where name = 'pg_net') then
      create extension if not exists pg_net;
      -- pg_cron usa UTC: 06:17 UTC = 03:17 em Brasília.
      perform cron.schedule('personal-data-retention', '17 6 * * *', 'select private.invoke_retention()');
    end if;
  end if;
end $$;
drop function private.cleanup_guest_data();

-- Evento expurgado não recebe dados pessoais novos.
create or replace function public.organizer_invitations(p_event_id uuid,p_action text default 'list',p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; inv private.invitations; token text; result jsonb;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if p_action in ('create','update','rotate') and e.personal_data_purged_at is not null then
    raise exception 'EVENT_PURGED' using errcode='P0001'; end if;
  if p_action='create' then
    if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
    token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
    insert into private.invitations(event_id,name,kind,capacity,token_hash,expires_at)
      values(e.id,btrim(p_payload->>'name'),p_payload->>'kind',(p_payload->>'capacity')::integer,
        encode(sha256(convert_to(token,'UTF8')),'hex'),e.starts_at+interval '7 days') returning * into inv;
    return jsonb_build_object('id',inv.id,'token',token);
  elsif p_action='update' then
    if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED' using errcode='22023'; end if;
    select * into inv from private.invitations where id=(p_payload->>'id')::uuid and event_id=e.id for update;
    if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='42501'; end if;
    if (p_payload->>'version')::integer is distinct from inv.version then
      raise exception 'INVITATION_VERSION_CONFLICT' using errcode='40001'; end if;
    if p_payload->>'kind' is null or p_payload->>'kind' not in ('individual','family') or
       jsonb_typeof(p_payload->'capacity') is distinct from 'number' or
       (p_payload->>'capacity') !~ '^[0-9]{1,2}$' or
       btrim(coalesce(p_payload->>'name',''))='' or length(btrim(p_payload->>'name'))>120 then
      raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
    if (p_payload->>'capacity')::integer not between 1 and 50 or
       (p_payload->>'kind'='individual' and (p_payload->>'capacity')::integer<>1) then
      raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
    if (p_payload->>'capacity')::integer<inv.attending then
      raise exception 'CAPACITY_BELOW_ATTENDING' using errcode='22023'; end if;
    update private.invitations set name=btrim(p_payload->>'name'),kind=p_payload->>'kind',
      capacity=(p_payload->>'capacity')::integer,version=version+1 where id=inv.id returning * into inv;
    return jsonb_build_object('id',inv.id,'version',inv.version);
  elsif p_action in ('revoke','rotate') then
    select * into inv from private.invitations where id=(p_payload->>'id')::uuid and event_id=e.id for update;
    if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='42501'; end if;
    if p_action='rotate' then
      if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
      token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
      update private.invitations set token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),revoked=false,
        expires_at=e.starts_at+interval '7 days',version=version+1 where id=inv.id;
    else
      update private.invitations set revoked=true,version=version+1 where id=inv.id;
    end if;
    delete from private.guest_sessions where invitation_id=inv.id;
    return jsonb_build_object('id',inv.id,'token',token);
  elsif p_action<>'list' then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  select jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'name',i.name,'kind',i.kind,'capacity',i.capacity,'response',i.response,'attending',i.attending,
    'version',i.version,'revoked',i.revoked,'expires_at',i.expires_at) order by i.created_at,i.id) from private.invitations i where event_id=e.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'title',p.title,'category',t.category,'diaper_size',t.diaper_size,
      'quantity',r.quantity,'status',r.status) order by p.title,i.name)
      from public.reservations r join private.invitations i on i.id=r.invitation_id
      join public.event_items t on t.id=r.item_id join public.products p on p.id=t.product_id
      where i.event_id=e.id and r.status<>'cancelled'),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',p.title,'category',t.category,
      'diaper_size',t.diaper_size,'limit',t.quantity_requested,'committed',coalesce(totals.quantity,0)) order by t.category,t.diaper_size,p.title)
      from public.event_items t join public.products p on p.id=t.product_id
      left join (select r.item_id,sum(r.quantity) quantity from public.reservations r
        join public.event_items t on t.id=r.item_id where t.event_id=e.id and r.status<>'cancelled'
        group by r.item_id) totals on totals.item_id=t.id where t.event_id=e.id),'[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.prepare_family_list(p_event_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; amount integer; added integer := 0;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode='P0001'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED' using errcode='22023'; end if;
  for p in select * from public.products where platform='manual' and external_reference like 'cha:%' and active order by id loop
    if exists(select 1 from public.event_items where event_id=e.id and
      (product_id=p.id or (p.diaper_size is not null and diaper_size=p.diaper_size))) then continue; end if;
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
