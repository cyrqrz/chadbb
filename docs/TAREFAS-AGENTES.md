# Tarefas e combinados entre agentes

Quadro compartilhado entre o Claude (front) e o Codex (back). **Desde 2026-09-21
os dois trabalham na mesma branch, a `clone-main`** — as antigas `claude/front` e
`codex/back` foram unificadas nela e apagadas, e o remoto tem só `main` e
`clone-main`. O que separa os dois agora é a área de arquivo, não a branch: faça
`git pull` antes de começar e `git pull --rebase` antes de commitar. Regras em
`AGENTS.md`.

A unificação juntou a G4b.3 do front com a T-B5 e a migration
`20260917010000_guest_rates_batch` do back. Evidências na branch unificada:
`npm run check` verde, pgTAP **8 arquivos / 153 testes**, `test:browser:local`
**8/8** contra o Supabase local. Com as três migrations de setembro na mesma
branch, o `db push` no `chadbb-cha` deixou de estar bloqueado pela ordem — ele
continua sendo gate manual, com dry-run e aprovação do titular.

Formato de pedido: `- [ ] AAAA-MM-DD · origem → destino · pedido (arquivos/contrato envolvidos)`

## Situação em 2026-09-16

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

## Claude — front (`chadbb-claude`, `claude/front`)

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
- [ ] **2026-09-17 · Codex → Claude · Entrar com código do e-mail (urgente).**
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
- [ ] **2026-09-17 · Usuário → Claude · Refazer o visual do convite (prioridade alta).**
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
- [ ] **2026-09-17 · Codex → Claude · Erro de envio do link aparece como "conexão".**
  Se o Auth não consegue enviar o e-mail, `/auth/v1/otp` responde **500**
  `unexpected_failure` ("Error sending confirmation email"). Hoje isso acontece
  com qualquer endereço que não seja o da conta Resend, porque o remetente é o
  de testes `resend.dev`. `errorMessage` cai no texto genérico "Confira sua
  conexão". Mapear esse caso em `/entrar` para algo como "Não conseguimos
  enviar o e-mail para este endereço. Confira o e-mail ou fale com a
  organização.". Visto nos logs em 17/09, 15:24–17:12 UTC.
- [ ] **2026-09-17 · Codex → Claude · Voltar à página pedida depois do login.**
  `RequireAuth` manda para `/entrar` e, depois do login, `AuthCallback` vai
  sempre para `/eventos`. Guardar o destino (caminho interno, só do mesmo
  site, nunca uma URL externa) antes de pedir o link e voltar para ele no
  retorno. Exemplo: `/eventos/:id/convites` aberto sem sessão.
- [ ] **2026-09-17 · Codex → Claude · Fonte bloqueada pela CSP.**
  Console em `/entrar`: `font-src` bloqueia `data:font/woff2;base64,…`. O Vite
  embute trechos pequenos das fontes Manrope/Fraunces como `data:`, e
  `public/_headers` só tem `default-src 'self'`. Acrescentar
  `font-src 'self' data:` à CSP (ou impedir que o build embuta fontes) e
  conferir no console da produção que o aviso sumiu.
- [ ] **2026-09-17 · Usuário → Claude · Campos de data cortados no iPhone.**
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
- [ ] **T-F2 · Painel do organizador.** _(2026-09-16: resumo, fraldas, mimos e
  escolhas separados; aguardando T-B7 para remover o cálculo provisório.)_ Conferir se o `InvitationsPage` mostra
  convites respondidos separados de pessoas confirmadas, fraldas comprometidas e
  disponíveis por tamanho (P 6 / M 19 / G 19 / XG 6) e mimos em separado. Se
  faltar dado, registrar um pedido para o Codex abaixo; não calcular no front.
- [ ] **T-F3 · Acessibilidade (M5).** Teclado e foco (visível, previsível, retorno
  após diálogos); 320 px com texto a 200%; áreas de toque de 44 px; movimento
  reduzido; avisos ao leitor de tela sem repetir tudo a cada atualização. Levar o
  axe, que hoje só cobre as áreas do convidado, às telas do organizador.
- [ ] **T-F4 · Contrato de atualização no front (M2).** Distinguir "salvo" de
  "painel ainda não atualizado"; mostrar perda de conexão; nunca sobrescrever o
  que está sendo digitado em nenhum formulário, inclusive na edição de convite.
- [x] **T-F5 · Prévia do link no WhatsApp.** _(2026-09-16, G3: tags `og:` e imagem
  genérica `public/og-image.png`; prévia por evento fica para depois do MVP.)_ Prévia genérica bem apresentada
  (meta tags em `index.html`). Prévia personalizada por evento é opcional.
- [ ] **T-F7 · Refatoração visual (plano em `docs/design/PLANO-VISUAL.md`).**
  Gates G0–G5 até o ensaio; congelamento a partir de 05/10. Absorve T-F3, T-F4
  e T-F5 nos gates indicados no plano. G0 e G1 mergeados (PR #7, 2026-09-16);
  G2 e G2.1 (foundation, forma e hierarquia de ações; fontes Manrope + Fraunces
  aprovadas) mergeados (PR #8). G3 (convite, página inicial e prévia) e G3.1 (sistema de cards,
  `docs/design/CARDS.md`) mergeados (PR #9, 2026-09-17). G4 (painel, abas,
  prévia, `docs/design/G4-PAINEL.md`) e G4b (lista de presentes com menos
  caixas, `docs/design/G4b-LISTA.md`) **já estavam prontos** ao retomar em
  2026-09-22 — esta linha estava desatualizada dizendo "Próximo: G4". G5.1
  (`ConfirmDialog` no lugar do `window.confirm`, `docs/design/G5-ESTADOS.md`)
  e G5.2 (skeleton no painel, em "Seus eventos" e no convite; achado A17
  decidido sem migração; `ActionMenu` adiado por falta de caso de uso) feitos
  em 2026-09-22. Próximo: G5.3 (estado sem conexão, T-F4).
- [ ] **T-F6 · Testes.** Ampliar os testes e2e para o que mudar; `npm run check`
  antes de cada PR.

## Codex — back e tarefas difíceis (`chadbb-codex`, `codex/back`)

- [ ] **2026-09-17 · Login por código no e-mail.** G1 local concluído:
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
- [ ] **T-B7 · Pedidos do front.** Atender o que for registrado abaixo (ex.:
  dados agregados para o painel).

## Usuário

- [x] Criar a conta Resend no e-mail do organizador e repassar a chave (T-B1).
  Titular assumiu como organizador e validou o login em 2026-09-16.
- [ ] Juntar o conteúdo real: local, instruções e imagem autorizada.
- [ ] Ensaio com o irmão e um convidado, no celular e no navegador do WhatsApp
  (meta: 2–4 de outubro).

## Pedidos do front para o back

- [ ] 2026-09-17 · Claude → Codex · **`invitation_id` nas reservas do painel.**
  O painel agora marca quem respondeu “não poderá ir” e mesmo assim tem
  presente reservado, com o selo “Vai enviar presente”. O vínculo é feito pelo
  **nome** do convidado, porque `organizer_invitations` devolve as reservas só
  com `name`. Havendo dois convites com o mesmo nome, o selo **fica de fora**
  nos dois, para não marcar a pessoa errada — a escolha continua visível em
  “Escolhas dos convidados”, onde é só fato.
  Pedido: incluir `invitation_id` em cada item de `reservations`. Sem isso o
  selo continua aproximado; com ele, o front passa a casar por identificador.

- [ ] 2026-09-16 · Claude → Codex · **Resumo do painel calculado no servidor (T-F2).**
  Hoje o `InvitationsPage` soma `attending` e conta respostas no navegador, e
  também conta convites revogados. Pedido: em `organizer_invitations` (ação
  `list`), incluir
  `summary: { invitations: { total, answered, yes, no, maybe, pending, revoked }, people_confirmed }`,
  com a regra (ex.: se convite revogado conta) definida só no banco.
  Registrar em `docs/CONTRATOS-TRANSACIONAIS.md`.
- [ ] 2026-09-16 · Claude → Codex · **Saldo por item vindo do servidor (T-F2).**
  O front calcula `limit - committed` no painel e no convite (seletor de troca de
  tamanho). Pedido: `available` (inteiro ≥ 0; `null` para mimos) em cada item de
  `organizer_invitations.items` e de `snapshot.items` da função `guest`.
- [ ] 2026-09-16 · Claude → Codex · **`id` nas reservas do painel.** `reservations`
  não traz identificador, e o front usa o índice como chave da lista. Pedido:
  incluir `id` (da reserva) em cada item.

- [ ] 2026-09-16 · Claude → Codex · **Progresso geral das fraldas (T-F7).** No
  mesmo `summary`, incluir `diapers: { committed, limit }` (soma de todos os
  tamanhos), para o resumo “X de Y pacotes”. Sem esse campo, o número não
  aparece no painel.

Enquanto os campos não chegam, o front usa `summary`/`available` quando existem e
mantém o cálculo antigo só como transição, isolado em `src/features/guests/api.ts`
(`panelSummary` e `availableOf`). Depois da entrega, o Claude remove o cálculo.

- [ ] 2026-09-16 · Claude → Codex · **Deadlock intermitente no teste de navegador.**
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

- [ ] 2026-09-17 · Claude → Codex · **Documentar a reserva de portas no
  `README.md`.** Junto dos comandos `db:*`: 54321 e 54322 caem na faixa efêmera
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

- [ ] **2026-09-18 · Usuário → Claude/Codex · Mapa do convite: decisão mudou.**
  O titular decidiu que o convite mostra o mapa já carregado e interativo, sem
  clique. Substitui a decisão de 17/09 ("carregar só após o clique", registrada
  na `codex/back`). Implementado com o embed do Google
  (`https://www.google.com/maps?q=…&output=embed`, `referrerpolicy="no-referrer"`,
  altura fixa) e "Como chegar" para a rota. Consequência aceita: o endereço vai
  ao Google ao abrir o convite. CSP: só `frame-src https://www.google.com
  https://maps.google.com` (a alternativa já revisada pelo Codex), com teste em
  `tests/headers.test.ts`. Pedido ao Codex: conferir a CSP quando voltar.

## Pedidos do back para o front

- [ ] **2026-09-22 · Codex → Claude · Investigar teste de estabilidade visual.**
  `panel.spec.ts:1755` falhou no desktop (posição 279 → 271) na suíte completa
  e isoladamente. Cópias instrumentadas ficaram estáveis; possível medição da
  animação inicial, ainda sem causa comprovada. Conferir sincronização antes de
  medir a reconsulta; não remover a asserção. Evidências na
  [revisão de 22/09](reviews/2026-09-22-retomada.md).

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


- [ ] 2026-09-16 · Codex → Claude · Usuário relata que “Conheça o chadbb”
  parece não fazer nada. `HomePage.tsx` aponta para `#como-funciona`, seção já
  visível na captura enviada. Rever CTA para tornar claro o próximo passo de
  criar/acessar evento, inclusive autenticado; corrigir o aviso desatualizado
  “Convites estão em preparação”. Conferir navegação por teclado e clique.

## Pendências encontradas na revisão de 22/09

- [ ] **Codex · R2: identidade de mimos na inclusão pelo catálogo.** Mimo próprio
  seguido de produto homônimo do catálogo duplica o nome; a ordem inversa é
  recusada. Reproduzido em PostgreSQL descartável. Rever `add_event_item` e a
  lista pronta, em migration nova.
- [ ] **Codex · R3: ordem dos locks de produto/item.** Inclusão e remoção do mesmo
  mimo próprio por RPC podem entrar em deadlock (`40P01` reproduzido com duas
  conexões). Uniformizar locks e cobrir concorrência; o front atual não oferece
  reinclusão de produto próprio pelo catálogo.

Detalhes, escopo e limites em [revisão de 22/09](reviews/2026-09-22-retomada.md).
As duas migrations de 18/09 foram revisadas; a implementação das correções
acima permanece pendente. Nenhuma alteração remota foi feita nesta revisão.

## Em andamento

| Agente | Tarefa | Branch | Situação |
|---|---|---|---|
| Claude | PR #11 (convite e “Excluir evento”) mergeada em 17/09, depois do G5/G6. Próximos: pedidos urgentes de 17/09 (código no login, botão de envio, campos de data no iPhone); depois T-F7 · G4 (26–30/09) — ver `docs/design/RETOMADA-CLAUDE.md` | `claude/front` | pedidos de 17/09 |
| Codex | T-B5: G2 remoto reprovado em 17/09 (p95 ~4,2 s, zero erros, sync ok); G3.1 local concluído (2 chamadas por POST); G3.2 (publicar e medir de novo) aguardando aprovação. Exclusão de evento concluída e testada em produção (plano em PLANO-DESEMPENHO-T-B5.md, remoto não autorizado) | `codex/back` | livre para a próxima tarefa |

## Concluídas

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
