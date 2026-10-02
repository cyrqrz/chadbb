-- Excluir vários convites de uma vez (pedido do titular em 02/10): ação 'delete_many' em
-- organizer_invitations, com { "ids": [uuid, ...] } (1 a 500). Tudo ou nada: se algum id não
-- for convite deste evento, nada é apagado (INVITATION_NOT_FOUND). Devolve os ids apagados e as
-- artes de prévia (old_previews) para o painel apagar os arquivos.
-- Cópia da versão vigente (20261002030000) com o ramo 'delete_many'.
create or replace function public.organizer_invitations(p_event_id uuid,p_action text default 'list',p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; inv private.invitations; token text; result jsonb; old_preview text;
  n_requests integer; n_reservations integer; n_sessions integer; ids uuid[]; locked uuid[]; olds text[];
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
    return jsonb_build_object('id',inv.id,'token',token,'preview_id',inv.preview_id);
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
    -- A arte com o nome sai da prévia nas duas ações; o painel apaga o arquivo antigo.
    old_preview := inv.preview_path;
    if p_action='rotate' then
      if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
      token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
      -- Link novo, identificador público novo: o link antigo deixa de mostrar o nome.
      update private.invitations set token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),revoked=false,
        expires_at=e.starts_at+interval '7 days',version=version+1,preview_id=gen_random_uuid(),preview_path=null
        where id=inv.id returning * into inv;
    else
      update private.invitations set revoked=true,version=version+1,preview_path=null where id=inv.id;
    end if;
    delete from private.guest_sessions where invitation_id=inv.id;
    return jsonb_build_object('id',inv.id,'token',token,'preview_id',case when p_action='rotate' then inv.preview_id end,'old_preview',old_preview);
  elsif p_action='delete' then
    -- Exclusão pelo organizador (02/10): apaga o convite com respostas, reservas (os presentes
    -- voltam a ficar disponíveis), sessões e lembrete, como private.erase_invitation, mas sem
    -- promover o lock do evento: evento FOR SHARE → convite FOR UPDATE, a ordem desta função.
    if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED' using errcode='22023'; end if;
    select * into inv from private.invitations where id=(p_payload->>'id')::uuid and event_id=e.id for update;
    if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='42501'; end if;
    delete from private.guest_requests where invitation_id=inv.id;
    get diagnostics n_requests = row_count;
    delete from public.reservations where invitation_id=inv.id;
    get diagnostics n_reservations = row_count;
    delete from private.guest_sessions where invitation_id=inv.id;
    get diagnostics n_sessions = row_count;
    delete from private.invitations where id=inv.id;
    -- Auditoria só com contagens (LGPD), como na exclusão a pedido do titular.
    insert into private.retention_audit(event_id,status,invitations_removed,guest_requests_removed,reservations_removed,guest_sessions_removed)
      values (e.id,'invitation_erased',1,n_requests,n_reservations,n_sessions);
    return jsonb_build_object('id',inv.id,'old_preview',inv.preview_path);
  elsif p_action='delete_many' then
    -- Exclusão em lote (02/10): tudo ou nada. Convites travados em ordem de id, para dois lotes
    -- ao mesmo tempo não se travarem; mesma limpeza e auditoria (só contagens) do 'delete'.
    if e.status<>'published' then raise exception 'EVENT_NOT_PUBLISHED' using errcode='22023'; end if;
    if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids') not between 1 and 500 then
      raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
    select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
    select array_agg(id) into locked from (select id from private.invitations
      where event_id=e.id and id=any(ids) order by id for update) l;
    if coalesce(cardinality(locked),0)<>cardinality(ids) then raise exception 'INVITATION_NOT_FOUND' using errcode='42501'; end if;
    select coalesce(array_agg(preview_path) filter (where preview_path is not null),'{}') into olds
      from private.invitations where id=any(ids);
    delete from private.guest_requests where invitation_id=any(ids);
    get diagnostics n_requests = row_count;
    delete from public.reservations where invitation_id=any(ids);
    get diagnostics n_reservations = row_count;
    delete from private.guest_sessions where invitation_id=any(ids);
    get diagnostics n_sessions = row_count;
    delete from private.invitations where id=any(ids);
    insert into private.retention_audit(event_id,status,invitations_removed,guest_requests_removed,reservations_removed,guest_sessions_removed)
      values (e.id,'invitation_erased',cardinality(ids),n_requests,n_reservations,n_sessions);
    return jsonb_build_object('ids',to_jsonb(ids),'old_previews',to_jsonb(olds));
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
