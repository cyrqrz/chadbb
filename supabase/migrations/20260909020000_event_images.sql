insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('event-public', 'event-public', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-private', 'event-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Arquivos públicos exigem consentimento explícito na interface: o download é público,
-- inclusive antes da publicação. O bucket privado nunca oferece leitura anônima.
create policy event_images_owner_select on storage.objects for select to authenticated using (
  bucket_id in ('event-public', 'event-private')
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.events e where e.id::text = (storage.foldername(name))[2] and e.owner_id = auth.uid())
);
create policy event_images_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('event-public', 'event-private')
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 2
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (select 1 from public.events e where e.id::text = (storage.foldername(name))[2]
    and e.owner_id = auth.uid() and e.status <> 'closed')
);
-- Sem UPDATE/upsert: nomes aleatórios e imutáveis impedem substituir arquivos alheios.
create policy event_images_owner_delete on storage.objects for delete to authenticated using (
  bucket_id in ('event-public', 'event-private')
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.events e where e.id::text = (storage.foldername(name))[2]
    and e.owner_id = auth.uid() and e.status <> 'closed' and e.cover_path is distinct from name)
);
