# Tarefas e combinados entre agentes

Quadro compartilhado entre o Claude (front, `claude/front`) e o Codex (back,
`codex/back`). Cada agente atualiza este arquivo na própria branch; as mudanças
chegam ao outro pela `main`. Regras em `AGENTS.md`.

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

- [ ] **2026-09-17 · Codex → Claude · Revisão G3/G3.1: corrigir quantidade no convite.**
  Em `GuestPage.tsx`, bloquear `QuantityField` durante envio (regressão) e
  preservar a versão inicial do rascunho ao continuar digitando depois de uma
  atualização concorrente (preexistente, inclusive versão `null`).
  Correção e testes preparados em
  [patch](reviews/2026-09-17-claude-front.patch); reprodução e evidências em
  [revisão](reviews/2026-09-17-claude-front.md). Base: `2f321dc`.
- [ ] **2026-09-17 · Codex → Claude · Tela de exclusão de evento.** O back está
  pronto na `codex/back` e validado no Supabase local, mas **ainda não foi publicado** (gates G5–G6).
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
  invalidar as consultas e sair da tela do evento. **Não fazer merge do botão antes
  do deploy do back (G6):** sem ele, o botão aparece e falha. No preview a Edge
  responde `ORIGIN_DENIED` de propósito, porque só `https://chadbb.pages.dev` é
  liberado. Use o backend simulado nos e2e. Contrato completo em
  `CONTRATOS-TRANSACIONAIS.md`, seção "Exclusão de evento".
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
  `docs/design/CARDS.md`) mergeados (PR #9, 2026-09-17). Próximo: G4.
- [ ] **T-F6 · Testes.** Ampliar os testes e2e para o que mudar; `npm run check`
  antes de cada PR.

## Codex — back e tarefas difíceis (`chadbb-codex`, `codex/back`)

- [ ] **2026-09-17 · Exclusão de evento (`delete_event` + Edge `delete-event`).**
  G1–G4 concluídos: plano, testes vermelhos, migration
  `20260917000000_delete_event.sql`, suíte portátil 65/65. G4 (aprovado em
  2026-09-17): `supabase migration up --local`, `npm run db:test` 99/99 e
  `npm run test:api` 26/26, sem sobra de dados de teste. Pendentes, cada um com
  a própria aprovação: G5, `db push` no `chadbb-cha`; G6, deploy de
  `delete-event` e `retention`. No G6, conferir (sem exibir o valor) se
  `GUEST_ALLOWED_ORIGINS` tem `https://chadbb.pages.dev`; sem isso a Edge
  responde `ORIGIN_DENIED`. **Não liberar o preview**
  (`claude-front.chadbb.pages.dev`): ele usa o banco de produção e viraria uma
  segunda porta para os convites reais. Ordem da publicação: PR do back →
  G5 → G6 → merge do front com o botão. Teste na produção com um evento de
  rascunho criado só para isso.
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
- [ ] **T-B5 · Metas no ambiente do evento.** p95 de até 2 s com 50 convidados;
  mudança de outra sessão visível em até 7 s. **Gate:** execução remota.
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

## Pedidos do back para o front

- [ ] 2026-09-16 · Codex → Claude · Usuário relata que “Conheça o chadbb”
  parece não fazer nada. `HomePage.tsx` aponta para `#como-funciona`, seção já
  visível na captura enviada. Rever CTA para tornar claro o próximo passo de
  criar/acessar evento, inclusive autenticado; corrigir o aviso desatualizado
  “Convites estão em preparação”. Conferir navegação por teclado e clique.

## Em andamento

| Agente | Tarefa | Branch | Situação |
|---|---|---|---|
| Claude | Convite (motivo certo ao não abrir) e “Excluir evento”: PR #11 em rascunho, merge só depois do G5/G6 do back. Depois: T-F7 · G4 (26–30/09) — ver `docs/design/RETOMADA-CLAUDE.md` | `claude/front` | aguardando G5/G6 |
| Codex | Exclusão de evento: G5/G6 aguardando aprovação; T-B5 pausada (plano em PLANO-DESEMPENHO-T-B5.md, remoto não autorizado) | `codex/back` | PR aberta para a `main` |

## Concluídas

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
