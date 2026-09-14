-- Correções da revisão do PR #1.

-- Adiar o evento move a validade dos convites; evento já vencido para retenção não é editado,
-- para que a data não mude entre a remoção dos arquivos e o expurgo do banco.
create or replace function public.save_event(
  p_event_id uuid, p_version integer, p_title text, p_public_description text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_private_address text, p_private_instructions text, p_cover_path text
) returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  select * into result from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if result.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if result.status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = 'P0001'; end if;
  if result.status <> 'draft' and result.ends_at is not null and now() >= private.retention_due_at(result.ends_at) then
    raise exception 'EVENT_RETENTION_DUE' using errcode = 'P0001';
  end if;
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
  if p_starts_at is distinct from result.starts_at then
    update private.invitations set expires_at = p_starts_at + interval '7 days' where event_id = p_event_id;
  end if;
  update public.events set title = btrim(p_title), public_description = p_public_description,
    starts_at = p_starts_at, ends_at = p_ends_at, private_address = p_private_address,
    private_instructions = p_private_instructions, cover_path = p_cover_path
    where id = p_event_id returning * into result;
  return result;
end;
$$;

-- Rascunho nunca entra na retenção: não tem convidados e pode estar com data provisória.
create or replace function public.retention_run() returns table(event_id uuid, owner_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cleanup_guest_technical();
  return query select e.id, e.owner_id from public.events e
    where e.status <> 'draft' and e.personal_data_purged_at is null and e.ends_at is not null
      and now() >= private.retention_due_at(e.ends_at)
    order by e.ends_at, e.id;
end;
$$;

create or replace function private.purge_event_personal_data(p_event_id uuid, p_storage_removed integer default null)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.events; n_requests integer; n_reservations integer; n_sessions integer; n_invitations integer;
begin
  select * into e from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if e.personal_data_purged_at is not null then
    insert into private.retention_audit(event_id, status, storage_objects_removed) values (e.id, 'already_purged', p_storage_removed);
    return 'already_purged';
  end if;
  if e.status = 'draft' or e.ends_at is null or now() < private.retention_due_at(e.ends_at) then return 'not_due'; end if;
  delete from private.guest_requests r using private.invitations i where r.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_requests = row_count;
  delete from public.reservations r using private.invitations i where r.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_reservations = row_count;
  delete from private.guest_sessions s using private.invitations i where s.invitation_id = i.id and i.event_id = e.id;
  get diagnostics n_sessions = row_count;
  delete from private.invitations where event_id = e.id;
  get diagnostics n_invitations = row_count;
  update public.events set private_address = '', private_instructions = '', cover_path = null where id = e.id;
  update public.events set personal_data_purged_at = now() where id = e.id;
  insert into private.retention_audit(event_id, status, invitations_removed, guest_requests_removed,
    reservations_removed, guest_sessions_removed, storage_objects_removed)
    values (e.id, 'purged', n_invitations, n_requests, n_reservations, n_sessions, p_storage_removed);
  return 'purged';
end;
$$;

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
  if inv.revoked or inv.expires_at<=clock_timestamp() or e.status='draft' then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
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
