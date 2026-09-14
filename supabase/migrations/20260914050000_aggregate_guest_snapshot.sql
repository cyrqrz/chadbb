-- Uma agregação por evento; o cálculo transacional sob bloqueio continua por item.
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
  'event',jsonb_build_object('id',e.id,'title',e.title,'description',e.public_description,'starts_at',e.starts_at,'address',e.private_address,'instructions',e.private_instructions,'cover_path',e.cover_path,'status',e.status),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',p.title,'description',p.description,
    'category',t.category,'diaper_size',t.diaper_size,'limit',t.quantity_requested,
    'committed',coalesce(totals.quantity,0),
    'own',case when r.id is not null then jsonb_build_object('id',r.id,'quantity',r.quantity,'status',r.status,'version',r.version) else null end)
    order by t.category,t.diaper_size,p.title,t.id)
    from public.event_items t join public.products p on p.id=t.product_id
    left join totals on totals.item_id=t.id
    left join public.reservations r on r.item_id=t.id and r.invitation_id=i.id
    where t.event_id=e.id),'[]'::jsonb)
) from private.invitations i join public.events e on e.id=i.event_id where i.id=p_invitation;
$$;

create or replace function public.organizer_invitations(p_event_id uuid,p_action text default 'list',p_payload jsonb default '{}')
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
revoke all on function public.organizer_invitations(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.organizer_invitations(uuid,text,jsonb) to authenticated;

