# T-B5 — desempenho e atualização entre sessões

2026-09-16. Runner: `tests/load/event-performance.mjs`. Sem argumentos ou com
`--dry-run`, apenas descreve o ensaio; não conecta nem lê credenciais.

## G1 — Revisão e validação local

Dados exclusivamente fictícios: uma conta `@example.test`, um evento futuro,
27 itens, 50 convites individuais e 50 reservas iniciais de mimo ilimitado.
Auth administrativo confirma a conta sem enviar e-mail. Não usa conteúdo real.

Carga aquecida: cinco ondas com 50 requisições concorrentes, iniciadas com
intervalos de pelo menos cinco segundos. Total medido: 225 leituras e 25
alterações de reserva. Preparação não entra no p95. Percentil nearest-rank por
operação, incluindo latência de falhas; qualquer erro reprova e interrompe novas
ondas. Critério: p95 de leitura e de escrita até 2000 ms.

Após a carga, dois contextos independentes de navegador abrem convites
diferentes. Três alterações na quantidade P feitas pela interface da primeira
sessão devem aparecer no saldo da segunda em até 7000 ms. Relógio começa antes
do clique, limite conservador que inclui envio/commit e renderização. Não mede
apenas resposta da API e não força refetch na sessão observadora.

**Limites:** sincronização é medida depois da carga, não durante 50 sessões
ativas. Apenas 25 amostras de escrita; não é garantia estatística ampla nem
mede cold start, diferentes dispositivos ou redes móveis.

Teto: **420 POSTs à Edge guest** incluindo preparação, carga e polling dos
navegadores; não é teto de todas as chamadas HTTP. Além disso há cerca de 60
chamadas Auth/RPC de preparação, GETs de prontidão, assets e preflights CORS.
Cotas normais de IP/global são consumidas e preservadas. A função de rate limit
continua expurgando janelas antigas conforme sua regra normal.

Limpeza após sucesso/falha: conta exclusiva e seus eventos, itens, convites,
sessões, reservas e pedidos; apenas hashes de tokens conhecidos do ensaio em
`guest_rate`. Nunca limpar ou restaurar contadores compartilhados de IP/global.
SIGTERM/SIGINT cooperativos abortam novas chamadas e permitem limpeza; SIGKILL,
queda da máquina ou perda de banco continuam podendo exigir recuperação manual.

### Evidências locais

- Primeiro ensaio: 225 leituras sem erro, p95 **2416 ms**; 25 escritas sem erro,
  p95 **2126 ms**. **Meta de 2 s reprovada**, resultado não descartado.
- Sincronização: **4982 / 5039 / 4956 ms**, dentro de 7 s no cenário local.
- Limpeza confirmou zero nas oito contagens próprias; 364 POSTs guest.
- Revisão pelo `tdd_senior`: detectou ausência de contabilização de erros UI e
  risco de interrupção forçada antes da limpeza. Correções incluíram listeners
  HTTP/rede, gate comum, cancelamento cooperativo e controle dos handlers de
  Vite/Playwright. Teste de interrupção inicial deixou uma conta sintética local
  sem evento, removida por ID após conferência; não houve escrita remota.
- TDD do gate: 5 falhas observadas antes da correção e **12/12** depois, cobrindo
  erro HTTP recuperado, falha de rede, limites e medições inválidas.
- Os testes de gate passam a rodar no CI; os de isolamento entram em `test:api`.

### Revalidação depois da revisão sênior

- Interrupção cooperativa e isolamento: **3/3** aprovados, incluindo SIGTERM
  logo após a criação da conta, com limpeza antes da saída.
- Segunda medição: p95 leitura **930 ms**, escrita **866 ms**; sincronização
  **4960 / 4940 / 4938 ms**. Reprovada pelo instrumento por duas leituras
  canceladas pela própria UI. `GuestPage.mutate` cancela queries em voo antes/
  depois da mutação; separar cancelamento de falha de transporte era necessário.
- Corrigido: somente `read` com `net::ERR_ABORTED` é contabilizado à parte.
  Cancelamento de escrita, erro HTTP, timeout e demais erros de rede reprovam.
  Coleta é congelada antes do teardown para não contar abortos criados ao fechar
  o navegador. **13/13** testes do gate/classificação aprovados.
- Último ensaio completo: **225 leituras, p95 711 ms; 25 escritas, p95 692 ms**;
  zero erros; sincronização **4960 / 4932 / 4965 ms**; duas leituras canceladas
  esperadas; 362 POSTs guest. Critérios locais aprovados. O refinamento posterior
  para limitar a exceção explicitamente a `read` foi validado pelos 13 testes.
- Limpeza do último ensaio: zero em users, events, items, invitations, sessions,
  reservations, requests e token_rates. `npm run check`, lint e diff aprovados.

A variação entre 2416 ms e 711 ms no p95 local está registrada; nenhuma alteração
de performance do backend foi feita. Cada repetição acima validou correção no
instrumento, não foi usada para apagar uma execução reprovada. G1 concluído.

Resultado local não comprova latência da produção; nenhuma meta remota foi
declarada cumprida. G1 valida também a confiabilidade do instrumento, mesmo
quando ele corretamente reprova uma medição.

### Revalidação em 2026-09-17, depois do G3 e da PR #11

- Primeiro ensaio: **reprovado na sincronização, sem nenhuma amostra**. O
  runner procurava textos antigos da tela do convite ("pacotes disponíveis",
  "Vou levar", "Você confirmou…"), que o G3.1 trocou. Nessa execução, a carga
  não teve erros, mas o p95 local foi de **4846 ms** na leitura e **4822 ms**
  na escrita. A limpeza zerou tudo. O resultado fica registrado.
- Correção somente no runner: "N de 6 disponíveis", "Escolher presente" /
  "Atualizar quantidade" e a reserva própria em "Sua reserva".
- Novo ensaio: **225 leituras, p95 1205 ms; 25 escritas, p95 1205 ms**; zero
  erros; sincronização **4838 / 5155 / 5053 ms**; duas leituras canceladas
  esperadas; 363 POSTs guest; limpeza zerada. Critérios locais aprovados.
- `performance-gates` 13/13 e isolamento (`event-performance.integration`) 3/3.
- A variação local (711 → 4846 → 1205 ms) mostra a sensibilidade do ambiente
  Docker/WSL. Não é evidência sobre a produção.
- Cotas da produção: no máximo 420 POSTs, contra 1200/min por IP e 2400/min no
  total. Os convidados reais continuam com pelo menos 1980/min no total.

## G2 — Aprovação e medição remota

Apresentar evidências e dry-run ao titular antes da execução. Comando proposto:

```sh
CHADBB_PERF_REF=fcykqrlnofmdtmewlejr node tests/load/event-performance.mjs --remote
```

Somente o projeto `chadbb-cha`, TLS com CA validada e frontend publicado
`https://chadbb.pages.dev`. Não há migration, reset, deploy ou mudança de cota.
O teste pode reprovar a meta: registrar todos os resultados e investigar a
causa, sem repetir até obter aprovação nem aumentar limites para passar.

### Execução remota em 2026-09-17 (aprovada pelo titular): **reprovada**

- 225 leituras, **p95 4258 ms** (máx. 4347); 25 escritas, **p95 4044 ms**
  (máx. 4276); **zero erros**. Sincronização **6008 / 4984 / 5482 ms**, dentro
  de 7 s. 362 POSTs guest. Limpeza restrita zerada nas oito contagens.
- Meta de 2 s **não cumprida**. O resultado não foi repetido.

### Diagnóstico, só com leitura

- Logs da Edge `guest` (379 POSTs): execução p50 **3160 ms**, p95 **4062 ms**,
  mínimo **211 ms**. As primeiras requisições de cada onda levam cerca de 1,9 s,
  e as seguintes, de 3,2 a 4,0 s. O tempo é gasto dentro da função, não na rede
  até o cliente.
- `pg_stat_statements`: `check_guest_rate` executa em média **2,9 ms** (3495
  chamadas) e `guest_action`, **5,1 ms** (1158). O SQL não é o gargalo.
- Plano **free**, `max_connections` 60, PostgREST com cerca de 11 conexões.
  Cada POST faz **4 idas sequenciais** da Edge ao PostgREST (3 cotas e a ação).
  Com 50 pedidos simultâneos, são cerca de 200 chamadas por onda, enfileiradas
  entre a Edge e o PostgREST (e/ou limites de CPU da Edge no plano free).
- O modelo de carga (50 pedidos no mesmo instante, a cada 5 s) é mais severo
  que 50 convites consultando a cada 5 s de forma espalhada. Isso fica
  registrado, mas **o critério não foi alterado** para passar.

### Próximo passo proposto (G3, com aprovação)

1. Local, com teste antes: reduzir as 4 chamadas por POST a 1. As cotas passam a
   ser conferidas dentro de uma única RPC de servidor, sem mudar as regras nem
   os limites. Comparar com a medição local de referência.
2. Publicar a mudança (migration e Edge `guest`) com gates próprios e repetir o
   ensaio remoto **uma vez**.
3. Se continuar reprovando: avaliar compute maior (plano pago) ou conexão direta
   da Edge ao Postgres pelo pooler, com decisão do titular.

## G3.1 — Uma ida para as cotas (local, 2026-09-17)

- A migration `20260917010000_guest_rates_batch.sql` cria
  `public.check_guest_rates(text[])`, só para `service_role`. Ela confere as
  cotas na mesma ordem (ip → credencial → global) e com a mesma regra de
  `check_guest_rate`: para na primeira recusa, a contagem persiste e as cotas
  seguintes não são consumidas.
- A Edge `guest` passa de **4 para 2 idas** ao PostgREST por POST (cotas e ação).
  A ação **continua em transação separada**. Juntá-la às cotas manteria a linha
  global bloqueada durante toda a ação, criando uma fila entre os convidados, e
  desfaria a contagem quando a ação falhasse.
- A Edge registra no log só os tempos (`rate_ms`, `action_ms`), a ação e o
  status, sem token, IP ou dados do convite, para diagnosticar a próxima
  medição.
- Testes: pgTAP `guest_rates.test.sql` falhou antes da migration (vermelho) e,
  com ela, a suíte inteira passou (**115/115**); portátil 65/65; `test:api`
  26/26. Na primeira rodada completa, os 2 testes de isolamento do T-B5
  falharam; passaram isolados e na rodada completa seguinte, com a porta 5173
  livre. A causa provável é a porta ocupada, **não confirmada**.
- Ensaio local: leituras p95 **412 ms**, escritas p95 **375 ms**, zero erros;
  sincronização **4996 / 4985 / 4991 ms**; limpeza zerada. É só indicativo,
  pela variação do ambiente local.

### G3.2 — Publicação e nova medição (executado em 2026-09-21)

Aprovado pelo titular. Os três passos foram feitos nesta ordem:

1. `db push` com as três migrations de setembro (a de cotas veio junto das de
   18/09, que a unificação das branches trouxe para a mesma árvore). `migration
   list` remoto ficou igual à branch: 24 de cada lado.
2. Deploy só da Edge `guest`, depois de a RPC já estar em produção.
3. Ensaio remoto **uma vez**.

#### Resultado: **reprovado**, com queda de cerca de metade

| Métrica | 2026-09-17 | 2026-09-21 | Meta |
|---|---|---|---|
| Leitura p95 (225 req) | 4258 ms | **2187 ms** (máx. 2359) | ≤ 2000 ms |
| Escrita p95 (25 req) | 4044 ms | **2328 ms** (máx. 2357) | ≤ 2000 ms |
| Erros | 0 | **0** | 0 |
| Sincronização | 6008 / 4984 / 5482 ms | **5532 / 4971 / 5497 ms** | ≤ 7000 ms |
| POSTs guest | 362 | 362 | ≤ 420 |

Zero erros e zero leituras canceladas pela UI. Limpeza restrita zerada nas oito
contagens. **O ensaio não foi repetido** e nenhum limite foi afrouxado.

Leitura do resultado: passar de 4 para 2 idas ao PostgREST cortou 49% da leitura
e 42% da escrita — o diagnóstico de 17/09 estava certo sobre o gargalo. O que
sobra (187 ms na leitura, 328 ms na escrita) é consistente com as 2 idas que
restaram mais o teto de CPU da Edge no plano free, mas isso **não foi medido**:
o cruzamento com `rate_ms`/`action_ms` do log da Edge ficou pendente porque o
CLI desta versão não tem `functions logs`; os tempos estão no painel do projeto.

#### Decisão do titular, conforme o passo 3 do G3

Com o ganho estrutural já colhido, as opções que restam não são de código:

1. **Compute maior** (plano pago) — ataca diretamente o teto de CPU da Edge e o
   `max_connections` 60 do free.
2. **Conexão direta da Edge ao Postgres pelo pooler**, eliminando o PostgREST do
   caminho das cotas.
3. **Aceitar o número medido**, registrando que o modelo de carga (50 pedidos no
   mesmo instante a cada 5 s) é mais severo que 50 convidados reais consultando
   de forma espalhada, e que a sincronização tem folga de 1,5 s.

A terceira não é afrouxar a meta: é decidir, com o número na mão, se a meta
original descreve o uso real do chá.

#### Decisão do titular em 2026-09-21: **aceitar os 2,2 s. T-B5 encerrada.**

O titular decidiu aceitar o resultado medido e não investir em plano pago nem no
pooler. O que sustenta a decisão, e fica registrado para quem reabrir isto:

- O ensaio dispara **50 pedidos no mesmo instante**, cinco vezes. No chá real os
  convidados abrem o convite espalhados ao longo de dias; o cenário medido é o
  pior caso, não o caso típico.
- **Zero erros** em 225 leituras e 25 escritas, nas duas medições remotas.
- A sincronização entre sessões tem **1,5 s de folga** sobre o limite de 7 s.
- O ganho estrutural já foi colhido: 4 → 2 idas ao PostgREST cortou 49% da
  leitura e 42% da escrita. O que resta custa dinheiro ou reescrita.

**A meta de 2 s não foi alterada** — ela continua escrita acima, e a medição
continua registrada como reprovada por 187 ms na leitura e 328 ms na escrita. O
que mudou foi a decisão de não agir sobre essa diferença.

**O que ficou sem medir:** de onde vêm os ~2,2 s. O cruzamento com `rate_ms` e
`action_ms` do log da Edge não foi feito (o CLI não tem `functions logs`; os
números estão no painel). A atribuição ao teto de CPU do plano free é hipótese
herdada do diagnóstico de 17/09, não medição de 21/09. Se o desempenho voltar a
incomodar, **começar por aí** antes de comprar compute.
