-- Núcleo do MVP: convites individuais/familiares, RSVP e presentes.
-- Credenciais só existem como hashes; convidados não acessam tabelas diretamente.
create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null check(length(btrim(name)) between 1 and 120),
  kind text not null check(kind in ('individual','family')),
  capacity integer not null check(capacity between 1 and 50),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  response text not null default 'pending' check(response in ('pending','yes','no','maybe')),
  attending integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check(kind <> 'individual' or capacity=1),
  check((response='yes' and attending between 1 and capacity) or (response<>'yes' and attending=0))
);
create index invitations_event_idx on private.invitations(event_id,created_at,id);
create table private.guest_sessions (
  token_hash text primary key,
  invitation_id uuid not null references private.invitations(id) on delete cascade,
  expires_at timestamptz not null
);
create index guest_sessions_invitation_idx on private.guest_sessions(invitation_id);
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references private.invitations(id),
  item_id uuid not null references public.event_items(id),
  quantity integer not null check(quantity > 0),
  status text not null check(status in ('reserved','purchase_declared','cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique(invitation_id,item_id)
);
create index reservations_item_idx on public.reservations(item_id) where status <> 'cancelled';
alter table public.reservations enable row level security;
revoke all on public.reservations from public,anon,authenticated,service_role;
create table private.guest_requests (
  invitation_id uuid not null references private.invitations(id),
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(invitation_id,request_id)
);
create table private.guest_rate (
  key_hash text primary key,
  window_start timestamptz not null,
  requests integer not null
);
revoke all on private.invitations, private.guest_sessions, private.guest_requests, private.guest_rate
  from public,anon,authenticated,service_role;

create or replace function private.committed_quantity(p_item_id uuid) returns bigint
language sql security definer set search_path='' as $$
  select coalesce(sum(quantity),0) from public.reservations where item_id=p_item_id and status<>'cancelled';
$$;

create function private.guest_snapshot(p_invitation uuid) returns jsonb
language sql security definer set search_path='' as $$
select jsonb_build_object(
  'invitation', jsonb_build_object('name',i.name,'kind',i.kind,'capacity',i.capacity,'response',i.response,'attending',i.attending,'version',i.version),
  'event',jsonb_build_object('id',e.id,'title',e.title,'description',e.public_description,'starts_at',e.starts_at,'address',e.private_address,'instructions',e.private_instructions,'cover_path',e.cover_path,'status',e.status),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',p.title,'description',p.description,
    'category',t.category,'diaper_size',t.diaper_size,'limit',t.quantity_requested,
    'committed',private.committed_quantity(t.id),
    'own',case when r.id is not null then jsonb_build_object('id',r.id,'quantity',r.quantity,'status',r.status,'version',r.version) else null end)
    order by t.category,t.diaper_size,p.title,t.id)
    from public.event_items t join public.products p on p.id=t.product_id
    left join public.reservations r on r.item_id=t.id and r.invitation_id=i.id
    where t.event_id=e.id),'[]'::jsonb)
) from private.invitations i join public.events e on e.id=i.event_id where i.id=p_invitation;
$$;

create function public.organizer_invitations(p_event_id uuid,p_action text default 'list',p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; inv private.invitations; token text; result jsonb;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if p_action='create' then
    if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
    token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
    insert into private.invitations(event_id,name,kind,capacity,token_hash,expires_at)
      values(e.id,btrim(p_payload->>'name'),p_payload->>'kind',(p_payload->>'capacity')::integer,
        encode(sha256(convert_to(token,'UTF8')),'hex'),e.starts_at+interval '7 days') returning * into inv;
    return jsonb_build_object('id',inv.id,'token',token);
  elsif p_action in ('revoke','rotate') then
    select * into inv from private.invitations where id=(p_payload->>'id')::uuid and event_id=e.id for update;
    if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='42501'; end if;
    if p_action='rotate' then
      if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
      token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
      update private.invitations set token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),revoked=false,
        expires_at=e.starts_at+interval '7 days' where id=inv.id;
    else
      update private.invitations set revoked=true where id=inv.id;
    end if;
    delete from private.guest_sessions where invitation_id=inv.id;
    return jsonb_build_object('id',inv.id,'token',token);
  elsif p_action<>'list' then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  select jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'name',i.name,'kind',i.kind,'capacity',i.capacity,'response',i.response,'attending',i.attending,
    'revoked',i.revoked,'expires_at',i.expires_at) order by i.created_at,i.id) from private.invitations i where event_id=e.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'title',p.title,'category',t.category,'diaper_size',t.diaper_size,
      'quantity',r.quantity,'status',r.status) order by p.title,i.name)
      from public.reservations r join private.invitations i on i.id=r.invitation_id
      join public.event_items t on t.id=r.item_id join public.products p on p.id=t.product_id
      where i.event_id=e.id and r.status<>'cancelled'),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',p.title,'category',t.category,
      'diaper_size',t.diaper_size,'limit',t.quantity_requested,'committed',private.committed_quantity(t.id)) order by t.category,t.diaper_size,p.title)
      from public.event_items t join public.products p on p.id=t.product_id where t.event_id=e.id),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.organizer_invitations(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.organizer_invitations(uuid,text,jsonb) to authenticated;

-- Limitador compartilhado. Retorna false em vez de lançar para persistir a contagem.
create function public.check_guest_rate(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare amount integer; start_at timestamptz := date_trunc('minute',clock_timestamp());
begin
  delete from private.guest_rate where window_start < start_at-interval '5 minutes';
  insert into private.guest_rate(key_hash,window_start,requests) values(encode(sha256(convert_to(p_key,'UTF8')),'hex'),start_at,1)
  on conflict(key_hash) do update set window_start=start_at,
    requests=case when guest_rate.window_start=start_at then guest_rate.requests+1 else 1 end
  returning requests into amount;
  return amount<=120;
end;
$$;
revoke all on function public.check_guest_rate(text) from public,anon,authenticated;
grant execute on function public.check_guest_rate(text) to service_role;

create function public.guest_action(p_token text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv private.invitations; e public.events; item public.event_items; res public.reservations;
  previous private.guest_requests; token text; hash text; inv_id uuid; req uuid;
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
  if p_action not in ('rsvp','reserve','cancel','purchase') then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  req := (p_payload->>'request_id')::uuid;
  if req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  body := jsonb_build_object('action',p_action,'payload',p_payload-'request_id');
  select * into previous from private.guest_requests where invitation_id=inv.id and request_id=req;
  if found then
    if previous.payload<>body then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('result',previous.result,'snapshot',private.guest_snapshot(inv.id));
  end if;
  if p_action in ('reserve','rsvp') and e.status<>'published' then raise exception 'EVENT_CLOSED'; end if;
  if p_action='rsvp' then
    if (p_payload->>'version')::integer is distinct from inv.version then raise exception 'RESPONSE_VERSION_CONFLICT'; end if;
    update private.invitations set response=p_payload->>'response',attending=(p_payload->>'attending')::integer,version=version+1
      where id=inv.id returning * into inv;
    result := jsonb_build_object('response',inv.response,'attending',inv.attending,'version',inv.version);
  else
    select * into item from public.event_items where id=(p_payload->>'item_id')::uuid and event_id=e.id for update;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode='42501'; end if;
    select * into res from public.reservations where invitation_id=inv.id and item_id=item.id for update;
    if (p_payload->>'version')::integer is distinct from res.version then raise exception 'RESERVATION_VERSION_CONFLICT'; end if;
    if p_action='reserve' then
      qty := (p_payload->>'quantity')::integer;
      if qty is null or qty<=0 then raise exception 'INVALID_GIFT_QUANTITY' using errcode='22023'; end if;
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
  insert into private.guest_requests values(inv.id,req,body,result);
  return jsonb_build_object('result',result,'snapshot',private.guest_snapshot(inv.id));
end;
$$;
revoke all on function public.guest_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.guest_action(text,text,jsonb) to service_role;
revoke all on function private.guest_snapshot(uuid) from public,anon,authenticated,service_role;
