-- Convites familiares: nomes e respostas isolados por proprietário; segredos privados.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  label text not null check (length(btrim(label)) between 1 and 120),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_event_idx on public.invitations(event_id, created_at, id);
create table public.invitation_people (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  position integer not null check (position between 1 and 20),
  unique(invitation_id, position)
);
create table public.rsvps (
  person_id uuid primary key references public.invitation_people(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending','yes','no','maybe')),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table private.invitation_tokens (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$')
);
create table private.guest_sessions (
  session_hash text primary key check (session_hash ~ '^[a-f0-9]{64}$'),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  expires_at timestamptz not null
);
create index guest_sessions_invitation_idx on private.guest_sessions(invitation_id);
create table private.guest_rate_limits (
  bucket text primary key, window_start timestamptz not null, requests integer not null
);
alter table public.invitations enable row level security;
alter table public.invitation_people enable row level security;
alter table public.rsvps enable row level security;
revoke all on public.invitations, public.invitation_people, public.rsvps from public, anon, authenticated, service_role;
grant select on public.invitations, public.invitation_people, public.rsvps to authenticated;
revoke all on private.invitation_tokens, private.guest_sessions, private.guest_rate_limits from public, anon, authenticated, service_role;
create policy owner_reads_invitations on public.invitations for select to authenticated using (
  exists(select 1 from public.events e where e.id=event_id and e.owner_id=(select auth.uid()))
);
create policy owner_reads_invitation_people on public.invitation_people for select to authenticated using (
  exists(select 1 from public.invitations i where i.id=invitation_id)
);
create policy owner_reads_rsvps on public.rsvps for select to authenticated using (
  exists(select 1 from public.invitation_people p where p.id=person_id)
);

-- Token aleatório só é retornado nesta emissão; nunca integra a tabela pública.
create function public.create_family_invitation(p_event_id uuid, p_label text, p_names text[], p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; i public.invitations; person uuid; token text; n integer;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > e.starts_at + interval '7 days' then raise exception 'INVALID_INVITATION_EXPIRY'; end if;
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
create function public.revoke_family_invitation(p_event_id uuid, p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id and owner_id=auth.uid() for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  perform 1 from public.invitations where id=p_invitation_id and event_id=p_event_id for update;
  if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='42501'; end if;
  update public.invitations set revoked_at=coalesce(revoked_at,now()) where id=p_invitation_id;
  delete from private.guest_sessions where invitation_id=p_invitation_id;
end;
$$;
revoke all on function public.create_family_invitation(uuid,text,text[],timestamptz), public.revoke_family_invitation(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_family_invitation(uuid,text,text[],timestamptz), public.revoke_family_invitation(uuid,uuid) to authenticated;

-- Sempre evento → convite. Revalidação após locks torna revogação efetiva para sessões emitidas.
create function private.require_guest(p_session_hash text)
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
  if event_status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  return i;
end;
$$;
create function public.exchange_guest_invitation(p_token_hash text, p_session_hash text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare i public.invitations; v_invitation_id uuid; v_event_id uuid; event_status text; expires timestamptz;
begin
  select t.invitation_id,x.event_id into v_invitation_id,v_event_id from private.invitation_tokens t
    join public.invitations x on x.id=t.invitation_id where token_hash=p_token_hash;
  if not found then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  select e.status into event_status from public.events e where e.id=v_event_id for share;
  select * into i from public.invitations where id=v_invitation_id for share;
  if i.revoked_at is not null or i.expires_at<=now() then raise exception 'GUEST_SESSION_INVALID' using errcode='42501'; end if;
  if event_status <> 'published' then raise exception 'EVENT_NOT_PUBLISHED'; end if;
  delete from private.guest_sessions where invitation_id=i.id and expires_at<=now();
  expires := least(now()+interval '2 hours',i.expires_at);
  insert into private.guest_sessions values(p_session_hash,i.id,expires);
  return expires;
end;
$$;
create function public.get_guest_invitation(p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations; result jsonb;
begin
  i := private.require_guest(p_session_hash);
  select jsonb_build_object('label',i.label,'expires_at',i.expires_at,
    'event',jsonb_build_object('title',e.title,'description',e.public_description,'starts_at',e.starts_at,
      'address',e.private_address,'instructions',e.private_instructions,'cover_path',e.cover_path),
    'people',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'response',r.response,'version',r.version) order by p.position),'[]'::jsonb)
      from public.invitation_people p join public.rsvps r on r.person_id=p.id where p.invitation_id=i.id)) into result
  from public.events e where e.id=i.event_id;
  return result;
end;
$$;
create function public.set_guest_rsvp(p_session_hash text,p_person_id uuid,p_response text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations; r public.rsvps;
begin
  i := private.require_guest(p_session_hash);
  if p_response is null or p_response not in ('yes','no','maybe') then raise exception 'INVALID_RSVP'; end if;
  perform 1 from public.invitation_people where id=p_person_id and invitation_id=i.id;
  if not found then raise exception 'PERSON_NOT_FOUND' using errcode='42501'; end if;
  select * into r from public.rsvps where person_id=p_person_id for update;
  if r.version is distinct from p_version then raise exception 'RSVP_VERSION_CONFLICT'; end if;
  update public.rsvps set response=p_response,version=version+1,updated_at=now() where person_id=p_person_id returning * into r;
  return jsonb_build_object('id',p_person_id,'response',r.response,'version',r.version);
end;
$$;
-- Retorna false (não lança erro) para preservar contadores de tentativas rejeitadas.
create function public.allow_guest_request(p_ip_hash text,p_credential_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare key text; count integer; limit_value integer; minute timestamptz := date_trunc('minute',clock_timestamp());
begin
  if p_ip_hash is null or p_credential_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_credential_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from private.guest_rate_limits where window_start < minute - interval '2 minutes';
  foreach key in array array['global','ip:'||p_ip_hash,'token:'||p_credential_hash] loop
    limit_value := case when key='global' then 300 when key like 'ip:%' then 60 else 20 end;
    insert into private.guest_rate_limits as q values(key,minute,1) on conflict(bucket) do update
      set requests=case when q.window_start=minute then q.requests+1 else 1 end,window_start=minute returning requests into count;
    if count>limit_value then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.require_guest(text) from public, anon, authenticated, service_role;
revoke all on function public.exchange_guest_invitation(text,text), public.get_guest_invitation(text), public.set_guest_rsvp(text,uuid,text,integer), public.allow_guest_request(text,text) from public, anon, authenticated, service_role;
grant execute on function public.exchange_guest_invitation(text,text), public.get_guest_invitation(text), public.set_guest_rsvp(text,uuid,text,integer), public.allow_guest_request(text,text) to service_role;
