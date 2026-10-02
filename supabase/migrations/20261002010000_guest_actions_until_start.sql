-- Regra decidida em 30/09 ("presentes seguem liberados até o evento") e confirmada pelo
-- titular em 02/10 (N2 de docs/SEGURANCA-2026-10-02.md): depois do horário de início,
-- o convidado não confirma presença, não reserva e não troca tamanho, mesmo com o evento
-- ainda publicado. Cancelar e informar compra seguem liberados enquanto o convite valer.
-- As duas funções são cópias das versões vigentes (guest_snapshot de 20260924000000,
-- guest_action de 20260930000000) com uma única mudança cada; grants não mudam.

-- O convite recebe do servidor se o evento já começou: o front não compara relógios.
create or replace function private.guest_snapshot(p_invitation uuid) returns jsonb
language sql security definer set search_path='' as $$
with totals as materialized (
  select r.item_id,sum(r.quantity) as quantity
  from public.reservations r join public.event_items t on t.id=r.item_id
  where t.event_id=(select event_id from private.invitations where id=p_invitation)
    and r.status<>'cancelled' group by r.item_id
)
select jsonb_build_object(
  'invitation', jsonb_build_object('name',i.name,'kind',i.kind,'capacity',i.capacity,'response',i.response,'attending',i.attending,'version',i.version),
  'event',jsonb_build_object('id',e.id,'title',e.title,'description',e.public_description,'starts_at',e.starts_at,'address',e.private_address,'instructions',e.private_instructions,'cover_path',e.cover_path,'status',e.status,
    'started',e.starts_at<=clock_timestamp()),
  'rsvp',private.rsvp_policy(e.starts_at,rem.confirmation_due_at) || jsonb_build_object(
    'maybe_allowed',e.status='published' and (private.rsvp_policy(e.starts_at)->>'maybe_allowed')::boolean,
    'reminder_sent',rem.sent_at is not null,'reminder_email_set',rem.invitation_id is not null),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',p.title,'description',p.description,
    'category',t.category,'diaper_size',t.diaper_size,'limit',t.quantity_requested,
    'committed',coalesce(totals.quantity,0),
    'available',private.item_available(t.quantity_requested,coalesce(totals.quantity,0)),
    'own',case when r.id is not null then jsonb_build_object('id',r.id,'quantity',r.quantity,'status',r.status,'version',r.version) else null end)
    order by t.category,t.diaper_size,p.title,t.id)
    from public.event_items t join public.products p on p.id=t.product_id
    left join totals on totals.item_id=t.id
    left join public.reservations r on r.item_id=t.id and r.invitation_id=i.id
    where t.event_id=e.id),'[]'::jsonb)
) from private.invitations i join public.events e on e.id=i.event_id left join private.rsvp_reminders rem on rem.invitation_id=i.id where i.id=p_invitation;
$$;

create or replace function public.guest_action(p_token text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv private.invitations; e public.events; item public.event_items; res public.reservations;
  source_item public.event_items; source_res public.reservations; previous private.guest_requests; token text; hash text; inv_id uuid; req uuid;
  email text; old_email text; qty integer; committed bigint; body jsonb; result jsonb; session_expiry timestamptz;
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
  -- Idempotência não precisa guardar o endereço em claro no histórico.
  if body->'payload' ? 'reminder_email' then
    body:=jsonb_set(body,'{payload,reminder_email}',to_jsonb(encode(sha256(convert_to(inv.id::text||':'||lower(btrim(coalesce(p_payload->>'reminder_email',''))),'UTF8')),'hex')));
  end if;
  select * into previous from private.guest_requests where invitation_id=inv.id and request_id=req;
  if found then
    if previous.payload<>body then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('result',previous.result,'snapshot',private.guest_snapshot(inv.id));
  end if;
  -- A partir do início do evento, presença e reservas ficam como estão (resumo de 02/11);
  -- cancelar e informar compra continuam, como no evento encerrado.
  if p_action in ('reserve','rsvp','swap') and (e.status<>'published' or e.starts_at<=clock_timestamp()) then
    raise exception 'EVENT_CLOSED'; end if;
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
    if p_payload->>'response'='maybe' then
      if not (private.rsvp_policy(e.starts_at)->>'maybe_allowed')::boolean then
        raise exception 'RSVP_MAYBE_CLOSED' using errcode='22023';
      end if;
      select r.email into old_email from private.rsvp_reminders r where r.invitation_id=inv.id;
      email:=lower(btrim(coalesce(p_payload->>'reminder_email',old_email,'')));
      if length(email) > 254 or email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' then
        raise exception 'RSVP_EMAIL_REQUIRED' using errcode='22023';
      end if;
      if email is distinct from old_email then
        delete from private.rsvp_reminders where invitation_id=inv.id;
        insert into private.rsvp_reminders(invitation_id,email,event_starts_at) values(inv.id,email,e.starts_at);
      end if;
    end if;
    update private.invitations set auto_declined=false,response=p_payload->>'response',attending=(p_payload->>'attending')::integer,version=version+1
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
