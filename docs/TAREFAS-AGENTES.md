# Tarefas e combinados entre agentes

## Em andamento — 2026-09-24

Codex na branch temporária `codex/convite-rsvp-mimos`: instruções no cabeçalho
do convite, mimos compactos e prazo de Talvez com lembrete por e-mail. G1:
contrato e testes locais; G2: implementação e revisão; G3: evidências locais;
G4: revisão do diff antes de commit/push e aprovação de migration, segredos,
agendamento e deploy remotos. Nenhuma publicação faz parte dos gates locais.

Quadro compartilhado entre o Claude e o Codex. **Desde 2026-09-21 os dois
trabalham na mesma branch, a `clone-main`** — as antigas `claude/front` e
`codex/back` foram unificadas nela e apagadas, e o remoto tem só `main` e
`clone-main`. **Desde 2026-09-22 não há mais divisão por área de arquivo:** os
dois trabalham juntos no projeto inteiro, e quem pega a tarefa a leva até o fim,
front e back. Faça `git pull` antes de começar e `git pull --rebase` antes de
commitar. Regras em `AGENTS.md`.

As seções "Claude — front", "Codex — back", "Pedidos do front para o back" e
"Pedidos do back para o front" abaixo são a organização antiga. Ficam como
histórico e como lista de pendências: o que ainda está `- [ ]` continua valendo
como tarefa, seja de quem for.

A unificação juntou a G4b.3 do front com a T-B5 e a migration
`20260917010000_guest_rates_batch` do back. Evidências na branch unificada:
`npm run check` verde, pgTAP **8 arquivos / 153 testes**, `test:browser:local`
**8/8** contra o Supabase local. Com as três migrations de setembro na mesma
branch, o `db push` no `chadbb-cha` deixou de estar bloqueado pela ordem — ele
continua sendo gate manual, com dry-run e aprovação do titular.

Formato de pedido: `- [ ] AAAA-MM-DD · origem → destino · pedido (arquivos/contrato envolvidos)`

## Situação em 2026-09-23

T-B5 encerrada por decisão do titular em 21/09; não é gate pendente.
T-B6 em andamento: sete backups agendados consecutivos passaram (16–22/09).
Desconexão de Workers Builds confirmada pelo titular no painel em 23/09,
após a API retornar 403. Falta validar a ausência do check em novo PR/commit.
Restauração com dados e Storage reais aguarda o conteúdo do titular.
Evidências: [revisão T-B6](reviews/2026-09-23-t-b6.md).

## Situação em 2026-09-16 (histórico)

Convites, presença e reservas (M3/M4) já estão implementados e implantados no
`chadbb-cha`, e o backup diário está ativo. Login real do titular liberado e
T-B1 a T-B4 concluídas nesta sessão. Restam terminar o front (visual e
acessibilidade) e comprovar desempenho/operação no ambiente real. Algumas caixas de
`PLANO-EXECUCAO-MVP.md` estão desmarcadas, mas o código já cobre parte delas
(ex.: consulta a cada 5 s e "Atualizando…"). Antes de implementar, confira o que
já existe.

Retomada do Codex: gate remoto T-B5, conforme `PLANO-DESEMPENHO-T-B5.md`.
Claude segue no painel e visual (T-F2 e T-F1). Titular assumiu como organizador;
o ensaio familiar no celular continua pendente.

## Claude — front

- [x] **2026-09-17 · Codex → Claude · Revisão G3/G3.1: corrigir quantidade no convite.**
  _(Feito em `4dc63ae`, PR #9, com o foco mantido durante o envio.)_
  Em `GuestPage.tsx`, bloquear `QuantityField` durante envio (regressão) e
  preservar a versão inicial do rascunho ao continuar digitando depois de uma
  atualização concorrente (preexistente, inclusive versão `null`).
  Correção e testes preparados em
  [patch](reviews/2026-09-17-claude-front.patch); reprodução e evidências em
  [revisão](reviews/2026-09-17-claude-front.md). Base: `2f321dc`.
- [x] **2026-09-17 · Codex → Claude · Tela de exclusão de evento.**
  _(Feito no PR #11, publicado depois do G6: botão no card de “Seus eventos”, só
  rascunho e encerrado, confirmação no card. As contagens de convites e reservas
  não aparecem na confirmação porque a lista de eventos não tem esses números;
  o texto diz que convites, respostas e reservas serão apagados.)_ O back está
  publicado no `chadbb-cha` em 2026-09-17 (migration e Edge `delete-event`).
  O front chama a Edge Function `delete-event` (POST), com o JWT do organizador,
  enviando `{ event_id, version }`. Pode usar `supabase.functions.invoke('delete-event', { body })`.
  Não chame a RPC `delete_event` direto: nesse caminho a capa só é removida no
  cron diário. Sucesso `200`: `{ event_id, items_removed, invitations_removed,
  reservations_removed, storage_cleanup: 'done' | 'pending' }`. Erros em
  `{ error }`: `EVENT_NOT_DELETABLE` (409, evento publicado: encerrar antes),
  `EVENT_VERSION_CONFLICT` (409: recarregar e confirmar de novo),
  `EVENT_NOT_FOUND` (404: já excluído ou sem acesso), `AUTH_REQUIRED` (401),
  `INVALID_PAYLOAD` (400), `TEMPORARILY_UNAVAILABLE` (503: pode repetir).
  Oferecer a ação só para `draft` e `closed`. Pedir confirmação explícita com as
  contagens de convites e reservas que serão apagados, e dizer que não há como
  desfazer. `pending` não é erro: o evento já foi excluído. Depois do sucesso,
  invalidar as consultas e sair da tela do evento. O deploy do back (G6) já foi feito,
  então o botão pode entrar na `main` com a CI verde. No preview a Edge
  responde `ORIGIN_DENIED` de propósito, porque só `https://chadbb.pages.dev` é
  liberado. Use o backend simulado nos e2e. Contrato completo em
  `CONTRATOS-TRANSACIONAIS.md`, seção "Exclusão de evento".
- [x] **2026-09-17 · Codex → Claude · Entrar com código do e-mail (urgente).**
  _(Já implementado: `src/features/auth/LoginPage.tsx` tem o campo "Código de
  8 dígitos" com `verifyOtp`. Esta linha estava desatualizada.)_
  O titular não conseguiu entrar: pediu o link num navegador e o abriu em outro
  (o Safari do iPhone). O PKCE só funciona no navegador do pedido. Nos logs do
  Auth, o `/verify` deu 303 e nenhum `/token` foi chamado. O e-mail passa a
  trazer um **código de 8 dígitos**, além do link (modelo
  `supabase/templates/acesso.html`, já validado localmente).
  - Em `/entrar`, depois do envio, mostrar o campo "Código de 8 dígitos"
    (`inputmode="numeric"`, `autocomplete="one-time-code"`) e o botão
    "Entrar". O e-mail já digitado fica preservado.
  - Chamar `supabase.auth.verifyOtp({ email, token, type: 'email' })`. No
    sucesso, ir para `/eventos`.
  - Erros: código errado ou expirado (`otp_expired` ou 403) → "Código inválido
    ou expirado. Peça um novo."; limite de tentativas (429) → pedir para esperar.
    O código vale 1 h e só uma vez; um pedido novo invalida o anterior.
  - Textos: o envio passa a dizer "Enviamos um código e um link para seu
    e-mail". O link continua valendo no mesmo navegador.
  - Bug em `/auth/callback`: quando a troca do código falha e ao mesmo tempo
    chega outro evento de sessão (por exemplo, `SIGNED_OUT` de uma sessão
    antiga), `AuthProvider` descarta o erro, e a tela mostra só "Solicite um
    novo link". Mostrar a mensagem específica: abrir no mesmo navegador ou usar
    o código.
  - Pedido de link/código: desabilitar o botão durante o envio e, após o envio,
    mostrar contagem regressiva de 60 s antes de permitir outro pedido (o Auth
    recusa com 429 antes disso). Em 17/09 houve ~15 pedidos em 12 s.
    Mensagem de 429 deve dizer quanto esperar, sem prometer liberação imediata.
  - Testes: `tests/local/email-code.test.mjs` já cobre o back (código em outro
    cliente, código errado e reúso). Se o texto do botão mudar, ajustar
    `tests/local/email-login.test.mjs`. Limite local: 2 e-mails por hora.
- [x] **2026-09-17 · Usuário → Claude · Refazer o visual do convite (prioridade alta).**
  _(Concluído em 2026-09-22: cabeçalho, mapa, sistema de cards e movimento já
  vieram do G3/G3.1; o cartão de calendário com `.ics`, único pedaço que
  faltava, foi feito por último — ver `CalendarCard` em `GuestPage.tsx`.)_
  Pedido do titular, com capturas de 17/09. Vale para `GuestPage.tsx`,
  `styles.css` e componentes de `src/components/ui`. Nada aqui muda contrato:
  todos os dados já vêm de `snapshot` (`guest_action`).
  - **Cabeçalho.** Dar mais evidência ao nome do convidado: hoje ele aparece
    dentro de uma frase, em corpo de texto. Promovê-lo na hierarquia (ex.:
    saudação com o nome em destaque acima ou abaixo do título do evento),
    sem perder o título. Reorganizar "Quando" e "Onde" com ritmo e alinhamento
    mais claros; hoje ficam soltos abaixo do texto.
  - **Cartão de data ao lado.** Onde hoje há o bloco "01 / Novembro", entregar
    um cartão de calendário de verdade: dia da semana, dia, mês, horário e
    **"Adicionar ao calendário"**. Gerar um `.ics` no próprio navegador
    (`Blob` + `URL.createObjectURL`, sem servidor e sem CSP nova) e, opcional,
    link para Google Agenda. Usar `starts_at`/`ends_at` do snapshot, fuso
    `America/Sao_Paulo`; não recalcular prazos. Quando houver capa, ela
    continua no lugar do cartão.
  - **Local com mapa.** Em "Local e instruções", mostrar um mapa. Ver as
    ressalvas do Codex abaixo antes de escolher a solução; manter sempre o
    botão "Abrir no mapa" e o endereço em texto.
  - **Presença, presentes e mimos.** Aplicar o mesmo sistema de cartões:
    hierarquia igual entre os cartões, espaçamento consistente, estados
    (reservado, completo, compra informada) legíveis sem depender só de cor.
    Hoje os cartões de fralda variam de altura e as ações secundárias
    ("Trocar tamanho", "Já comprei", "Cancelar reserva") competem com a ação
    principal.
  - **Movimento.** Animações discretas no hover/focus dos cartões e botões
    (elevação e borda, 120–200 ms). Respeitar `prefers-reduced-motion` e nunca
    animar layout que cause deslocamento ao ler. Foco visível continua igual.
  - **Acessibilidade e responsivo (não regredir):** 320 px com texto a 200%,
    alvos de 44 px, contraste AA, teclado e leitor de tela. Conferir no iPhone,
    onde os campos de data hoje cortam (pedido separado).
  - **Testes:** ampliar os e2e do convite e rodar `npm run check` antes do PR.

  **Mapa: decisão do titular em 2026-09-17 — carregar só depois do clique.**
  O endereço é dado privado do convite, então nada sai para terceiros sem ação
  do convidado.
  - Estado inicial: endereço em texto, o botão "Abrir no mapa" que já existe e
    um botão novo, "Ver o mapa aqui", com aviso curto de que isso abre um
    serviço externo (ex.: "carrega o OpenStreetMap com este endereço").
  - Só no clique, inserir o iframe. Preferir **OpenStreetMap**
    (`https://www.openstreetmap.org/export/embed.html?...`), com
    `loading="lazy"`, `referrerpolicy="no-referrer"`, `title` descritivo e
    altura fixa para não deslocar a página. Sem cookies nem scripts de terceiro.
  - Nada de carregar o mapa automaticamente, nem prefetch, nem `<link rel>`
    para o serviço antes do clique.
  - CSP em `public/_headers`, revisada pelo Codex: acrescentar
    `frame-src https://www.openstreetmap.org;` mantendo o resto igual,
    inclusive `frame-ancestors 'none'`. Se a escolha mudar para o Google,
    a regra passa a ser `frame-src https://www.google.com https://maps.google.com`.
    Alterar só essa diretiva; qualquer outra mudança na CSP volta ao Codex.
  - Registrar na tela que o endereço é do convite e não deve ser repassado.
- [x] **2026-09-17 · Codex → Claude · Erro de envio do link aparece como "conexão".**
  _(Feito em 2026-09-22. `sendFailure` em `LoginPage.tsx` trata 500 e
  `unexpected_failure` antes de cair no texto genérico, e o caso não liga a
  contagem regressiva — falha de envio não é limite de tentativas, então pedir
  de novo continua liberado. Teste em `login.spec.ts` confere o texto novo e a
  ausência da palavra "conexão".)_
  Se o Auth não consegue enviar o e-mail, `/auth/v1/otp` responde **500**
  `unexpected_failure` ("Error sending confirmation email"). Hoje isso acontece
  com qualquer endereço que não seja o da conta Resend, porque o remetente é o
  de testes `resend.dev`. `errorMessage` cai no texto genérico "Confira sua
  conexão". Mapear esse caso em `/entrar` para algo como "Não conseguimos
  enviar o e-mail para este endereço. Confira o e-mail ou fale com a
  organização.". Visto nos logs em 17/09, 15:24–17:12 UTC.
- [x] **2026-09-17 · Codex → Claude · Voltar à página pedida depois do login.**
  _(Feito em 2026-09-22, em `src/features/auth/destination.ts`. `RequireAuth`
  passa o caminho pedido; o retorno consome o destino uma vez só. A passagem é
  por `localStorage`, não pelo estado do router, porque o link do e-mail pode
  abrir noutra aba. `safeInternalPath` recusa `//host`, `/\host`, esquemas e as
  próprias telas de login, para não virar redirecionamento aberto — 10 testes de
  unidade e 4 de navegador, incluindo um destino externo plantado à força.)_
  `RequireAuth` manda para `/entrar` e, depois do login, `AuthCallback` vai
  sempre para `/eventos`. Guardar o destino (caminho interno, só do mesmo
  site, nunca uma URL externa) antes de pedir o link e voltar para ele no
  retorno. Exemplo: `/eventos/:id/convites` aberto sem sessão.
- [x] **2026-09-17 · Codex → Claude · Fonte bloqueada pela CSP.**
  _(Já corrigido: `public/_headers` tem `font-src 'self' data:`. Esta linha
  estava desatualizada.)_
  Console em `/entrar`: `font-src` bloqueia `data:font/woff2;base64,…`. O Vite
  embute trechos pequenos das fontes Manrope/Fraunces como `data:`, e
  `public/_headers` só tem `default-src 'self'`. Acrescentar
  `font-src 'self' data:` à CSP (ou impedir que o build embuta fontes) e
  conferir no console da produção que o aviso sumiu.
- [x] **2026-09-17 · Usuário → Claude · Campos de data cortados no iPhone.**
  _(Já corrigido: a regra sugerida está em `src/styles.css`. Esta linha
  estava desatualizada.)_
  No Safari do iOS, "Data e horário" e "Término" (`EventPage.tsx:108-109`,
  `type="datetime-local"`) passam da margem direita da tela (captura do titular,
  2026-09-17). Com a aparência nativa, o WebKit ignora `width: 100%`. Correção
  sugerida em `styles.css`, junto de `.field input`:
  `.field input:is([type="datetime-local"],[type="date"],[type="time"]) { -webkit-appearance: none; appearance: none; display: block; max-width: 100%; }`
  e `.field input::-webkit-date-and-time-value { text-align: left; min-height: 1.5em; }`.
  O `min-height` evita que o campo vazio encolha. Conferir em 320 px, com o
  campo vazio e preenchido, e o seletor nativo continuando a abrir.
- [x] **T-F1 · Visual e estados das telas (M1).** _(2026-09-16: componentes comuns
  em `src/components/States.tsx`; mergeado no PR #7.)_ Em `GuestPage`, `GiftListPage`,
  `InvitationsPage` e `EventPage`: estados de vazio, carregando, sucesso e erro com
  o mesmo acabamento; uma ação principal por etapa ("Confirmar presença",
  "Escolher presente", "Cancelar reserva"); explicar que "Já comprei" é só uma
  declaração do convidado.
- [x] **T-F2 · Painel do organizador.** _(2026-09-16: resumo, fraldas, mimos e
  escolhas separados. 2026-09-22: T-B7 publicado em produção — `summary`,
  `available` e `invitation_id` já existem de verdade. Limpeza concluída em
  2026-09-22: `panelSummary` e `availableOf` removidos de
  `src/features/guests/api.ts`, `summary`/`available`/`id`/`invitation_id`
  tipados como obrigatórios e o selo "Vai enviar presente" agora casa reserva
  com convite por `invitation_id`, não mais por nome. O front deixou de ter
  qualquer cálculo próprio desses números.)_ Conferir se o `InvitationsPage` mostra
  convites respondidos separados de pessoas confirmadas, fraldas comprometidas e
  disponíveis por tamanho (P 6 / M 19 / G 19 / XG 6) e mimos em separado. Se
  faltar dado, registrar um pedido para o Codex abaixo; não calcular no front.
- [x] **T-F3 · Acessibilidade (M5).** _(Substancialmente coberto pelo G5:
  `test:e2e` roda axe em convidado, organizador e `/amostras`; G5.4 corrigiu
  A14/A16/A18; A19 já estava coberto desde o G3.1. Teclado/foco, 320 px a
  200%, alvos de 44 px e movimento reduzido são guardados por testes em quase
  toda tela. Não reabrir sem achado novo.)_ Teclado e foco (visível, previsível, retorno
  após diálogos); 320 px com texto a 200%; áreas de toque de 44 px; movimento
  reduzido; avisos ao leitor de tela sem repetir tudo a cada atualização.
- [x] **T-F4 · Contrato de atualização no front (M2).** _(G5.3: estado sem
  conexão com banner global e aviso antes de tentar salvar nos quatro pontos
  de gravação principais — ver `docs/design/G5-ESTADOS.md`. "Salvo" vs. "painel
  ainda não atualizado" já era coberto por `RefreshStatus`/`SlowRefresh`
  desde antes do G5; nunca sobrescrever o que está sendo digitado é a regra 7
  do `AGENTS.md`, já respeitada em todos os formulários, inclusive a edição
  de convite.)_
- [x] **T-F5 · Prévia do link no WhatsApp.** _(2026-09-16, G3: tags `og:` e imagem
  genérica `public/og-image.png`; prévia por evento fica para depois do MVP.)_ Prévia genérica bem apresentada
  (meta tags em `index.html`). Prévia personalizada por evento é opcional.
- [x] **T-F7 · Refatoração visual (plano em `docs/design/PLANO-VISUAL.md`).**
  **Completo e publicado.** Gates G0–G5.6, todos feitos: G0/G1 (PR #7), G2/G2.1
  (PR #8), G3/G3.1 (PR #9), G4/G4-b (painel e lista), G5.1–G5.5 (`ConfirmDialog`,
  skeleton, estado sem conexão, acessibilidade A14/A16/A18, QA final — detalhes
  em `docs/design/G5-ESTADOS.md`). G5.6: `main` publicado em 2026-09-22
  (fast-forward de `clone-main`, commit `8f8e9ab`), site conferido no ar em
  `chadbb.pages.dev` sem erros de console. Por cima do G5, o último pedaço do
  pedido de 17/09 (cartão de calendário com `.ics`) também saiu e foi publicado
  junto. Congelamento a partir de 05/10 segue valendo: só correções até 01/11.
- [x] **2026-09-22 · Claude · Corrigida a instabilidade de `gift-list-qa.spec.ts:264`.**
  `o realce da linha é só para quem usa mouse` falhava no projeto `desktop`.
  Primeiro diagnóstico ERRADO, registrado aqui para não se repetir: chamei de
  falha determinística porque falhou três vezes seguidas, inclusive isolada no
  HEAD `abc71b9` limpo. Uma quarta rodada passou — eram três amostras de uma
  falha frequente, não prova de determinismo.
  Causa real, medida pelo `console.log` do próprio teste: na rodada que falha o
  fundo sai `rgba(0, 0, 0, 0)` em repouso **e** sob o ponteiro; nas que passam
  vira `rgb(248, 238, 241)`. O repouso transparente descarta a hipótese de o
  ponteiro já estar sobre a linha. O que corre é a leitura: o navegador aplica
  o `:hover` no hit-test do quadro seguinte ao movimento, e o teste lia o estilo
  computado uma vez só, logo depois do `hover()`. Sob carga o quadro atrasa e a
  leitura pega a cor de repouso. O CSS (`.item-rows > li:hover` dentro de
  `@media (hover: hover)`) está correto e não foi tocado.
  Correção no teste: o ramo com mouse espera o realce com `expect.poll`; o sem
  mouse dá dois quadros de folga antes de afirmar que o realce não veio.
  Conferido com teste de mutação — removendo a regra de realce do `styles.css`,
  o `desktop` volta a falhar e o `mobile` continua passando, então a asserção
  não ficou vazia.
- [ ] **2026-09-22 · Claude · Observar `gift-list.spec.ts:142` no `mobile`.**
  `lista de mimos cabe em 320 px sem rolagem horizontal` falhou uma vez, na
  suíte completa, e passou 3/3 isolada depois. Só uma amostra e a evidência do
  Playwright foi apagada pela rodada seguinte, então não afirmo causa nenhuma —
  fica anotado para olhar se reaparecer. Não tem relação com a T-F2: o arquivo
  e a tela não foram tocados. _(2026-09-23: sem reprodução em 123 execuções
  sob carga — 60 do teste de largura e 63 dos dois arquivos de presentes no
  `mobile`, `--workers=8`. Sem evidência, o teste não foi alterado.)_
- [ ] **T-F6 · Testes.** Ampliar os testes e2e para o que mudar; `npm run check`
  antes de cada PR.

## Codex — back e tarefas difíceis

- [x] **2026-09-17 · Login por código no e-mail.** _(G3, a tela do front, já
  está implementada — esta linha estava desatualizada.)_ G1 local concluído:
  - modelo `supabase/templates/acesso.html` e `config.toml` com código de 8
    dígitos, igual à produção;
  - `tests/local/email-code.test.mjs` passou antes em vermelho e depois em verde;
  - `test:email:local` continua passando.

  G2 concluído em 2026-09-17: o titular aplicou o modelo no `chadbb-cha` com
  `scripts/auth/email-templates.mjs --apply`. Uma nova prévia, só leitura,
  confirmou 4 campos iguais ao repositório (sha256 `f7a2d46df7f0`, código de 8
  dígitos, validade de 1 h). O e-mail real já traz o código e o link. Pendente:
  G3, a tela do Claude (pedido acima); até lá, entrar pelo link no mesmo
  navegador em que foi pedido.
  Em 2026-09-17 o limite de e-mails do Auth subiu de 2 para 10 por hora no
  projeto (`rate_limit_email_sent`), aplicado pelo titular e conferido por
  leitura; o valor 2 bloqueou o login após dois pedidos. Mantido o
  intervalo de 60 s por e-mail (`smtp_max_frequency`).
- [x] **2026-09-17 · Exclusão de evento (`delete_event` + Edge `delete-event`).**
  G1–G6 concluídos (detalhes em "Concluídas"). Testado pelo botão na produção
  em 2026-09-17: dois eventos excluídos (um encerrado e um rascunho). Os registros
  em `private.event_deletions`, conferidos só com leitura, trazem as contagens e
  a limpeza do Storage concluída, sem falhas. **Não liberar o preview**
  (`claude-front.chadbb.pages.dev`) em `GUEST_ALLOWED_ORIGINS`: ele usa o banco
  de produção e viraria uma segunda porta para os convites reais.
  Códigos: `AUTH_REQUIRED`, `EVENT_NOT_FOUND`, `EVENT_VERSION_CONFLICT`,
  `EVENT_NOT_DELETABLE`.
- [x] **T-B1 · SMTP pelo Resend no Auth do `chadbb-cha`.** Bloqueio principal:
  sem ele o organizador não entra. Validar um login real pelo link de e-mail
  depois. **Gate:** escrita remota; mostrar o plano e aguardar aprovação.
  Depende do usuário: conta Resend no e-mail do organizador (decisão em
  `PROXIMOS-PASSOS-M6.md`, "Sem domínio próprio no piloto").
- [x] **T-B2 · Testes de convite que faltam (M3).** Acesso cruzado, revogação,
  expiração, reabertura do link e contagem de pessoas ao alterar a resposta.
- [x] **T-B3 · Encerramento e regras pós-evento (M4).** Último item aberto das
  reservas.
- [x] **T-B4 · Validação pela API real (M2).** Criar, editar e publicar evento e
  lista, incluindo tentativa de outro usuário acessar ou alterar os dados.
  **Gate:** smoke test remoto.
- [x] **T-B5 · Metas no ambiente do evento.** _(Encerrada em 2026-09-21 por decisão
  do titular.)_ Medição remota final: leitura p95 **2187 ms** e escrita **2328 ms**
  (meta 2000), **zero erros**, sincronização 5532/4971/5497 ms (limite 7000), 362
  POSTs guest, limpeza zerada. A Edge com `check_guest_rates` cortou 49% da leitura
  e 42% da escrita em relação a 17/09. O titular aceitou os 2,2 s: o ensaio dispara
  50 pedidos no mesmo instante, cenário mais severo que o uso real. A meta não foi
  alterada; o que se decidiu foi não agir sobre a diferença. Detalhes e o que ficou
  sem medir em `PLANO-DESEMPENHO-T-B5.md`.
- [ ] **T-B6 · Operação.** Acompanhar a sequência diária do backup; depois do
  conteúdo real, refazer a restauração com dados e Storage reais e medir o RTO
  (meta de 2 h); remover a integração órfã "Workers Builds" na Cloudflare.
  _(Handoff escrito para o Codex em 2026-09-22:
  [HANDOFF-CODEX-T-B6](HANDOFF-CODEX-T-B6.md). As três partes são independentes:
  a observação dos backups não depende do conteúdo real: sete execuções
  agendadas passaram de 16 a 22/09. A desconexão de Workers Builds foi
  confirmada pelo titular no painel em 23/09 e validada no PR #23 e na `main`
  (`8c16661`): Pages e CI passaram sem o check. Oito backups agendados passaram
  até 23/09. A restauração com dados e Storage reais depende do titular.
  Evidências em [revisão T-B6](reviews/2026-09-23-t-b6.md).)_
- [x] **T-B7 · Pedidos do front.** _(Publicado em produção em 2026-09-22 — ver
  "Pedidos do front para o back" abaixo. `summary`, `available` e
  `invitation_id` já respondem de verdade; falta só o Claude limpar o cálculo
  de transição do front, registrado em T-F2.)_

## Usuário

- [x] Criar a conta Resend no e-mail do organizador e repassar a chave (T-B1).
  Titular assumiu como organizador e validou o login em 2026-09-16.
- [ ] Juntar o conteúdo real: local, instruções e imagem autorizada.
- [ ] Ensaio com o irmão e um convidado, no celular e no navegador do WhatsApp
  (meta: 2–4 de outubro).

## Pedidos do front para o back

**T-B7 publicado em produção em 2026-09-22** (`db push` aprovado pelo titular;
`migration list` remoto igual ao local, 26/26). Os cinco pedidos abaixo estão
todos respondidos de verdade pelo banco, não mais por dry-run:
`organizer_invitations` devolve `summary` (convites, pessoas e
`diapers: {committed, limit}`), `available` em cada item (painel e snapshot do
convidado) e `id`/`invitation_id` em cada reserva. Revogação/expiração
preservam respostas e escolhas, portanto continuam nas contagens, com
revogados informados separadamente. Contrato em `CONTRATOS-TRANSACIONAIS.md`;
evidências em [T-B7](reviews/2026-09-22-t-b7.md).
**Lado do front (T-F2): feito em 2026-09-22.** Os fallbacks `panelSummary` e
`availableOf` saíram de `src/features/guests/api.ts`, os campos do contrato
viraram obrigatórios no tipo e o selo “Vai enviar presente” passou a casar
reserva com convite por `invitation_id`. Com isso o painel distingue homônimos
em vez de omitir o selo, e nenhuma tela recalcula saldo ou resumo.

- [x] 2026-09-17 · Claude → Codex · **`invitation_id` nas reservas do painel.**
  _(Publicado em produção em 22/09, ver nota acima.)_ O painel marcava quem
  respondeu “não poderá ir” e mesmo assim tinha presente reservado só pelo
  **nome** do convidado, porque `organizer_invitations` devolvia as reservas
  sem identificador. Com dois convites de mesmo nome, o selo ficava de fora
  nos dois. Front ainda não trocou o vínculo por `invitation_id` (T-F2).

- [x] 2026-09-16 · Claude → Codex · **Resumo do painel calculado no servidor (T-F2).**
  _(Publicado em produção em 22/09.)_ `organizer_invitations` (ação `list`)
  agora inclui
  `summary: { invitations: { total, answered, yes, no, maybe, pending, revoked }, people_confirmed }`,
  com a regra definida só no banco. Registrado em `docs/CONTRATOS-TRANSACIONAIS.md`.
- [x] 2026-09-16 · Claude → Codex · **Saldo por item vindo do servidor (T-F2).**
  _(Publicado em produção em 22/09.)_ `available` (inteiro ≥ 0; `null` para
  mimos) em cada item de `organizer_invitations.items` e de `snapshot.items`
  da função `guest`. Front ainda não removeu o cálculo de transição (T-F2).
- [x] 2026-09-16 · Claude → Codex · **`id` nas reservas do painel.**
  _(Publicado em produção em 22/09.)_ `reservations` agora traz `id` da
  reserva em cada item.

- [x] 2026-09-16 · Claude → Codex · **Progresso geral das fraldas (T-F7).**
  _(Publicado em produção em 22/09.)_ `summary.diapers: { committed, limit }`
  (soma de todos os tamanhos) já aparece no painel.

- [x] 2026-09-16 · Claude → Codex · **Deadlock intermitente no teste de navegador.**
  _(Resolvido em 2026-09-23: `cleanupUsers` apagava convites antes de bloquear
  o evento, na ordem inversa da `guest_action`. Reproduzido de forma
  determinística em `tests/database/cleanup.integration.mjs` e corrigido no
  helper; o produto não mudou. Ver [revisão T-B6](reviews/2026-09-23-t-b6.md), G5.)_
  Em `npm run test:browser:local` (PR #7, commit `7746e9c`), o teste “M5: outro
  convite e fragmento inválido na mesma aba…” falhou uma vez com
  `deadlock detected`; passou isolado e em duas rodadas completas seguidas.
  Suspeita: a limpeza dos dados fictícios (`cleanupUsers` em
  `tests/support/local.mjs`) concorrendo com uma chamada da função `guest`
  ainda em andamento (sessão ou `guest_requests`). Pedido: investigar e tornar
  a limpeza ou a função resistentes a isso.

- [ ] 2026-09-16 · Usuário → Codex · **Depois do MVP: outras formas de entrar.**
  No MVP o organizador entra só pelo link por e-mail. Para o produto, avaliar
  login com Google/Apple e cadastro com nome (ideia do usuário a partir de
  referências de mercado). Não bloqueia o chá de 01/11; o front só muda depois
  que o Auth estiver pronto.

- [x] 2026-09-17 · Claude → Codex · **Reservar as portas do Supabase local no
  WSL — aplicado pelo usuário.** `npm run db:start` falhou uma vez com
  `failed to bind host port 0.0.0.0:54322/tcp: address already in use`, sem
  nenhum processo ouvindo a porta e sem container de pé. Causa: o
  `net.ipv4.ip_local_port_range` do WSL é `32768 60999`, então 54321/54322 podem
  ser entregues como porta efêmera de saída — o pull das imagens abriu muitas
  conexões e uma delas pegou a 54322 no instante do `bind`. A segunda tentativa
  subiu os 12 containers e aplicou as 21 migrations. O usuário já fixou
  `net.ipv4.ip_local_reserved_ports = 54320-54330` nesta máquina, ativo e
  persistido em `/etc/sysctl.d/99-supabase.conf`. Conferido em 2026-09-17:
  reserva ativa no kernel, 12 containers de pé e 21 migrations aplicadas.

- [x] 2026-09-17 · Claude → Codex · **Documentar a reserva de portas no
  `README.md`.** _(Feito em 2026-09-22, na seção "Se `db:start` falhar com
  `address already in use`", logo abaixo do `db:start`. Com o fim da divisão
  por área, o `README.md` deixou de ser exclusivo do Codex.)_ Junto dos comandos `db:*`: 54321 e 54322 caem na faixa efêmera
  do WSL (`net.ipv4.ip_local_port_range` = `32768 60999`), então
  `npm run db:start` pode falhar com `address already in use` sem nenhum
  processo ouvindo a porta. A saída é reservar a faixa
  (`net.ipv4.ip_local_reserved_ports = 54320-54330`, em
  `/etc/sysctl.d/99-supabase.conf`). Atinge qualquer máquina nova do projeto;
  o diagnóstico completo está no item acima. `README.md` é área do Codex.

- [x] **2026-09-18 · Claude → Codex · Revisar a migration das etapas de configuração.**
  _(Revisão concluída em 22/09; etapas e isolamento conferidos em PostgreSQL
  descartável. Correções R2/R3 da lista registradas abaixo e ainda pendentes.)_
  Com o limite do Codex esgotado, o usuário autorizou o Claude a fazer esta parte
  do back: `supabase/migrations/20260918000000_event_setup_steps.sql` (colunas
  `guests_done_at`/`gifts_done_at` em `events`, backfill dos eventos em uso e RPC
  `set_event_step`) e `supabase/tests/event_steps.test.sql`. Contrato em
  `CONTRATOS-TRANSACIONAIS.md`. Pedido: revisar quando voltar. **O `db push` já foi
  feito** em 2026-09-21, com aprovação do titular: as três migrations de setembro
  estão em produção e o `migration list` remoto ficou igual à branch (24 de cada
  lado). Resta a revisão do código das duas migrations, que continua sendo do Codex.
  Na mesma leva, a pedido do usuário: `20260918010000_list_item_removal.sql`
  (`remove_event_item`, que recusa item com reserva ativa, e `add_custom_treat`,
  com o mimo próprio como produto `manual` preso ao evento por `products.event_id`;
  a política de leitura de `products` e `add_event_item` foram refeitas para esse
  produto não vazar para outros eventos). Teste em `supabase/tests/list_items.test.sql`.

- [x] **2026-09-18 · Usuário → Claude/Codex · Mapa do convite: decisão mudou.**
  _(Concluído; conferido em 2026-09-22. O embed está em `GuestPage.tsx`, o
  “Como chegar” abre a rota, e a CSP que faltava revisar está correta — só
  `frame-src https://www.google.com https://maps.google.com`, com teste em
  `tests/headers.test.ts`. Nada pendente do lado do back.)_
  O titular decidiu que o convite mostra o mapa já carregado e interativo, sem
  clique. Substitui a decisão de 17/09 ("carregar só após o clique", registrada
  na `codex/back`). Implementado com o embed do Google
  (`https://www.google.com/maps?q=…&output=embed`, `referrerpolicy="no-referrer"`,
  altura fixa) e "Como chegar" para a rota. Consequência aceita: o endereço vai
  ao Google ao abrir o convite. CSP: só `frame-src https://www.google.com
  https://maps.google.com` (a alternativa já revisada pelo Codex), com teste em
  `tests/headers.test.ts`. Pedido ao Codex: conferir a CSP quando voltar.

## Pedidos do back para o front

- [x] **2026-09-22 · Codex → Claude · Investigar teste de estabilidade visual.**
  _(Resolvido em 2026-09-23. Reproduzido sob carga: 5/100 com `--workers=8`,
  sempre `[279, 271]`, nos dois testes de “Seus eventos”. Os 8 px são a `rise`
  dos cards (`translateY(8px)`): mesmo com movimento reduzido, sob carga a
  animação ainda não tinha começado na primeira amostra. `watch` agora espera
  as animações de entrada terminarem antes de medir; a asserção não mudou.
  Depois: 160/160 no mesmo estresse e 234/234 no `panel.spec.ts`. Mutação
  (aviso sem espaço reservado) continua reprovando 5/5 com `[239, 271]`.
  O `Execution context was destroyed` citado abaixo não reapareceu.)_
  `panel.spec.ts:1755` falhou no desktop (posição 279 → 271) na suíte completa
  e isoladamente. Cópias instrumentadas ficaram estáveis; possível medição da
  animação inicial, ainda sem causa comprovada. Conferir sincronização antes de
  medir a reconsulta; não remover a asserção. Evidências na
  [revisão de 22/09](reviews/2026-09-22-retomada.md).
  Mais evidência (2026-09-22, à tarde): na mesma suíte `describe('reconsulta
  sem tremida', ...)`, outros dois testes (`detalhes do evento no celular:
  reconsulta não mexe no formulário` e `painel: resposta rápida não pisca
  "Atualizando painel…"`) falharam juntos numa rodada completa com
  `Execution context was destroyed, most likely because of a navigation` —
  sintoma diferente do de cima, mesmo bloco. Os dois passaram isolados de
  primeira. Reforça que é sensibilidade à carga da máquina rodando a suíte
  inteira, não um teste específico; não investigado a fundo.

- [x] **2026-09-22 · Codex → Claude · R1: proteger a prévia do cabeçalho contra
  perda de edição.** _(Corrigido em `fbbbcb1`.)_ Em `EventLayout.tsx:42`, “Ver como
  o convidado vê” continuava navegável quando o editor tinha alterações não
  salvas, embora “Ver prévia” no editor estivesse desabilitado. Reproduzido em
  Chromium: alterar título, abrir a prévia pelo cabeçalho, voltar → texto
  perdido, sem confirmação ou salvamento. Evidência em
  [revisão de 22/09](reviews/2026-09-22-retomada.md).
  `EventLayout` passou a manter o estado de rascunho pendente e expô-lo via
  `Outlet context`; `EventPage` sincroniza e limpa esse estado ao salvar, trocar
  de evento ou desmontar. Com edição pendente, o link de prévia e as três abas
  do cabeçalho (Painel/Presentes/Dados) pedem `window.confirm` antes de sair;
  sem alteração, nada muda. `BackLink` ("Seus eventos") ficou fora do escopo.
  Testes novos em `organizer.spec.ts` cobrem cancelar (mantém tela e rascunho),
  confirmar (navega) e ausência de dirty (navega direto), na prévia e numa aba.
  `npm run check` e a suíte Playwright completa (463 passed) verdes.


- [x] 2026-09-16 · Codex → Claude · Usuário relata que “Conheça o chadbb”
  parece não fazer nada. _(Resolvido em algum gate do T-F7; conferido em
  2026-09-22. O CTA da `HomePage.tsx` é “Começar a organizar” → `/entrar`, ou
  “Ir para seus eventos” com sessão: é um `Link`, não uma âncora. `#como-funciona`
  virou só `id` de seção, sem link apontando para ele, e o aviso “Convites estão
  em preparação” não existe mais no código.)_ `HomePage.tsx` apontava para
  `#como-funciona`, seção já visível na captura enviada. Rever CTA para tornar
  claro o próximo passo de criar/acessar evento, inclusive autenticado; corrigir
  o aviso desatualizado “Convites estão em preparação”.

## Pendências encontradas na revisão de 22/09

- [x] **Codex · R2: identidade de mimos na inclusão pelo catálogo.** Mimo próprio
  seguido de produto homônimo do catálogo duplicava o nome; a ordem inversa era
  recusada. **Publicado em produção em 22/09**, em
  `20260922000000_list_identity_and_lock_order.sql`: regra única de nomes nos
  três caminhos, lista pronta pula homônimo e replay preservado inclusive em
  listas com duplicatas legadas.
- [x] **Codex · R3: ordem dos locks de produto/item.** Inclusão e remoção do mesmo
  mimo próprio por RPC podiam entrar em deadlock (`40P01` reproduzido com duas
  conexões). **Publicado em produção em 22/09**, na mesma migration: inclusão e
  remoção bloqueiam o evento `FOR UPDATE` antes de produto/item.

Detalhes, escopo e limites em [revisão de 22/09](reviews/2026-09-22-retomada.md).
As duas migrations de 18/09 permanecem intactas. Evidências das correções em
[R2/R3](reviews/2026-09-22-r2-r3.md). `db push` aplicado com aprovação do
titular; `migration list` remoto igual ao local (26/26).

## Em andamento

_(Desde 2026-09-22 os dois trabalham na mesma pasta, sem clone por agente —
ver `AGENTS.md`. A tabela abaixo reflete o fim do dia de 22/09.)_

| Agente | Tarefa | Situação |
|---|---|---|
| Claude | T-F7 e T-F2 completas. T-F2 fechada em 22/09: fallbacks removidos, campos obrigatórios, selo por `invitation_id`. Depois dela, corrigida a instabilidade de `gift-list-qa.spec.ts:264` (corrida de leitura do `:hover`, não bug de CSS). Próximos: os itens de 17/09 ainda abertos — mensagem de "conexão" no envio do link e voltar à página pedida depois do login | livre para a próxima tarefa |
| Codex | R2/R3 e T-B7 publicados em produção (22/09, com aprovação do titular). Livre para a próxima — candidatos no quadro: T-B6 (operação/backup), login por código no e-mail (falta a tela do front, já é item do Claude), ou os pedidos urgentes de 17/09 que são do back | livre para a próxima tarefa |

## Concluídas

- 2026-09-22 · Claude · Cartão de calendário no convite (último pedaço do
  pedido de 17/09 "Refazer o visual do convite").
  - `src/lib/ics.ts`: `buildIcs` (gera um VEVENT no formato RFC 5545, com
    escape de `;`, `,` e quebra de linha, e dobra de linha em 75 octetos) e
    `googleCalendarUrl`. Testado por unidade em `tests/ics.test.ts` (5 casos).
  - `CalendarCard` em `GuestPage.tsx`, no lugar do bloco `.invite-art` que só
    mostrava dia/mês — agora dia da semana, dia, mês, horário, botão
    "Adicionar ao calendário" (baixa o `.ics` via `Blob` +
    `URL.createObjectURL`, sem servidor e sem CSP nova) e o link opcional
    "Google Agenda" (`<a target="_blank">`, nenhuma diretiva de CSP entra em
    jogo porque não é `fetch`/`iframe`). Só aparece sem capa, como pedido.
  - O snapshot do convidado não traz `ends_at` (só o organizador tem); em vez
    de pedir mudança de contrato para uma conveniência de exibição, o `.ics`
    usa 3 h de duração padrão quando falta o término — documentado no código
    como decisão do front, não regra de negócio (regra 6 do `AGENTS.md`).
  - Testes novos em `tests/e2e/guest.spec.ts`: baixa o `.ics` com o conteúdo
    certo, o link do Google Agenda tem as datas certas, e o cartão não
    aparece quando há capa. Achado no caminho: o teste do A18 (G5.4) tinha
    uma corrida própria (contava a mesma leitura inicial da montagem como se
    já fosse a leitura pós-mudança) — corrigido para comparar com a contagem
    antes da mudança, não com zero.
  - `npm run check` e `npm run test:e2e` completo: **485 passed, 3 skipped**,
    sem regressão.

- 2026-09-22 · Claude · G5.5: QA final do plano visual — **o G5 está pronto**
  (`docs/design/G5-ESTADOS.md`).
  - `npm run check` verde; `npm run test:e2e` completo: 479 passed, 3
    skipped (duas falhas numa rodada anterior confirmadas como a
    instabilidade já conhecida de "reconsulta sem tremida" sob carga, não
    relacionadas ao G5 — passaram isoladas).
  - `npm run test:browser:local`: **8/8**, contra o Supabase local de
    verdade que o Codex deixou de pé nesta sessão, já com as migrations
    R2/R3 e T-B7 aplicadas localmente — primeira vez que o G5 é validado
    contra o banco real, não só o backend simulado dos e2e.
  - Build de produção medido: `dist` com 1,0 MB (≈700 KB JS/CSS; o resto são
    todos os subconjuntos de fonte, dos quais só os do português chegam ao
    navegador real).
  - Revisei também as duas migrations que o Codex deixou commitadas
    localmente nesta pasta compartilhada (R2/R3 e T-B7): sem achado,
    evidência própria em `docs/reviews/2026-09-22-r2-r3.md` e
    `2026-09-22-t-b7.md`. Sem `db push` ainda nesta entrada — publicação
    remota aconteceu depois, ver G5.6 abaixo.

- 2026-09-22 · Claude · G5.6: publicação em `main` + `db push` de R2/R3/T-B7 —
  **o plano visual e as entregas do back desta sessão estão todos no ar.**
  - `main` avançado por fast-forward puro de `clone-main` (sem merge, sem
    conflito: `origin/main` era ancestral direto, zero commits exclusivos),
    commit `8f8e9ab`. Cloudflare Pages publicou automaticamente.
  - Site conferido no ar com um navegador real (`chadbb.pages.dev`): `/` e
    `/entrar` carregam sem erro de console, visual consistente com o G5.
  - `db push --skip-vault --project-ref fcykqrlnofmdtmewlejr` aplicado com
    aprovação do titular, depois de mostrar o `--dry-run`. `migration list`
    remoto igual ao local (26/26). As duas migrations do Codex (R2/R3, T-B7)
    estão em produção — ver entradas próprias acima.
  - Revisão das duas migrations antes da publicação: lock do evento antes de
    produto/item, identidade de mimo por título normalizado,
    `summary.diapers`/`available`/`invitation_id` — sem achado, evidência em
    `docs/reviews/2026-09-22-r2-r3.md` e `2026-09-22-t-b7.md`.
  - Pendente do lado do front, sem pressa: T-F2 (remover os fallbacks
    `panelSummary`/`availableOf` agora que o servidor responde de verdade).

- 2026-09-22 · Claude · G5.4: acabamentos de acessibilidade A14, A16, A18, A19
  (`docs/design/G5-ESTADOS.md`).
  - A14: `ErrorState`/`RefreshStatus` ganharam um `status` `sr-only` ("Tentando
    de novo…") ao lado do botão durante a tentativa, sem trocar o nome do
    botão (foco e testes dependem do nome fixo).
  - A16: em `InvitationsPage.tsx`, só um formulário principal por vez — abrir
    "Convidar alguém" cancela uma edição em curso sem confirmação; editar um
    convite fecha "Convidar alguém", com a mesma confirmação de link não
    copiado. O link reemitido de dentro da edição continua aparecendo junto
    dela, de propósito (fora deste achado).
  - A18: em `GuestPage.tsx`, quando o tamanho completa com um rascunho de
    quantidade pendente, o formulário que sumia agora explica o motivo.
  - A19: revisado sem mudança de código — o `Availability` do G3.1 já mostra
    o limite real perto do campo antes de a pessoa digitar.
  - Testes novos em `panel.spec.ts` (três do A16) e `guest.spec.ts` (A18); o
    teste existente do A14 ganhou uma checagem a mais.
  - `npm run check` e `npm run test:e2e` completo, sem regressão.

- 2026-09-22 · Claude · G5.3: estado sem conexão (T-F4, `docs/design/G5-ESTADOS.md`).
  - `src/lib/useOnline.ts` (hook com `navigator.onLine` + eventos
    `online`/`offline`) e banner global em `Layout.tsx`, fora do fluxo de
    `RefreshStatus` de propósito — é aviso persistente, não "atualizando".
  - Código de erro `OFFLINE` no mapa de mensagens (`lib/errors.ts` e
    `guestMessage`); os quatro pontos que concentram a gravação de cada tela
    (`EventPage.save`/`transition`, `InvitationsPage.act`, `GuestPage.mutate`,
    `GiftListPage` quantidade/remover/mimo próprio/catálogo) avisam antes de
    tentar, sem esperar o `fetch` falhar.
  - `navigator.onLine` só fala da interface de rede: quem garante o dado
    atualizado ao reconectar continua sendo `refetchOnReconnect` (regra 7).
  - Novo `tests/e2e/offline.spec.ts`. Achado no caminho: `context.setOffline`
    do Playwright derruba também o WebSocket de HMR do servidor de dev usado
    nos testes, então o teste do banner simula `navigator.onLine` direto e
    espera o conteúdo real da rota (depois do `Suspense`) antes de disparar o
    evento — sem essa espera, o listener do hook ainda não tinha montado.
  - `npm run check` e `npm run test:e2e` completo, sem regressão.

- 2026-09-22 · Claude · G5.2: skeleton nas telas que só tinham `LoadingState`;
  achado A17 decidido; `ActionMenu` adiado (T-F7, `docs/design/G5-ESTADOS.md`).
  - `EventsSkeleton` ("Seus eventos"), `PanelSkeleton` (painel) e
    `GuestSkeleton` (convite): mesmo padrão do `ListSkeleton` da lista de
    presentes — `LoadingState` continua fazendo o anúncio, um bloco
    `aria-hidden` ao lado desenha a forma do conteúdo com `Skeleton`.
  - A17 (`audit.md`): decisão de não migrar "Encerrar evento"/"Excluir evento"
    para `ConfirmDialog` — a confirmação inline já é acessível, e um modal não
    é melhoria clara sobre manter a pergunta no lugar da ação.
  - `ActionMenu`: nenhuma tela hoje tem ações secundárias demais para os
    botões visíveis (o card de convidado, com três ações, foi decidido assim
    no G2.1); construir o menu agora seria especulativo. Adiado até haver caso
    de uso.
  - `npm run check` e `npm run test:e2e` completo, sem regressão.

- 2026-09-22 · Claude · G5.1: `ConfirmDialog` no lugar das seis chamadas de
  `window.confirm` (T-F7, `docs/design/G5-ESTADOS.md`).
  - Ao retomar o plano visual, constatado que o G4 e o G4b já estavam prontos
    e mergeados (`docs/design/G4-PAINEL.md`, `docs/design/G4b-LISTA.md`); a
    linha do T-F7 acima estava desatualizada dizendo "Próximo: G4" — corrigida.
  - Novo `src/components/ui/ConfirmDialog.tsx`: `<dialog>` nativo (sem Radix,
    não instalado), foco preso e Esc de graça via `showModal()`, retorno do
    foco ao elemento que abriu feito à mão, clique fora cancela.
  - Trocados os seis pontos que usavam `window.confirm`: `EventLayout.tsx`
    (sair da edição, com navegação adiada até confirmar), `EventPage.tsx`
    ("Recarregar dados"), `GiftListPage.tsx` ("Recarregar quantidade", por
    linha), `InvitationsPage.tsx` (fechar formulário com link não copiado,
    reemitir link, revogar acesso). `EventsPage.tsx` ("Excluir evento") não
    mudou: já usava confirmação inline, sem `window.confirm`.
  - Amostra em `/amostras` e teste novo em `tests/e2e/specimens.spec.ts`
    (axe com o diálogo aberto, Esc, clique fora, foco de volta ao botão).
    Testes existentes que usavam `page.on('dialog', …)` (`organizer.spec.ts`,
    `panel.spec.ts`) passaram a clicar nos botões do diálogo em página.
  - `npm run check` e `npm run test:e2e` completo: 463 passed, 3 skipped, sem
    regressão. Sem mudança em `supabase/`, `functions/` ou contrato.
  - Achado A17 do `audit.md` (confirmação de encerrar/excluir evento) não
    entrou: essas telas já tinham confirmação inline funcional; migrar ou não
    fica para o G5.2, registrado em `docs/design/G5-ESTADOS.md`.

- 2026-09-22 · Claude · R1: prévia do cabeçalho descartava rascunho não salvo
  (achado do Codex em [revisão de 22/09](reviews/2026-09-22-retomada.md)), PR
  `fbbbcb1`.
  - `EventLayout.tsx` passou a guardar o estado de rascunho pendente e a expor
    `{ setDirty }` via `Outlet context`; `EventEditor` (`EventPage.tsx`)
    sincroniza `dirty` para lá em `useEffect` e limpa ao desmontar (salvar,
    trocar de evento, sair).
  - O link "Ver como o convidado vê" e as três abas (Painel/Presentes/Dados) do
    cabeçalho passaram a interceptar o clique com `window.confirm('Descartar as
    alterações e sair sem salvar?')` quando há edição pendente; cancelar
    preserva a tela e o rascunho, confirmar navega normalmente. Sem alteração
    pendente, nada muda.
  - Fora do escopo, por decisão do usuário: `BackLink` ("Seus eventos") não foi
    protegido, só o cabeçalho (`<header>`) e as abas.
  - Testes novos em `tests/e2e/organizer.spec.ts`: cancelar mantém o valor
    digitado (aba e prévia), confirmar permite navegar, e sem dirty a
    navegação segue sem diálogo. `npm run check` verde e suíte Playwright
    completa 463/463 (+3 skipped), sem regressão.

- 2026-09-22 · Claude · Espera de ~15,7 s quando o PostgREST devolve 503
  (pendência aberta pelo QA da lista de mimos).
  - Causa: o `postgrest-js` 2.116 repete GET/HEAD/OPTIONS em **503 e 520** por
    conta própria — até 3 vezes, com recuo de 1 s + 2 s + 4 s, e honrando
    `Retry-After`. Isso não passa pela interface: nada acende “Atualizando…” nem
    mexe em `isFetching`. Com a repetição do TanStack por cima (`retry: 1`), um
    503 custava ~7 s + 1 s + ~7 s ≈ 15,7 s antes de o erro aparecer. Num 500,
    que não está na lista de repetíveis da biblioteca, o mesmo caminho leva ~2 s.
  - Correção em `src/lib/supabase.ts`: `db: { retry: false }` no `createClient`.
    A repetição passa a ser só a visível do TanStack (`retry` e o recuo de
    `liveInterval`), que já move `isFetching`, o `RefreshStatus` e o botão
    “Recarregar lista”. O erro agora aparece em ~2,4 s, como no 500.
  - Vale para todos os GETs do front, e não só a lista: as telas de eventos,
    convites e convidado tinham a mesma espera silenciosa.
  - Regressão: `tests/e2e/gift-list.spec.ts` · “lista indisponível (503) mostra
    o erro sem prender o esqueleto” — serve 503 só na leitura paginada de
    `event_items`, exige o estado de erro em menos de 8 s e no máximo 4
    chamadas (com a repetição da biblioteca ligada seriam 8, aos ~15 s).
    Conferido RED sem a correção e GREEN com ela; `npm run check` verde.
  - Não mexi em `retry` no TanStack: a repetição dele é a que a tela mostra, e
    o back continua podendo sinalizar 503 transitório sem o usuário ficar parado.
  - De quebra, um teste intermitente no mesmo arquivo (“cada mimo é uma linha
    compacta”, falhou 1 em 15 na suíte cheia): ele lia `getComputedStyle(…).color`
    uma vez logo depois do `hover()`, e a transição de `color` do `.btn-icon`
    ainda estava correndo. Virou `expect(...).not.toHaveCSS('color', rest)`, que
    repete a leitura. Nada a ver com o 503; 40/40 com `--repeat-each=2`.
- 2026-09-21 · Claude · Refatoração UI/UX da lista de presentes (Lista de mimos),
  a partir de `PLANO-REFATORACAO-LISTA-DE-MIMOS.md`.
  - G0: baseline em 320/375/768/1440 antes de mexer no código; a aba Mimos tinha
    o nome numa linha e “Remover da lista” em outra, ~125 px por item.
  - G1: cabeçalho da lista com título, contador do servidor (`count`, sem soma no
    front) e atalho “Adicionar à lista”, que leva o foco para a seção de incluir.
  - G2/G3: `.item-row` virou grade (nome à esquerda, ação à direita, faixas
    abaixo para quantidade, confirmação e avisos); “Remover da lista” virou botão
    de ícone de 44 px, neutro em repouso e destrutivo só no hover/foco, com o
    mesmo nome acessível de antes. A confirmação na linha foi mantida: remover
    apaga o mimo próprio e o servidor recusa item com reserva — não é reversível,
    então não cabe “Desfazer” sem mudança no back.
  - G4/G5: esqueleto no lugar do spinner ao carregar; vazio, erro e remoção
    mantidos. `tests/e2e/gift-list.spec.ts` (novo) cobre contador, atalho,
    anatomia da linha, confirmação, vazio e 320/375/768/1024/1440 com axe.
  - Ordem do DOM mudou dentro da linha (remover antes dos avisos de quantidade),
    para o Tab seguir a ordem da tela; os dois testes de foco em `panel.spec.ts`
    foram atualizados.
  - QA de UX (agente `qa-ux`) achou dois defeitos e escreveu
    `tests/e2e/gift-list-qa.spec.ts` (11 testes × 2 projetos): (a) em container
    menor que 38rem a linha de fralda punha o remover na primeira faixa e o
    formulário na segunda, então o Tab subia de “Atualizar quantidade” de volta
    para a lixeira (WCAG 2.4.3) — corrigido com `:has(.item-row-form)`, que faz o
    remover descer junto com a quantidade; (b) `.item-rows > li:hover` grudava no
    toque, como já documentado no `.step-card` — agora dentro de
    `@media (hover: hover)`. Também ajustei o `title` do botão para repetir o nome
    acessível (senão o leitor de tela lê nome e descrição em cada linha) e o
    atalho deixou de empilhar `#adicionar` no histórico do celular.
  - Aberto, pré-existente, para outra tarefa: com o PostgREST devolvendo 503, a
    lista fica ~15,7 s em “Carregando a lista…” (três tentativas do
    `postgrest-js` mais uma do TanStack). Com 500 leva ~2 s. O esqueleto novo
    torna a espera mais enganosa; avaliar `retry: false` na leitura da lista.
    _(Corrigido em 2026-09-22 — ver a entrada abaixo.)_
  - Fora do escopo, com motivo: a seção “Presentes” **não** virou accordion — no
    chadbb ela é aba do evento, e o botão “Presentes” solto é o atalho da barra
    de etapas pendentes (`SetupDock`), não um container. Busca/filtros não
    entraram (lista pequena). Sem componentização em arquivos separados: o
    padrão do repositório é um arquivo denso por feature.
- 2026-09-17 · Codex · Exclusão de evento, PR #10 (merge `7293685`).
  - G1–G3: testes antes da implementação e migration `20260917000000_delete_event.sql`.
  - G4, local: `db:test` 99/99, `test:db:portable` 65/65, `test:api` 26/26 e
    `npm run check`. O CI da PR ficou verde depois que o Chromium passou a ser
    instalado antes da suíte da API.
  - G5: `db push` no `chadbb-cha`, só com essa migration. O `migration list`
    remoto ficou igual ao local (21/21). Tabela, funções e permissões conferidas
    só com leitura.
  - G6: `delete-event` v1 e `retention` v2 publicadas (`ACTIVE`,
    `verify_jwt=false`). `GUEST_ALLOWED_ORIGINS` conferido pelo digest: contém só
    `https://chadbb.pages.dev`.
  - Smoke sem dados: GET 405; origem de terceiros e preview 403; sem login e com
    login inválido 401; preflight 204 para o site; `retention` sem segredo 401;
    `guest` sem mudança.
- 2026-09-16 · Claude · T-F1 (estados das telas), G0 (baseline visual) e G1 (audit), PR #7.
- 2026-09-16 · Claude · G2 e G2.1 (foundation e hierarquia de ações), PR #8.
- 2026-09-16 · Claude · Pedido do Codex (na `codex/back`) sobre “Conheça o chadbb”:
  o botão da página inicial agora leva a “Começar a organizar” (`/entrar`) ou
  “Ir para seus eventos”, e o aviso “Convites estão em preparação” saiu (G3).
- 2026-09-17 · Claude · G3 e G3.1 (convite e sistema de cards), PR #9.
- 2026-09-17 · Claude · Revisão do Codex sobre a quantidade no convite (R1, R2):
  corrigida em `4dc63ae`, com o foco mantido durante o envio; entrou no PR #9.
- 2026-09-17 · Claude · Convite com o motivo certo ao não abrir e botão
  “Excluir evento” (Edge `delete-event`), PR #11 em rascunho.

- 2026-09-16 · Codex · Agente de apoio `tdd_senior` configurado por solicitação
  do usuário em `.codex/agents/tdd-senior.toml`, com delegação descrita no
  `AGENTS.md`. Herda modelo/permissões, respeita divisão de arquivos e gates.
  Primeira revisão da T-B5 encontrou falhas no gate de erros UI e interrupção;
  escreveu testes de regressão do gate, com RED/GREEN observado pelo principal.

- 2026-09-16 · Codex · T-B4: revisão e reexecução local aprovadas; titular
  autorizou o remoto sob essa condição. Smoke no `chadbb-cha` aprovado:
  criar/editar/publicar evento/lista e negar acesso cruzado. Limpeza restrita
  confirmada: zero contas, eventos e itens fictícios remanescentes. Evidências
  em `PLANO-VALIDACAO-REMOTA-T-B4.md`. Sem commit ou push.

- 2026-09-16 · Codex · T-B3: comportamento existente de encerramento e
  pós-evento documentado em `CONTRATOS-TRANSACIONAIS.md`; três testes novos
  verificam ações bloqueadas, leitura/reabertura, replay, compra/cancelamento
  e expiração. **62/62** testes de Postgres portátil aprovados. Sem migration,
  mudança de política ou deploy remoto.

- 2026-09-16 · Codex · T-B1: SMTP Resend aplicado após aprovação; variáveis
  públicas de Production corrigidas e rebuild validado. Titular assumiu como
  organizador e confirmou entrega, login real, persistência, logout e proteção
  de rota. Evidências em `PLANO-SMTP-T-B1.md`. Sem commit ou push.

- 2026-09-16 · Codex · T-B2: quatro casos novos em
  `tests/database/events.integration.mjs`: mutações com usuário/evento alheio;
  sessão expirada e reabertura preservando RSVP/reserva; convite expirado
  bloqueando troca/leitura/escrita; mudanças yes → yes → no → yes com replay e
  isolamento do outro convite. Revogação/rotação já cobertas e reexecutadas.
  `npm run test:db:portable`: **59/59**, Postgres descartável com todas as
  migrations, fora do sandbox (dentro dele houve saída precoce sem casos).
  Nenhum reset da stack compartilhada, escrita remota, commit ou push.
  `npm run check` aprovado: lint, TypeScript, 40 testes e build;
  `git diff --check` sem erros.
  Esta evidência é de banco/RPC; não substitui smoke remoto ou ensaio no celular.
