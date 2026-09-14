# Operação administrativa do catálogo

A manutenção inicial ocorre por SQL, com conta administrativa restrita do banco
(SQL Editor do projeto de desenvolvimento ou conexão administrativa autorizada).
Organizadores leem o catálogo e montam listas; não podem cadastrar/editar produtos.
Não existe painel administrativo e não se coloca credencial privilegiada no frontend.

## Cadastrar e manter produtos

Campos obrigatórios: título, plataforma e referência externa estável. Plataformas:
`amazon`, `mercado_livre`, `shopee` e `manual`. A última atende produtos genéricos sem
loja vinculada e ensaios fictícios. Não sugere comissão ou compra verificada.
Referência e plataforma são imutáveis; correção de identidade exige novo produto.

Exemplo para desenvolvimento, sem links nem conteúdo de terceiros:

```sql
begin;
insert into public.products (title, description, platform, external_reference)
values ('Manta de bebê', 'Descrição escrita pela operação, com conteúdo autorizado.',
        'manual', 'interno:manta-001')
returning id;
commit;
```

Defina claramente a unidade na descrição (pacote, conjunto ou peça). Quantidades
na lista são unidades desse produto, sem conversão automática de embalagens.

```sql
-- Troque o UUID pelo produto revisado.
update public.products
set title = 'Manta de bebê — unidade', description = 'Uma manta por unidade.'
where id = '00000000-0000-4000-8000-000000000000';

-- Retirar do catálogo preserva listas existentes e impede novas inclusões.
update public.products set active = false
where id = '00000000-0000-4000-8000-000000000000';
```

Cada revisão grava `updated_at` automaticamente; o valor enviado na escrita é
descartado. `id`, `created_at`, `category` e `diaper_size` entram na regra de
identidade imutável junto com plataforma e referência externa.

Não exclua produtos referenciados: a FK bloqueia essa operação. Não altere o
significado de um produto já escolhido; desative-o e cadastre o substituto.
Nenhuma migration contém produtos comerciais. O catálogo do chá — 4 tamanhos de
fralda e os 23 mimos — entra por `20260911020000_family_catalog.sql` e vale em
todos os ambientes; `supabase/seed.sql` fica vazio para não duplicar a lista.

## Categoria, tamanho e limites

Todo produto declara `category` (`fralda` ou `mimo`). Fraldas declaram também
`diaper_size` (`P`, `M`, `G`, `XG`); mimos deixam o tamanho nulo. A categoria é
explícita no cadastro e **nunca** inferida pelo título: "Toalha fralda" e
"Fraldas de boca" são mimos. Categoria e tamanho entram na identidade imutável,
junto com plataforma e referência externa — mudá-los transferiria saldos entre
tamanhos ou categorias sem passar por reserva nenhuma.

```sql
insert into public.products (title, description, platform, external_reference, category, diaper_size)
values ('Fraldas tamanho P', 'Uma unidade equivale a um pacote.', 'manual', 'cha:fralda-p', 'fralda', 'P');
insert into public.products (title, description, platform, external_reference, category)
values ('Mordedor', 'Uma unidade equivale a um mordedor.', 'manual', 'cha:mimo-mordedor', 'mimo');
```

Limite é por evento, não por produto: fica em `event_items.quantity_requested` e
o organizador define pelas operações da lista. Fralda **sempre** tem limite de
pacotes; mimo **nunca** tem, e o valor fica `NULL` — a restrição
`event_items_limit_matches_category` impede as duas inversões. Um número num mimo
viraria cota fantasma e apareceria como "esgotado" ao convidado, contrariando a
decisão registrada em [FRALDAS-E-MIMOS](FRALDAS-E-MIMOS.md).

Cada tamanho ocupa um único item por evento (`event_items_event_size_idx`): dois
produtos "P" na mesma lista criariam dois saldos para o mesmo limite de 6 pacotes.
Tentar isso devolve `DIAPER_SIZE_ALREADY_LISTED`. O mesmo tamanho em outro evento
é um limite legítimo e independente.

Valores confirmados para o chá: P 6, M 19, G 19, XG 6 — 50 pacotes no total.

## Links oficiais e aprovação de destinos

`private.partner_hosts` e `private.product_links` ficam fora da API pública, sem
acesso de `anon`, `authenticated` ou `service_role`. A operação SQL administrativa
mantém essas tabelas. Elas começam vazias: nenhum parceiro está aprovado.

Antes de incluir um link, produto/operação deve registrar evidência da aprovação
por parceiro: uso da aplicação, geração oficial do link, domínio e caminho de
saída, redirecionamentos do parceiro, imagens, preços e rastreamento permitidos.
Validar um domínio tecnicamente não comprova elegibilidade comercial.

1. Registre o hostname exato e minúsculo, sem esquema, porta ou curingas, e a
   referência da aprovação em `private.partner_hosts`.
2. Cadastre o produto na plataforma correspondente.
3. Grave a URL HTTPS gerada oficialmente e a referência da revisão por produto.
   O trigger verifica a autoridade exata e o vínculo com a plataforma.
4. Não use URLs fornecidas pelo convidado, encurtadores genéricos ou endpoints de
   redirecionamento com destino arbitrário. A revisão deve conferir o link completo.

Modelo deliberadamente fictício: substituir apenas por valores já aprovados.
Não executar este modelo para habilitar um parceiro sem revisão.

```sql
begin;
insert into private.partner_hosts(platform, hostname, approval_reference)
values ('amazon', 'loja.example.test', 'registro-interno-da-aprovacao');
insert into private.product_links(product_id, url, approval_reference)
values ('00000000-0000-4000-8000-000000000000',
        'https://loja.example.test/produto', 'registro-da-revisao-do-link');
commit;
```

URLs HTTP, credenciais, portas, fragmentos, controles, barra invertida e hosts
parecidos são rejeitados no banco. O servidor não busca URLs nem oferece
redirecionador. A interface desta etapa não recebe nem abre links de lojas.
Não são exibidos preços ou imagens de produtos sem autorização.

Revogação: excluir o link revisado ou remover o hostname de aprovação. Na futura
projeção para convidados, o servidor deverá verificar a aprovação vigente a cada
consulta; não bastará confiar na validação feita no cadastro. Não habilitar saída
para lojas até implementar essa verificação e revisar o parceiro correspondente.

## Operação da lista e integridade

`event_items` só admite leitura direta. `add_event_item` e
`set_event_item_quantity` são as operações autorizadas do organizador. Nem a chave
de servidor possui permissão para editar ou excluir itens diretamente. Manutenção
extraordinária por SQL exige preservar as regras transacionais e revisar referências.
Não há remoção de item nesta etapa; zero não é uma forma de exclusão.

O limite técnico inicial é 10.000 unidades por item, não um limite por convite.
A versão detecta edições concorrentes. A implementação de reservas substituirá
`private.committed_quantity`; a função atual bloqueia alterações se detectar
`reservations` sem essa integração. O aceite de concorrência com reservas continua
obrigatório na etapa 5.
