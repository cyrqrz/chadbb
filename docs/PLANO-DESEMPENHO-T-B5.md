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

**Ainda não executado nem aprovado remotamente.** A autorização anterior foi
para a T-B4. Este gate é específico de carga e sincronização T-B5.
