# Revisão técnica — 2026-09-14

Conclui os itens 1 a 6 da [análise de retomada](RETOMADA-2026-09-11.md).

## Integração com main

O merge `133be9d` tem como pais `9537446` (`mvp-familiar`) e `c1e12d1`
(`main`), com árvore idêntica à do primeiro pai. A implementação familiar foi
preservada integralmente, incluindo as migrations `20260911000000` e
`20260911010000`. As implementações alternativas de convites da `main` não
foram combinadas com elas.

O teste de login por e-mail da `main` foi recuperado em
`tests/local/email-login.test.mjs`: PKCE real via Mailpit local, persistência da
sessão e logout. Ele não depende das tabelas de convites, portanto não exigiu
alteração de schema. Está incluído na CI.

Os cenários de abuso foram adaptados ao contrato familiar em
`tests/api/guest-abuse.integration.mjs`: origem, preflight, método, tipo de
conteúdo, JSON, limite de 16 KiB contado em bytes e bloqueio por IP mesmo com
credencial diferente. O teste prepara a fronteira da cota no banco local para
não depender de 1200 chamadas dentro de um minuto. A suíte de API roda em série
para não interferir nesse teste. Kong local adiciona CORS `*`; a proteção de
origem é comprovada pelo POST rejeitado com 403.

## Seis migrations novas

| Item | Migration (prefixo 20260914) | Resultado e testes |
| --- | --- | --- |
| 1 | `010000_reservation_quantity_bound` | Constraint de 1 a 1000 por reserva, validação na RPC e na tela; fronteiras, escrita direta e troca que excederia o teto sem perder a origem. |
| 2 | `020000_edit_invitations` | Edição de nome/tipo/capacidade pelo organizador; versão compartilhada com RSVP; impede capacidade abaixo dos confirmados e tipo incompatível. Testes de propriedade, concorrência real, versão obsoleta, encerramento e navegador. |
| 3 | `030000_rsvp_domain_errors` | `RSVP_INVALID_RESPONSE` e `ATTENDING_ABOVE_CAPACITY`, com tradução na interface. Rejeita pending, ausência, fração, texto e combinações inconsistentes sem persistir pedido/versão. Testes de banco e Edge real. |
| 4 | `040000_guest_retention` | Pedidos expurgados após 90 dias e sessões após expiração; índices e job diário `guest-data-retention` no pg_cron. Testes de expurgo, replay recente, privilégios e agendamento real. |
| 5 | `050000_aggregate_guest_snapshot` | Uma agregação por evento para saldos do convidado e painel. Mantém cálculo transacional por item sob bloqueio. Testes de isolamento entre eventos, soma, compra, cancelamento e ensaio de carga local. |
| 6 | `060000_family_list_configuration` | Defaults P/M/G/XG em tabela administrativa privada, inicialmente 6/19/19/6. Remove constraint redundante; código de erro explícito. Testes de configuração, listas existentes, ausência de default e rollback. |

O teto de 1000 é proteção técnica por reserva, não uma cota comercial agregada
por convite ou evento. Se houver reserva existente acima dele, a migration falha
para permitir correção explícita; não altera quantidades silenciosamente.

A edição exige `p_action='update'` e payload com `id`, `version`, `name`, `kind`
e `capacity`. Edição, RSVP, revogação e rotação avançam a versão do convite.
A listagem inclui essa versão. O evento deve estar publicado para editar.

Pedidos anteriores à migration de retenção recebem a data de aplicação, porque
não havia timestamp confiável. A idempotência é garantida durante a retenção de
90 dias; depois dela, continuam valendo as verificações de versão. O job roda
às 03:17 no fuso configurado no cron (padrão UTC). PostgreSQL portátil não tem
pg_cron; a stack Supabase valida o agendamento.

Os defaults podem ser alterados por SQL administrativo em
`private.family_list_defaults`; não há permissão de escrita pelo cliente ou
service_role. Alterações afetam somente futuras inclusões. O UPDATE no-op da
migration histórica `20260911020000` foi mantido no histórico já aplicado;
a função vigente não o repete e a constraint redundante foi removida pela
nova migration, preservando a bicondicional que garante mimos sem cota.

## Validação executada

| Comando | Resultado |
| --- | --- |
| `npm run check` | Lint, TypeScript, 40 testes unitários e build aprovados |
| `npm run test:db:portable` | 42 testes em PostgreSQL real, migrations desde banco vazio |
| `supabase migration up --local` | Seis migrations aplicadas sobre o schema familiar existente |
| `npm run db:test` | 41 verificações pgTAP aprovadas, incluindo job de retenção |
| `npm run test:api` | 10 testes aprovados com Auth, Storage, PostgREST e Edge reais |
| `npm run test:browser:local` | 3 cenários aprovados: desktop, celular e edição concorrente |
| `npm run test:email:local` | PKCE, persistência e logout aprovados via Mailpit local |
| `npm run test:e2e` | 16 testes aprovados |
| `npm run test:load:local` | 250 requisições sem falhas; resultados abaixo |

Carga: 50 convidados na mesma rede, 27 itens, 50 reservas. Cinco ondas com
intervalo de cinco segundos, cada uma com 45 leituras e cinco alterações de
reserva. Latência medida do início da chamada HTTP até leitura do JSON.

| Operação | Amostras | p50 | p95 | Máximo |
| --- | --- | --- | --- | --- |
| Todas | 250 | 391 ms | 701 ms | 770 ms |
| Leitura | 225 | 401 ms | 701 ms | 770 ms |
| Reserva | 25 | 383 ms | 692 ms | 706 ms |

Este é um ensaio curto na stack Docker local, não uma medição de produção ou
comparação antes/depois. A meta local de p95 abaixo de 2 s foi atendida; o ambiente
publicado ainda precisa do próprio ensaio.

## Compatibilidade de implantação

A sequência resultante serve para banco vazio ou banco que já usa o schema
`mvp-familiar`. Um banco que tenha aplicado as migrations alternativas da `main`
com as mesmas versões exige migração de dados/schema específica antes de usar
esta sequência. O merge Git não reconcilia o histórico de um banco existente.
Nenhuma alteração foi aplicada em banco remoto.
