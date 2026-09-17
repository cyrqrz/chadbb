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

## Exclusão de evento (2026-09-17)

Implementado em `20260917000000_delete_event.sql`. Validado no Supabase local (G4) e publicado no
`chadbb-cha` em 2026-09-17: migration aplicada (G5), `delete-event` v1 e
`retention` v2 (G6). A Edge só aceita
as origens de `GUEST_ALLOWED_ORIGINS`, que em produção lista apenas
`https://chadbb.pages.dev`. O preview fica de fora de propósito, porque usa o banco real. O front chama a Edge Function;
a RPC fica exposta a `authenticated` porque a Edge a executa com o JWT do próprio
organizador.

| Operação | Entrada | Ator e resultado | Erros de domínio |
| --- | --- | --- | --- |
| Edge `delete-event` (POST) | `Authorization: Bearer <JWT do organizador>`; corpo `{ "event_id": uuid, "version": inteiro }` | `200` com `{ event_id, items_removed, invitations_removed, reservations_removed, storage_cleanup }`; `storage_cleanup` é `done` ou `pending` | `401 AUTH_REQUIRED`, `404 EVENT_NOT_FOUND`, `409 EVENT_VERSION_CONFLICT`, `409 EVENT_NOT_DELETABLE`, `400 INVALID_PAYLOAD`, `403 ORIGIN_DENIED`, `503 TEMPORARILY_UNAVAILABLE` |
| `delete_event` | `p_event_id uuid`, `p_version integer` | `security definer`, só o dono (`auth.uid()`); retorna o mesmo `jsonb`, sempre com `storage_cleanup: pending` | `AUTH_REQUIRED` (42501), `EVENT_NOT_FOUND` (42501), `EVENT_VERSION_CONFLICT` (P0001), `EVENT_NOT_DELETABLE` (P0001) |

Ajustes em relação à proposta:

- **A capa não sai pela RPC.** O Supabase bloqueia `DELETE` direto em
  `storage.objects` (`storage.protect_delete`), e apagar só a linha deixaria o
  arquivo órfão. A RPC registra a pasta `<owner_id>/<event_id>` em
  `private.event_deletions`. A Edge remove os arquivos dos buckets
  `event-public` e `event-private` pela API de Storage logo em seguida. Se isso
  falhar, a resposta continua `200` com `pending`, e a Edge `retention` repete
  no cron diário. A pasta é registrada mesmo sem capa, porque um envio
  concorrente pode ter gravado um arquivo. Um arquivo usado como capa por outro
  evento é preservado, pela mesma regra da retenção.
- **Não dono, inexistente e `null`** recebem o mesmo `EVENT_NOT_FOUND`, como nas
  demais RPCs, para não revelar que o evento existe. Uma repetição depois da
  exclusão também recebe `EVENT_NOT_FOUND`.
- **Versão antes do estado.** Com versão ausente ou antiga, a resposta é
  `EVENT_VERSION_CONFLICT`, mesmo se o evento estiver publicado. A tela recarrega
  e passa a mostrar o estado real. `EVENT_NOT_DELETABLE` vale para `published`.
  Evento `closed` já expurgado pela retenção pode ser excluído.
- `guest_action` agora devolve `GUEST_SESSION_INVALID` quando o convite ou o
  evento some enquanto a ação espera o bloqueio. Antes, a abertura do convite
  terminava em erro SQL de `NOT NULL`. A regra não mudou.

Transação única. Ordem dos bloqueios: evento `FOR UPDATE` → convites
`FOR UPDATE` → exclusões. A ação de convidado em curso termina antes e entra na
contagem; a que chega depois recebe `GUEST_SESSION_INVALID`. A exclusão apaga,
nesta ordem: respostas registradas (`guest_requests`), reservas (inclusive
canceladas), sessões, convites, itens e o evento. O catálogo e a conta do
organizador permanecem.

Auditoria (LGPD): `private.event_deletions` guarda o identificador técnico do
evento, a data, o estado anterior e as contagens (itens, convites, respostas,
reservas, sessões, arquivos removidos, falhas de limpeza). Não guarda nomes,
títulos ou endereços. A pasta só fica guardada até a limpeza terminar. Nenhum
cliente lê a tabela, nem a `service_role`. A `service_role` só executa
`event_deletion_pending`, `event_deletion_storage_done` e
`event_deletion_storage_failed`.

Cobertura: `supabase/tests/delete_event.test.sql` (permissões, dono, estado,
versão, cascata, fila da capa, auditoria),
`tests/database/events.integration.mjs` (concorrência com convidado, evento
expurgado) e `tests/api/delete-event.integration.mjs` (Edge, Storage real,
falha e nova tentativa pela retention).

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

### Encerramento e pós-evento implementados (conferência em 2026-09-16)

O protocolo disponível é `public.guest_action`, acessado pela Edge `guest`;
os nomes individuais da tabela acima continuam históricos, não são RPCs públicas.
O organizador encerra explicitamente com `transition_event`; a passagem de
`starts_at`/`ends_at` não encerra automaticamente o evento. A data de confirmação
de 18/10 é conteúdo do convite, sem bloqueio automático de RSVP no schema atual.

| Ação com evento `closed` | Comportamento implementado |
| --- | --- |
| Abrir/reabrir convite e consultar | Permitido com convite/sessão válidos |
| Nova reserva, alteração de quantidade, troca de tamanho e RSVP | `EVENT_CLOSED` |
| Informar compra de reserva existente | Permitido; quantidade continua comprometida |
| Cancelar reserva ou compra informada | Permitido; libera quantidade uma vez |
| Informar compra de reserva cancelada | `INVALID_RESERVATION_STATE` |
| Repetir pedido já confirmado com mesma chave/payload | Resultado anterior e snapshot atual, sem nova mutação |
| Consultar painel do organizador | Permitido; reservas canceladas ficam fora da lista comprometida |

O prazo é `private.invitations.expires_at`, gerado no banco como
`events.starts_at + interval '7 days'`; não é sete dias depois do clique em
encerrar nem de `ends_at`. Sessões duram no máximo duas horas e nunca ultrapassam
a validade do convite. Revogação/expiração bloqueiam inclusive leitura, compra,
cancelamento e replay. O front não recalcula esses prazos.

Cobertura em `tests/database/events.integration.mjs`: leitura/reabertura após
encerrar, mutações bloqueadas, compra/cancelamento, replay e expiração. Os testes
de concorrência existentes verificam a ordem dos bloqueios contra encerramento.
Este registro descreve o comportamento existente; não altera a política remota.

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
