-- Prévia do link por convite (decisão do titular em 02/10, com aviso em /privacidade,
-- e contrato em docs/CONTRATOS-TRANSACIONAIS.md): o link passa a ser
-- /c/<evento>/<preview_id>#token. O preview_id é público e não é credencial: só mostra, para
-- quem tem o link, o nome do convite, os dados públicos do evento e a arte do convite. O token
-- continua depois do `#` e nunca chega ao servidor. Reemitir troca o preview_id; revogar e
-- reemitir tiram a arte da prévia.
alter table private.invitations
  add column preview_id uuid not null default gen_random_uuid(),
  add column preview_path text check (preview_path is null or length(preview_path) <= 300);
create unique index invitations_preview_id_key on private.invitations(preview_id);

-- Cópia da versão vigente (20260930000000) com: create e rotate devolvem preview_id; rotate gera
-- um novo; rotate e revoke limpam a arte e devolvem o caminho antigo (old_preview).
create or replace function public.organizer_invitations(p_event_id uuid,p_action text default 'list',p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; inv private.invitations; token text; result jsonb; old_preview text;
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

-- O dono registra a arte já enviada para a pasta do evento. Exige o preview_id que o painel
-- usou para desenhar: uma arte de link já reemitido não substitui a do link novo.
-- Ordem de bloqueio igual à de organizer_invitations: evento, depois convite.
create function public.set_invitation_preview(p_event_id uuid, p_invitation_id uuid, p_preview_id uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.events; inv private.invitations; old text;
begin
  select * into e from public.events where id = p_event_id and owner_id = auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if e.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED' using errcode = '22023'; end if;
  select * into inv from private.invitations where id = p_invitation_id and event_id = e.id for update;
  if not found then raise exception 'INVITATION_NOT_FOUND' using errcode = '42501'; end if;
  if inv.revoked or p_preview_id is null or p_preview_id is distinct from inv.preview_id then
    raise exception 'PREVIEW_CONFLICT' using errcode = 'P0001';
  end if;
  if p_path is null or p_path not like e.owner_id::text || '/' || e.id::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'event-public' and name = p_path) then
    raise exception 'INVALID_PREVIEW' using errcode = '22023';
  end if;
  old := inv.preview_path;
  update private.invitations set preview_path = p_path where id = inv.id;
  return old;
end;
$$;
revoke all on function public.set_invitation_preview(uuid, uuid, uuid, text) from public, anon, service_role;
grant execute on function public.set_invitation_preview(uuid, uuid, uuid, text) to authenticated;

-- Projeção para a Pages Function /c/:evento/:preview_id (chave publicável, papel anon).
-- Só convite válido (não revogado, não expirado) de evento publicado e sem dados expurgados.
-- Sem endereço, instruções, respostas, presentes ou credenciais. Sem arte do convite, usa a do evento.
create function public.public_invitation_preview(p_event_id uuid, p_preview_id uuid)
returns table(title text, public_description text, starts_at timestamptz, image_path text, guest_name text)
language sql stable security definer set search_path = '' as $$
  select e.title, e.public_description, e.starts_at, coalesce(i.preview_path, p.image_path), i.name
  from public.events e
  join private.invitations i on i.event_id = e.id and i.preview_id = p_preview_id
  left join public.event_previews p on p.event_id = e.id
  where e.id = p_event_id and e.status = 'published' and e.personal_data_purged_at is null
    and not i.revoked and i.expires_at > now()
$$;
revoke all on function public.public_invitation_preview(uuid, uuid) from public;
grant execute on function public.public_invitation_preview(uuid, uuid) to anon, authenticated;
