-- Catálogo autorizado para o MVP familiar; não contém dados pessoais.
insert into public.products (title, description, platform, external_reference, category, diaper_size) values
  ('Fraldas tamanho P', 'Uma unidade equivale a um pacote de fraldas tamanho P.', 'manual', 'cha:fralda-p', 'fralda', 'P'),
  ('Fraldas tamanho M', 'Uma unidade equivale a um pacote de fraldas tamanho M.', 'manual', 'cha:fralda-m', 'fralda', 'M'),
  ('Fraldas tamanho G', 'Uma unidade equivale a um pacote de fraldas tamanho G.', 'manual', 'cha:fralda-g', 'fralda', 'G'),
  ('Fraldas tamanho XG', 'Uma unidade equivale a um pacote de fraldas tamanho XG.', 'manual', 'cha:fralda-xg', 'fralda', 'XG'),
  ('Toalha com capuz', 'Uma unidade equivale a uma toalha.', 'manual', 'cha:mimo-toalha-capuz', 'mimo', null),
  ('Aspirador nasal bebê', 'Uma unidade equivale a um aspirador.', 'manual', 'cha:mimo-aspirador-nasal', 'mimo', null),
  ('Toalha fralda', 'Uma unidade equivale a uma toalha fralda. É um mimo, não conta nos tamanhos de fralda.', 'manual', 'cha:mimo-toalha-fralda', 'mimo', null),
  ('Fraldas de boca', 'Uma unidade equivale a uma fralda de boca. É um mimo, não conta nos tamanhos de fralda.', 'manual', 'cha:mimo-fraldas-boca', 'mimo', null),
  ('Kit de escova e pente', 'Uma unidade equivale ao kit completo, não às peças separadas.', 'manual', 'cha:mimo-kit-escova-pente', 'mimo', null),
  ('Cortador de unhas para bebê', 'Uma unidade equivale a um cortador.', 'manual', 'cha:mimo-cortador-unhas', 'mimo', null),
  ('Kit de cuidados para banho', 'Uma unidade equivale ao kit completo, não às peças separadas.', 'manual', 'cha:mimo-kit-banho', 'mimo', null),
  ('Mamadeira Anti Cólica', 'Uma unidade equivale a uma mamadeira.', 'manual', 'cha:mimo-mamadeira', 'mimo', null),
  ('Body manga curta', 'Uma unidade equivale a uma peça.', 'manual', 'cha:mimo-body-curto', 'mimo', null),
  ('Body manga longa', 'Uma unidade equivale a uma peça.', 'manual', 'cha:mimo-body-longo', 'mimo', null),
  ('Macacão', 'Uma unidade equivale a uma peça.', 'manual', 'cha:mimo-macacao', 'mimo', null),
  ('Conjunto pagão', 'Uma unidade equivale ao conjunto completo.', 'manual', 'cha:mimo-conjunto-pagao', 'mimo', null),
  ('Luvas e meias', 'Uma unidade equivale ao par de luvas com o par de meias.', 'manual', 'cha:mimo-luvas-meias', 'mimo', null),
  ('Casaquinho', 'Uma unidade equivale a uma peça.', 'manual', 'cha:mimo-casaquinho', 'mimo', null),
  ('Babadores', 'Uma unidade equivale a um babador.', 'manual', 'cha:mimo-babadores', 'mimo', null),
  ('Manta', 'Uma unidade equivale a uma manta.', 'manual', 'cha:mimo-manta', 'mimo', null),
  ('Cobertor', 'Uma unidade equivale a um cobertor.', 'manual', 'cha:mimo-cobertor', 'mimo', null),
  ('Cueiro', 'Uma unidade equivale a um cueiro.', 'manual', 'cha:mimo-cueiro', 'mimo', null),
  ('Naninha', 'Uma unidade equivale a uma naninha.', 'manual', 'cha:mimo-naninha', 'mimo', null),
  ('Almofada de amamentação', 'Uma unidade equivale a uma almofada.', 'manual', 'cha:mimo-almofada-amamentacao', 'mimo', null),
  ('Ninho redutor', 'Uma unidade equivale a um ninho.', 'manual', 'cha:mimo-ninho-redutor', 'mimo', null),
  ('Babá eletrônica', 'Uma unidade equivale a um aparelho.', 'manual', 'cha:mimo-baba-eletronica', 'mimo', null),
  ('Mordedor', 'Uma unidade equivale a um mordedor.', 'manual', 'cha:mimo-mordedor', 'mimo', null)
on conflict(platform, external_reference) do nothing;

create function public.prepare_family_list(p_event_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.events; p public.products; amount integer; added integer := 0;
begin
  select * into e from public.events where id=p_event_id and owner_id=auth.uid() for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='42501'; end if;
  if e.status='closed' then raise exception 'EVENT_CLOSED'; end if;
  for p in select * from public.products where platform='manual' and external_reference like 'cha:%' and active order by id loop
    if exists(select 1 from public.event_items where event_id=e.id and
      (product_id=p.id or (p.diaper_size is not null and diaper_size=p.diaper_size))) then continue; end if;
    amount := case p.diaper_size when 'P' then 6 when 'M' then 19 when 'G' then 19 when 'XG' then 6 else null end;
    perform public.add_event_item(e.id,p.id,amount);
    added := added+1;
  end loop;
  return added;
end;
$$;
revoke all on function public.prepare_family_list(uuid) from public,anon,service_role;
grant execute on function public.prepare_family_list(uuid) to authenticated;

-- Decisão final: todos os mimos ficam sem cota, inclusive os antes numerados.
update public.event_items set quantity_requested=null where category='mimo' and quantity_requested is not null;
alter table public.event_items add constraint treats_have_no_quota check(category<>'mimo' or quantity_requested is null);
