-- Origem da ausência automática e contagens operacionais sem expor contatos.
-- Aplicar antes do front que consome summary.reminders e auto_declined.
-- Histórico anterior não permite reconstruir a origem: marca começa falsa.
alter table private.invitations add column auto_declined boolean not null default false
  check (not auto_declined or response = 'no');

-- O organizador já validou o dono e mantém o lock do evento. Não é RPC pública.
create function private.rsvp_reminder_counts(p_event_id uuid) returns jsonb
language sql volatile set search_path = '' as $$
  with instant as materialized (select clock_timestamp() as at),
  outstanding as (
    select q.invitation_id is null or (
      coalesce(q.lease_until,'-infinity'::timestamptz) <= instant.at and (
        q.first_attempt_at <= instant.at - interval '23 hours' or
        greatest(ev.starts_at - interval '10 days', q.next_attempt_at,
          coalesce(q.lease_until,'-infinity'::timestamptz)) < instant.at - interval '30 minutes'
      )
    ) as attention
    from private.invitations i
    join public.events ev on ev.id=i.event_id
    cross join instant
    left join private.rsvp_reminders q on q.invitation_id=i.id
    where i.event_id=p_event_id and ev.status='published' and ev.starts_at>instant.at
      and i.response='maybe' and not i.revoked and i.expires_at>instant.at
      and q.sent_at is null
  )
  select jsonb_build_object('pending',count(*) filter (where not coalesce(attention,false)),
    'attention',count(*) filter (where coalesce(attention,false))) from outstanding;
$$;
revoke all on function private.rsvp_reminder_counts(uuid) from public,anon,authenticated,service_role;

-- Mesma regra de RSVP e replay: uma nova resposta manual limpa a marca.
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

-- Só a conversão por prazo marca a origem automática.
create or replace function public.rsvp_reminders_claim(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record; inv private.invitations; e public.events; r private.rsvp_reminders;
  jobs jsonb:='[]'; expired integer:=0; dropped integer:=0; now_at timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_LIMIT'; end if;
  -- Sem utilidade para o lembrete: apaga o contato. Só linhas sem entrega em curso.
  delete from private.rsvp_reminders q using private.invitations i, public.events ev
    where i.id=q.invitation_id and ev.id=i.event_id
      and coalesce(q.lease_until,'-infinity')<=clock_timestamp()
      and (i.revoked or i.response<>'maybe' or i.expires_at<=clock_timestamp() or ev.status<>'published'
        or ev.starts_at<=clock_timestamp()
        or (q.sent_at is null and ev.starts_at<clock_timestamp()+interval '3 days')
        or (q.sent_at is null and q.first_attempt_at<=clock_timestamp()-interval '24 hours'));
  get diagnostics dropped = row_count;
  for candidate in
    select q.invitation_id,i.event_id from private.rsvp_reminders q
      join private.invitations i on i.id=q.invitation_id join public.events ev on ev.id=i.event_id
    where i.response='maybe' and not i.revoked and i.expires_at>clock_timestamp() and ev.status='published'
      and ev.starts_at>clock_timestamp()
      and ((q.sent_at is not null and q.confirmation_due_at<=clock_timestamp()) or
        (q.sent_at is null and ev.starts_at-interval '10 days'<=clock_timestamp()
         and ev.starts_at>=clock_timestamp()+interval '3 days'
         and q.next_attempt_at<=clock_timestamp() and coalesce(q.lease_until,'-infinity')<=clock_timestamp()
         and (q.first_attempt_at is null or q.first_attempt_at>clock_timestamp()-interval '23 hours')))
    order by i.event_id,i.id limit p_limit
  loop
    select * into e from public.events where id=candidate.event_id for share skip locked;
    if not found then continue; end if;
    select * into inv from private.invitations where id=candidate.invitation_id for update skip locked;
    if not found then continue; end if;
    select * into r from private.rsvp_reminders where invitation_id=inv.id for update;
    now_at:=clock_timestamp();
    if r.id is null or inv.response<>'maybe' or inv.revoked or inv.expires_at<=now_at or e.status<>'published'
      or r.event_starts_at is distinct from e.starts_at or e.starts_at<=now_at then continue; end if;
    if r.sent_at is not null then
      if r.confirmation_due_at<=now_at then
        update private.invitations set auto_declined=true,response='no',attending=0,version=version+1 where id=inv.id;
        expired:=expired+1;
      end if;
    elsif not (private.rsvp_policy(e.starts_at)->>'maybe_allowed')::boolean
      and e.starts_at>=now_at+interval '3 days'
      and r.next_attempt_at<=now_at and coalesce(r.lease_until,'-infinity')<=now_at
      and (r.first_attempt_at is null or r.first_attempt_at>now_at-interval '23 hours') then
      update private.rsvp_reminders set lease=gen_random_uuid(),lease_until=now_at+interval '5 minutes',
        first_attempt_at=coalesce(first_attempt_at,now_at),
        confirmation_due_at=coalesce(confirmation_due_at,least(e.starts_at,greatest(e.starts_at-interval '7 days',now_at+interval '3 days'))),
        title=coalesce(title,e.title),attempts=attempts+1
        where invitation_id=inv.id returning * into r;
      jobs:=jobs||jsonb_build_array(jsonb_build_object('id',r.id,'lease',r.lease,'recipient',r.email,
        'title',r.title,'confirmation_due_at',r.confirmation_due_at));
    end if;
  end loop;
  return jsonb_build_object('jobs',jobs,'expired',expired,'dropped',dropped);
end;
$$;

-- Contrato aditivo do painel; controles de autorização preservados.
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
  with totals as materialized (
    select r.item_id, sum(r.quantity) quantity from public.reservations r
    join public.event_items t on t.id=r.item_id
    where t.event_id=e.id and r.status<>'cancelled' group by r.item_id
  )
  select jsonb_build_object('rsvp',private.rsvp_policy(e.starts_at) || jsonb_build_object('reminder_sent',false,'reminder_email_set',false), 'summary', jsonb_build_object(
    'reminders',private.rsvp_reminder_counts(e.id),
    'invitations', (select jsonb_build_object(
      'total',count(*), 'answered',count(*) filter (where response<>'pending'),
      'yes',count(*) filter (where response='yes'), 'no',count(*) filter (where response='no'),
      'maybe',count(*) filter (where response='maybe'), 'pending',count(*) filter (where response='pending'),
      'revoked',count(*) filter (where revoked)) from private.invitations where event_id=e.id),
    'people_confirmed', (select coalesce(sum(attending) filter (where response='yes'),0)
      from private.invitations where event_id=e.id),
    'diapers', (select jsonb_build_object('committed',coalesce(sum(totals.quantity),0),
      'limit',coalesce(sum(t.quantity_requested),0)) from public.event_items t
      left join totals on totals.item_id=t.id where t.event_id=e.id and t.category='fralda')),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'name',i.name,'kind',i.kind,'capacity',i.capacity,'response',i.response,'attending',i.attending,
    'auto_declined',i.auto_declined,'version',i.version,'revoked',i.revoked,'expires_at',i.expires_at) order by i.created_at,i.id) from private.invitations i where event_id=e.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'invitation_id',i.id,'name',i.name,'title',p.title,'category',t.category,'diaper_size',t.diaper_size,
      'quantity',r.quantity,'status',r.status) order by p.title,i.name,r.id)
      from public.reservations r join private.invitations i on i.id=r.invitation_id
      join public.event_items t on t.id=r.item_id join public.products p on p.id=t.product_id
      where i.event_id=e.id and r.status<>'cancelled'),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',p.title,'category',t.category,
      'diaper_size',t.diaper_size,'limit',t.quantity_requested,'committed',coalesce(totals.quantity,0),
      'available',private.item_available(t.quantity_requested,coalesce(totals.quantity,0))) order by t.category,t.diaper_size,p.title)
      from public.event_items t join public.products p on p.id=t.product_id
      left join totals on totals.item_id=t.id where t.event_id=e.id),'[]'::jsonb)) into result;
  return result;
end;
$$;
