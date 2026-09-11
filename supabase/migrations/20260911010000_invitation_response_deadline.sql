-- Regra confirmada: link reabrível; respostas somente até o início. Sem expiração automática.
alter table public.invitations alter column expires_at drop not null;

create or replace function public.create_family_invitation(p_event_id uuid, p_label text, p_names text[], p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; i public.invitations; person uuid; token text; n integer;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.status <> 'published' or e.starts_at<=clock_timestamp() then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'INVALID_INVITATION_EXPIRY'; end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 120 or p_names is null
    or coalesce(array_length(p_names,1),0) not between 1 and 20 or array_ndims(p_names) <> 1
    or exists(select 1 from unnest(p_names) name where name is null or length(btrim(name)) not between 1 and 100)
    then raise exception 'INVALID_FAMILY'; end if;
  insert into public.invitations(event_id,label,expires_at) values(e.id,btrim(p_label),p_expires_at) returning * into i;
  for n in 1..array_length(p_names,1) loop
    insert into public.invitation_people(invitation_id,name,position) values(i.id,btrim(p_names[n]),n) returning id into person;
    insert into public.rsvps(person_id) values(person);
  end loop;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  insert into private.invitation_tokens values(i.id,encode(sha256(convert_to(token,'UTF8')),'hex'));
  return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end;
$$;

create or replace function private.require_guest(p_session_hash text)
returns public.invitations language plpgsql security definer set search_path='' as $$
declare i public.invitations; v_event_id uuid; v_invitation_id uuid; event_status text;
begin
  select s.invitation_id, x.event_id into v_invitation_id,v_event_id from private.guest_sessions s
    join public.invitations x on x.id=s.invitation_id where s.session_hash=p_session_hash and s.expires_at>now();
  if not found then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  select e.status into event_status from public.events e where e.id=v_event_id for share;
  select * into i from public.invitations where id=v_invitation_id for share;
  if i.revoked_at is not null or i.expires_at<=now() or not exists(
    select 1 from private.guest_sessions s where s.session_hash=p_session_hash and s.expires_at>now()
  ) then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  if event_status not in ('published','closed') then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  return i;
end;
$$;

create or replace function public.exchange_guest_invitation(p_token_hash text, p_session_hash text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare i public.invitations; v_invitation_id uuid; v_event_id uuid; event_status text; expires timestamptz;
begin
  select t.invitation_id,x.event_id into v_invitation_id,v_event_id from private.invitation_tokens t
    join public.invitations x on x.id=t.invitation_id where token_hash=p_token_hash;
  if not found then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  select e.status into event_status from public.events e where e.id=v_event_id for share;
  select * into i from public.invitations where id=v_invitation_id for share;
  if i.revoked_at is not null or i.expires_at<=now() then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  if event_status not in ('published','closed') then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  delete from private.guest_sessions where invitation_id=i.id and expires_at<=now();
  expires := least(now()+interval '2 hours',i.expires_at);
  insert into private.guest_sessions values(p_session_hash,i.id,expires);
  return expires;
end;
$$;

create or replace function public.get_guest_invitation(p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations; result jsonb;
begin
  i := private.require_guest(p_session_hash);
  select jsonb_build_object('label',i.label,'expires_at',i.expires_at,'read_only',(e.status='closed' or e.starts_at<=clock_timestamp()),
    'event',jsonb_build_object('title',e.title,'description',e.public_description,'starts_at',e.starts_at,
      'address',e.private_address,'instructions',e.private_instructions,'cover_path',e.cover_path),
    'people',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'response',r.response,'version',r.version) order by p.position),'[]'::jsonb)
      from public.invitation_people p join public.rsvps r on r.person_id=p.id where p.invitation_id=i.id)) into result
  from public.events e where e.id=i.event_id;
  return result;
end;
$$;

create or replace function public.set_guest_rsvp(p_session_hash text,p_person_id uuid,p_response text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations; r public.rsvps;
begin
  i := private.require_guest(p_session_hash);
  if p_response is null or p_response not in ('yes','no','maybe') then raise exception 'INVALID_RSVP'; end if;
  perform 1 from public.invitation_people where id=p_person_id and invitation_id=i.id;
  if not found then raise exception 'PERSON_NOT_FOUND' using errcode='42501'; end if;
  select * into r from public.rsvps where person_id=p_person_id for update;
  if exists(select 1 from public.events where id=i.event_id and (status<>'published' or starts_at<=clock_timestamp())) then raise exception 'RSVP_CLOSED'; end if;
  if r.version is distinct from p_version then raise exception 'RSVP_VERSION_CONFLICT'; end if;
  update public.rsvps set response=p_response,version=version+1,updated_at=now() where person_id=p_person_id returning * into r;
  return jsonb_build_object('id',p_person_id,'response',r.response,'version',r.version);
end;
$$;
