# Contratos transacionais — catálogo e reservas

Referência de escopo vigente: [MVP familiar](PLANO-EXECUCAO-MVP.md). Os números
de etapas abaixo pertencem ao plano histórico; reservas correspondem agora ao marco M4.

2026-09-09. Contratos implementados da etapa 3 e contratos propostos para etapas 4–5.
Erros são códigos de domínio, sem tokens, endereços ou dados de outros convidados.
Funções de organizador retornam uma linha com `.single()` na chamada PostgREST.

## Implementados

| Operação | Entrada | Ator e resultado | Erros de domínio |
| --- | --- | --- | --- |
| `add_event_item` | `p_event_id`, `p_product_id`, `p_quantity` inteiro 1–10000 nas fraldas e `null` nos mimos | `auth.uid()` proprietário; retorna item | `EVENT_NOT_FOUND`, `EVENT_CLOSED`, `INVALID_QUANTITY`, `DIAPER_LIMIT_REQUIRED`, `TREAT_HAS_NO_LIMIT`, `DIAPER_SIZE_ALREADY_LISTED`, `PRODUCT_UNAVAILABLE`, `ITEM_ALREADY_EXISTS` |
| `set_event_item_quantity` | `p_event_id`, `p_item_id`, `p_version`, `p_quantity` com a mesma regra por categoria | Proprietário; retorna item com nova versão | Acima quando aplicável; `ITEM_NOT_FOUND`, `ITEM_VERSION_CONFLICT`, `QUANTITY_BELOW_COMMITTED`, `RESERVATION_INTEGRATION_REQUIRED` |
| `transition_event` | `p_event_id`, `p_version`, `p_status` | Proprietário; retorna evento com nova versão | `EVENT_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_TRANSITION`, `PUBLICATION_INVALID` |

Lista: evento `FOR SHARE` → item `FOR UPDATE`. Adição também estabiliza o produto
com `FOR SHARE` antes de inserir o item. O par evento/produto é único; repetição de
inclusão com mesma quantidade devolve a linha atual, sem somar. Com quantidade
diferente, informa item já existente. Isso não é idempotência de reserva e não
reconstitui uma resposta histórica se a quantidade tiver sido editada depois.

Edição usa versão obrigatória, recusa evento encerrado e não altera vínculos.
Contagem de comprometimento ocorre depois do bloqueio do item. Não há exclusão
nem escrita direta de itens pelos clientes ou `service_role`.

Encerramento: evento `FOR UPDATE`; transição `published` → `closed`, sem reabertura.
Publicação: `draft` → `published`, título não vazio e data futura. Bloqueios de
edição/adição da lista são incompatíveis com o encerramento.

## Fraldas e mimos no protocolo da lista

`products.category` (`fralda`/`mimo`) e `products.diaper_size` (`P`/`M`/`G`/`XG`)
são explícitos no cadastro e imutáveis. `add_event_item` copia os dois para o item;
a cópia não desvia porque os dois lados são imutáveis, e torna declarativas as
duas regras que o convidado sente na tela:

| Regra | Como o banco garante | Erro |
| --- | --- | --- |
| Fralda sempre tem limite de pacotes | `event_items_limit_matches_category` | `DIAPER_LIMIT_REQUIRED` |
| Mimo nunca tem limite: quantidade fica `NULL` | a mesma bicondicional | `TREAT_HAS_NO_LIMIT` |
| Um tamanho ocupa um único item por evento | `event_items_event_size_idx` | `DIAPER_SIZE_ALREADY_LISTED` |
| Categoria e tamanho do item não mudam | `private.stamp_event_item` | `ITEM_IDENTITY_IMMUTABLE` |

`NULL` é a ausência de limite; zero e números artificialmente altos ficam proibidos
pelas restrições. Mimo não recebe número porque um limite ali apareceria como
"esgotado" ao convidado, contrariando a decisão revisada em
[FRALDAS-E-MIMOS](FRALDAS-E-MIMOS.md). O teto de 10000 é limite técnico de entrada,
não cota comercial por convite.

`private.committed_quantity` continua por item, e item de fralda é item de tamanho:
o comprometimento por tamanho sai da mesma função quando a etapa de reservas
substituí-la. Mimos somam quantidade prometida sem saldo nem estado de esgotado.
A troca de tamanho da etapa de reservas envolve dois itens: ordenar os bloqueios
por identificador estável, sem inverter a ordem evento → itens → reservas.

## Versão e relógio garantidos pelo banco

`version` e `updated_at` de `events` e `event_items` são impostos por trigger, não
pela função que escreve. Qualquer UPDATE — inclusive uma correção administrativa
por SQL — avança a versão e grava o relógio da transação, descartando os valores
enviados. Sem isso, uma correção direta mudava o dado sem mudar a versão e a aba
já aberta salvava por cima sem receber `VERSION_CONFLICT`. Consequência aceita:
um backfill em massa invalida as abas abertas, que é o comportamento correto
quando o dado realmente mudou.

Identidade é imutável depois do cadastro: `EVENT_IDENTITY_IMMUTABLE` para `id`,
`owner_id`, `type` e `created_at`; `ITEM_IDENTITY_IMMUTABLE` para `id`, `event_id`,
`product_id` e `created_at`; `PRODUCT_IDENTITY_IMMUTABLE` também cobre `id` e
`created_at`, além de plataforma e referência externa. Todos com `errcode 23514`.

`service_role` lê `events`, `event_items` e `products`, mas não escreve em
`events` nem em `event_items`: o protocolo transacional não é contornável pela
chave de servidor. Retenção e correção de dados exigirão função própria e auditável.
`products` continua com escrita administrativa e passou a registrar `updated_at`.

Cobertura: `tests/database/events.integration.mjs` e `supabase/tests/versioning.test.sql`.

## Propostos para implementação com convites e reservas

Nomes abaixo são contratos de planejamento, **não funções já disponíveis**.

| Operação SQL de servidor | Entrada confiável | Resultado | Erros principais |
| --- | --- | --- | --- |
| `reserve_item` | Hash da credencial de sessão, item, quantidade positiva, chave UUID de idempotência | ID, item, quantidade, estado e criação da reserva | `GUEST_SESSION_INVALID`, `EVENT_NOT_PUBLISHED`, `ITEM_NOT_FOUND`, `INVALID_QUANTITY`, `INSUFFICIENT_QUANTITY`, `IDEMPOTENCY_CONFLICT` |
| `cancel_reservation` | Hash da sessão e ID da reserva | Reserva em `cancelled`; repetição devolve estado atual | `GUEST_SESSION_INVALID`, `RESERVATION_NOT_FOUND`, `ACTION_NOT_ALLOWED` |
| `declare_purchase` | Hash da sessão e ID da reserva | Reserva em `purchase_declared`, explicitamente autodeclarada | Acima; `INVALID_RESERVATION_STATE` |

A Edge Function valida payload/origem e aplica limites compartilhados. A identidade
e o evento são resolvidos pelo servidor a partir da sessão; o navegador não escolhe
convite, proprietário ou convidado. Verificar expiração/revogação a cada operação.
Funções de servidor não são executáveis por `anon` nem `authenticated`.

Reserva: evento `FOR SHARE` → item `FOR UPDATE` → idempotência → total comprometido
→ inserção, tudo na mesma transação. Chave única por convite; comparação inclui item
e quantidade. Mesmo payload devolve resultado anterior; payload diferente conflita,
inclusive entre itens distintos. Conflito de unicidade deve recuperar a linha vencedora.

Cancelamento e declaração: evento → item → reserva, validando convite proprietário.
Estados `reserved` e `purchase_declared` consomem quantidade; `cancelled` libera uma
única vez. Declarar reserva cancelada é inválido. Clique de loja não altera estado.

A etapa 5 substituirá `private.committed_quantity` na mesma migration que criar
`reservations`, somando apenas estados comprometidos. A função provisória retorna
zero somente enquanto a tabela não existe; com tabela presente falha explicitamente.
Não é evidência de proteção contra excesso de reservas. Executar os cenários
concorrentes do plano com conexões independentes e início coordenado.

Duração de sessão, limites por convite e ações depois de encerramento ainda seguem
as propostas do contrato do piloto. Resolver essas decisões antes de implementar os
respectivos fluxos. Até lá, nenhuma exceção de encerramento está habilitada.

## Extensão planejada — fraldas e mimos

A [especificação familiar](FRALDAS-E-MIMOS.md) exige categoria explícita e saldos
independentes. Fraldas: limites P 6, M 19, G 19 e XG 6; mimos: quantidade por item
sem consumo de fraldas. Não inferir categoria por nome de produto. Essas regras
ainda precisam de implementação e não estão cobertas pelos contratos existentes.

Unidade confirmada: pacotes. Todos os mimos ficam sem limite comercial, por
convite e no total do evento, inclusive os originalmente numerados. Os números
originais não participam da validação de disponibilidade. Representar ausência de limite de forma
explícita e atualizar schema, RPCs, tipos e telas; não contornar quantidade positiva
com zero ou um saldo fictício. Troca de tamanho usa transação única, idempotência
e bloqueios ordenados, preservando a reserva anterior em falha do destino.
