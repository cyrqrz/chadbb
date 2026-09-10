-- Apenas catálogo fictício para ambiente local. Não inclui preços, imagens ou links.
-- Os identificadores demo: distinguem esses registros de produtos comerciais curados.
insert into public.products (title, description, platform, external_reference) values
  ('Fraldas tamanho P', 'Produto fictício para ensaiar a lista. Uma unidade representa um pacote.', 'manual', 'demo:fraldas-p'),
  ('Fraldas tamanho M', 'Produto fictício para ensaiar a lista. Uma unidade representa um pacote.', 'manual', 'demo:fraldas-m'),
  ('Manta de bebê', 'Produto fictício, sem marca ou loja vinculada.', 'manual', 'demo:manta'),
  ('Toalha de banho', 'Produto fictício, sem marca ou loja vinculada.', 'manual', 'demo:toalha'),
  ('Body de algodão', 'Produto fictício, sem marca ou loja vinculada.', 'manual', 'demo:body'),
  ('Paninhos de boca', 'Produto fictício. Uma unidade representa um conjunto.', 'manual', 'demo:paninhos')
on conflict(platform, external_reference) do nothing;
