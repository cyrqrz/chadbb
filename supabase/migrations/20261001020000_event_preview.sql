-- Prévia do link do convite com a cara do evento (fase 2 de docs/PLANO-CONVITE-WHATSAPP.md,
-- decisões do titular em 01/10): arte gerada no navegador do organizador ao salvar ou
-- publicar, guardada na pasta do evento no bucket público, e leitura pública restrita a
-- título, descrição pública, data/horário e arte de evento publicado. Endereço,
-- instruções, convidados e credenciais nunca saem daqui (functions/README.md).
create table public.event_previews (
  event_id uuid primary key references public.events(id) on delete cascade,
  image_path text not null,
  updated_at timestamptz not null default now()
);
alter table public.event_previews enable row level security;
-- Sem políticas: acesso só pelas funções abaixo.
revoke all on public.event_previews from public, anon, authenticated;

-- O dono registra a arte já enviada (nome aleatório, como a capa) e recebe a anterior,
-- para apagar o arquivo antigo. Não mexe na versão do evento: a arte acompanha os dados,
-- não concorre com a edição.
create function public.set_event_preview(p_event_id uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.events; old text;
begin
  select * into e from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = '42501'; end if;
  if e.personal_data_purged_at is not null then raise exception 'EVENT_PURGED' using errcode = 'P0001'; end if;
  if e.status = 'closed' then raise exception 'EVENT_CLOSED' using errcode = '22023'; end if;
  if p_path is null or p_path not like e.owner_id::text || '/' || e.id::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'event-public' and name = p_path) then
    raise exception 'INVALID_PREVIEW' using errcode = '22023';
  end if;
  select image_path into old from public.event_previews where event_id = e.id;
  insert into public.event_previews(event_id, image_path) values (e.id, p_path)
  on conflict (event_id) do update set image_path = excluded.image_path, updated_at = now();
  return old;
end;
$$;
revoke all on function public.set_event_preview(uuid, text) from public, anon, service_role;
grant execute on function public.set_event_preview(uuid, text) to authenticated;

-- Projeção explícita para a Pages Function `/c/:id` (chave publicável, papel anon).
-- Só evento publicado e sem dados expurgados; sem endereço, instruções ou convidados.
create function public.public_event_preview(p_event_id uuid)
returns table(title text, public_description text, starts_at timestamptz, image_path text)
language sql stable security definer set search_path = '' as $$
  select e.title, e.public_description, e.starts_at, p.image_path
  from public.events e left join public.event_previews p on p.event_id = e.id
  where e.id = p_event_id and e.status = 'published' and e.personal_data_purged_at is null
$$;
revoke all on function public.public_event_preview(uuid) from public;
grant execute on function public.public_event_preview(uuid) to anon, authenticated;
