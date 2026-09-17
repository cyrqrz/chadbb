-- Exclusão definitiva de um evento pelo organizador (rascunho ou encerrado).
-- O banco apaga tudo na mesma transação; os arquivos saem pela API de Storage
-- (storage.protect_delete bloqueia DELETE direto e deixaria o arquivo órfão).
-- A pasta fica registrada até a limpeza terminar: a Edge delete-event tenta na
-- hora e a Edge retention repete as pendências no cron diário.

create table private.event_deletions (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  deleted_at timestamptz not null default now(),
  previous_status text not null check (previous_status in ('draft', 'closed')),
  items_removed integer not null,
  invitations_removed integer not null,
  guest_requests_removed integer not null,
  reservations_removed integer not null,
  guest_sessions_removed integer not null,
  -- "<owner_id>/<event_id>"; apagada quando a limpeza conclui.
  storage_prefix text,
  storage_objects_removed integer check (storage_objects_removed >= 0),
  storage_failures integer not null default 0,
  storage_cleaned_at timestamptz,
  check ((storage_prefix is null) = (storage_cleaned_at is not null))
);
create index event_deletions_pending_idx on private.event_deletions (deleted_at) where storage_cleaned_at is null;
revoke all on private.event_deletions from public, anon, authenticated, service_role;

create function public.delete_event(p_event_id uuid, p_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; n_items integer; n_requests integer; n_reservations integer; n_sessions integer; n_invitations integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Ordem global: evento → convite → item → reserva. FOR UPDATE espera as ações de convidados em curso.
  select * into e from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  -- Versão antes do estado: a tela desatualizada recarrega e passa a ver o estado real.
  if p_version is distinct from e.version then raise exception 'EVENT_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  if e.status not in ('draft', 'closed') then raise exception 'EVENT_NOT_DELETABLE' using errcode = 'P0001'; end if;
  perform 1 from private.invitations where event_id = e.id order by id for update;
  delete from private.guest_requests r using private.invitations i where r.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_requests = row_count;
  delete from public.reservations r
    where r.item_id in (select t.id from public.event_items t where t.event_id = e.id)
       or r.invitation_id in (select i.id from private.invitations i where i.event_id = e.id);
  get diagnostics n_reservations = row_count;
  delete from private.guest_sessions s using private.invitations i where s.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_sessions = row_count;
  delete from private.invitations where event_id = e.id;
  get diagnostics n_invitations = row_count;
  delete from public.event_items where event_id = e.id;
  get diagnostics n_items = row_count;
  delete from public.events where id = e.id;
  -- Pasta registrada sempre: um envio concorrente pode ter gravado arquivo que o banco ainda não mostrava.
  insert into private.event_deletions(event_id, previous_status, items_removed, invitations_removed,
    guest_requests_removed, reservations_removed, guest_sessions_removed, storage_prefix)
    values (e.id, e.status, n_items, n_invitations, n_requests, n_reservations, n_sessions, e.owner_id::text || '/' || e.id::text);
  return jsonb_build_object('event_id', e.id, 'items_removed', n_items, 'invitations_removed', n_invitations,
    'reservations_removed', n_reservations, 'storage_cleanup', 'pending');
end;
$$;

-- Superfície das Edge Functions delete-event e retention: somente service_role.
create function public.event_deletion_pending(p_event_id uuid default null)
returns table(event_id uuid, storage_prefix text)
language sql stable security definer set search_path = '' as $$
  select d.event_id, d.storage_prefix from private.event_deletions d
  where d.storage_cleaned_at is null and (p_event_id is null or d.event_id = p_event_id)
  order by d.deleted_at, d.id
  limit 100
$$;

create function public.event_deletion_storage_done(p_event_id uuid, p_removed integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_removed is null or p_removed < 0 then raise exception 'INVALID_STORAGE_COUNT' using errcode = '22023'; end if;
  -- Repetição mantém a primeira contagem e a data da conclusão.
  update private.event_deletions set storage_prefix = null, storage_objects_removed = p_removed,
    storage_cleaned_at = now()
    where event_id = p_event_id and storage_cleaned_at is null;
  if not found and not exists (select 1 from private.event_deletions where event_id = p_event_id) then
    raise exception 'EVENT_DELETION_NOT_FOUND' using errcode = '22023';
  end if;
end;
$$;

create function public.event_deletion_storage_failed(p_event_id uuid) returns void
language sql security definer set search_path = '' as $$
  update private.event_deletions set storage_failures = storage_failures + 1
  where event_id = p_event_id and storage_cleaned_at is null
$$;

revoke all on function public.delete_event(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.event_deletion_pending(uuid) from public, anon, authenticated, service_role;
revoke all on function public.event_deletion_storage_done(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.event_deletion_storage_failed(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_event(uuid, integer) to authenticated;
grant execute on function public.event_deletion_pending(uuid) to service_role;
grant execute on function public.event_deletion_storage_done(uuid, integer) to service_role;
grant execute on function public.event_deletion_storage_failed(uuid) to service_role;

-- Sem mudança de regra: somente a checagem de linhas removidas durante a espera,
-- que antes chegava ao cliente como erro SQL de NOT NULL em guest_sessions.
create or replace function public.guest_action(p_token text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv private.invitations; e public.events; item public.event_items; res public.reservations;
  source_item public.event_items; source_res public.reservations; previous private.guest_requests; token text; hash text; inv_id uuid; req uuid;
  qty integer; committed bigint; body jsonb; result jsonb; session_expiry timestamptz;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if p_action='exchange' then
    select id into inv_id from private.invitations where token_hash=hash;
  else
    select invitation_id into inv_id from private.guest_sessions where token_hash=hash and expires_at>clock_timestamp();
  end if;
  if inv_id is null then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  -- Ordem global: evento, convite, item, reserva. Serializa pedidos do mesmo convite.
  select ev.* into e from public.events ev join private.invitations i on i.event_id=ev.id where i.id=inv_id for share of ev;
  select * into inv from private.invitations where id=inv_id for update;
  -- Convite ou evento apagado enquanto esperava o bloqueio (exclusão ou pedido do titular).
  if e.id is null or inv.id is null or inv.revoked or inv.expires_at<=clock_timestamp() or e.status='draft' then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  if p_action='exchange' then
    if inv.token_hash<>hash then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
    token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
    session_expiry := least(clock_timestamp()+interval '2 hours',inv.expires_at);
    delete from private.guest_sessions where invitation_id=inv.id and expires_at<=clock_timestamp();
    insert into private.guest_sessions values(encode(sha256(convert_to(token,'UTF8')),'hex'),inv.id,session_expiry);
    return jsonb_build_object('session_token',token,'expires_at',session_expiry,'snapshot',private.guest_snapshot(inv.id));
  end if;
  if not exists(select 1 from private.guest_sessions where token_hash=hash and invitation_id=inv.id and expires_at>clock_timestamp()) then
    raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  if p_action='read' then return jsonb_build_object('snapshot',private.guest_snapshot(inv.id)); end if;
  if p_action not in ('rsvp','reserve','cancel','purchase','swap') then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  req := (p_payload->>'request_id')::uuid;
  if req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  body := jsonb_build_object('action',p_action,'payload',p_payload-'request_id');
  select * into previous from private.guest_requests where invitation_id=inv.id and request_id=req;
  if found then
    if previous.payload<>body then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('result',previous.result,'snapshot',private.guest_snapshot(inv.id));
  end if;
  if p_action in ('reserve','rsvp','swap') and e.status<>'published' then raise exception 'EVENT_CLOSED'; end if;
  if p_action='rsvp' then
    if p_payload->>'response' is null or p_payload->>'response' not in ('yes','no','maybe') then
      raise exception 'RSVP_INVALID_RESPONSE' using errcode='22023'; end if;
    if jsonb_typeof(p_payload->'attending') is distinct from 'number' or
       (p_payload->>'attending') !~ '^[0-9]{1,9}$' then
      raise exception 'RSVP_INVALID_RESPONSE' using errcode='22023'; end if;
    if (p_payload->>'attending')::integer>inv.capacity then
      raise exception 'ATTENDING_ABOVE_CAPACITY' using errcode='22023'; end if;
    if (p_payload->>'response'='yes' and (p_payload->>'attending')::integer<1) or
       (p_payload->>'response'<>'yes' and (p_payload->>'attending')::integer<>0) then
      raise exception 'RSVP_INVALID_RESPONSE' using errcode='22023'; end if;
    if (p_payload->>'version')::integer is distinct from inv.version then raise exception 'RESPONSE_VERSION_CONFLICT'; end if;
    update private.invitations set response=p_payload->>'response',attending=(p_payload->>'attending')::integer,version=version+1
      where id=inv.id returning * into inv;
    result := jsonb_build_object('response',inv.response,'attending',inv.attending,'version',inv.version);
  elsif p_action='swap' then
    -- Bloquear tamanhos em ordem estável antes de qualquer alteração.
    perform 1 from public.event_items where event_id=e.id and id in
      ((p_payload->>'item_id')::uuid,(p_payload->>'from_item_id')::uuid) order by id for update;
    select * into item from public.event_items where event_id=e.id and id=(p_payload->>'item_id')::uuid;
    select * into source_item from public.event_items where event_id=e.id and id=(p_payload->>'from_item_id')::uuid;
    if item.id is null or source_item.id is null or item.id=source_item.id or item.category<>'fralda' or source_item.category<>'fralda' then
      raise exception 'ITEM_NOT_FOUND' using errcode='42501'; end if;
    select * into source_res from public.reservations where invitation_id=inv.id and item_id=source_item.id for update;
    select * into res from public.reservations where invitation_id=inv.id and item_id=item.id for update;
    if source_res.id is null or source_res.status='cancelled' then raise exception 'RESERVATION_NOT_FOUND' using errcode='42501'; end if;
    if source_res.status='purchase_declared' or res.status='purchase_declared' then
      raise exception 'PURCHASE_ALREADY_DECLARED' using errcode='22023'; end if;
    if (p_payload->>'version')::integer is distinct from source_res.version or
       (p_payload->>'destination_version')::integer is distinct from res.version then raise exception 'RESERVATION_VERSION_CONFLICT'; end if;
    qty := source_res.quantity;
    committed := private.committed_quantity(item.id);
    if qty::bigint+committed>item.quantity_requested then raise exception 'INSUFFICIENT_QUANTITY'; end if;
    if res.id is not null and res.status<>'cancelled' then qty:=qty+res.quantity; end if;
    if qty>1000 then raise exception 'INVALID_GIFT_QUANTITY' using errcode='22023'; end if;
    insert into public.reservations(invitation_id,item_id,quantity,status) values(inv.id,item.id,qty,'reserved')
      on conflict(invitation_id,item_id) do update set quantity=excluded.quantity,status='reserved',version=reservations.version+1 returning * into res;
    update public.reservations set status='cancelled',version=version+1 where id=source_res.id returning * into source_res;
    result:=jsonb_build_object('from',to_jsonb(source_res)-'invitation_id','to',to_jsonb(res)-'invitation_id');
  else
    select * into item from public.event_items where id=(p_payload->>'item_id')::uuid and event_id=e.id for update;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode='42501'; end if;
    select * into res from public.reservations where invitation_id=inv.id and item_id=item.id for update;
    if (p_payload->>'version')::integer is distinct from res.version then raise exception 'RESERVATION_VERSION_CONFLICT'; end if;
    if p_action='reserve' then
      -- Compra informada só pode ser cancelada; mudar a quantidade apagaria a declaração.
      if res.status='purchase_declared' then raise exception 'PURCHASE_ALREADY_DECLARED' using errcode='22023'; end if;
      if jsonb_typeof(p_payload->'quantity') is distinct from 'number' or
         (p_payload->>'quantity') !~ '^[0-9]{1,4}$' then
        raise exception 'INVALID_GIFT_QUANTITY' using errcode='22023'; end if;
      qty := (p_payload->>'quantity')::integer;
      if qty is null or qty not between 1 and 1000 then raise exception 'INVALID_GIFT_QUANTITY' using errcode='22023'; end if;
      committed := private.committed_quantity(item.id);
      if res.id is not null and res.status<>'cancelled' then committed:=committed-res.quantity; end if;
      if item.quantity_requested is not null and qty::bigint+committed>item.quantity_requested then raise exception 'INSUFFICIENT_QUANTITY'; end if;
      insert into public.reservations(invitation_id,item_id,quantity,status) values(inv.id,item.id,qty,'reserved')
      on conflict(invitation_id,item_id) do update set quantity=excluded.quantity,status='reserved',version=reservations.version+1
      returning * into res;
    else
      if res.id is null then raise exception 'RESERVATION_NOT_FOUND' using errcode='42501'; end if;
      if p_action='purchase' and res.status='cancelled' then raise exception 'INVALID_RESERVATION_STATE'; end if;
      update public.reservations set status=case when p_action='cancel' then 'cancelled' else 'purchase_declared' end,
        version=version+1 where id=res.id returning * into res;
    end if;
    result := to_jsonb(res)-'invitation_id';
  end if;
  insert into private.guest_requests(invitation_id,request_id,payload,result) values(inv.id,req,body,result);
  return jsonb_build_object('result',result,'snapshot',private.guest_snapshot(inv.id));
end;
$$;
