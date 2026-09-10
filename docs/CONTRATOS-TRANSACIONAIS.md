# Contratos transacionais — catálogo e reservas

2026-09-09. Contratos implementados da etapa 3 e contratos propostos para etapas 4–5.
Erros são códigos de domínio, sem tokens, endereços ou dados de outros convidados.
Funções de organizador retornam uma linha com `.single()` na chamada PostgREST.

## Implementados

| Operação | Entrada | Ator e resultado | Erros de domínio |
| --- | --- | --- | --- |
| `add_event_item` | `p_event_id`, `p_product_id`, `p_quantity` inteiro 1–10000 | `auth.uid()` proprietário; retorna item | `EVENT_NOT_FOUND`, `EVENT_CLOSED`, `INVALID_QUANTITY`, `PRODUCT_UNAVAILABLE`, `ITEM_ALREADY_EXISTS` |
| `set_event_item_quantity` | `p_event_id`, `p_item_id`, `p_version`, `p_quantity` | Proprietário; retorna item com nova versão | Acima quando aplicável; `ITEM_NOT_FOUND`, `ITEM_VERSION_CONFLICT`, `QUANTITY_BELOW_COMMITTED`, `RESERVATION_INTEGRATION_REQUIRED` |
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
