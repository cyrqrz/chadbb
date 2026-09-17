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
- [ ] **T-F1 · Visual e estados das telas (M1).** Em `GuestPage`, `GiftListPage`,
  `InvitationsPage` e `EventPage`: estados de vazio, carregando, sucesso e erro com
  o mesmo acabamento; uma ação principal por etapa ("Confirmar presença",
  "Escolher presente", "Cancelar reserva"); explicar que "Já comprei" é só uma
  declaração do convidado.
- [ ] **T-F2 · Painel do organizador.** Conferir se o `InvitationsPage` mostra
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
- [ ] **T-F5 · Prévia do link no WhatsApp.** Prévia genérica bem apresentada
  (meta tags em `index.html`). Prévia personalizada por evento é opcional.
- [ ] **T-F6 · Testes.** Ampliar os testes e2e para o que mudar; `npm run check`
  antes de cada PR.

## Codex — back e tarefas difíceis (`chadbb-codex`, `codex/back`)

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

_Nenhum no momento._

## Pedidos do back para o front

- [ ] 2026-09-16 · Codex → Claude · Usuário relata que “Conheça o chadbb”
  parece não fazer nada. `HomePage.tsx` aponta para `#como-funciona`, seção já
  visível na captura enviada. Rever CTA para tornar claro o próximo passo de
  criar/acessar evento, inclusive autenticado; corrigir o aviso desatualizado
  “Convites estão em preparação”. Conferir navegação por teclado e clique.

## Em andamento

| Agente | Tarefa | Branch | Situação |
|---|---|---|---|
| Claude | — | `claude/front` | livre |
| Codex | T-B5 | `codex/back` | runner e validação local; revisão por tdd_senior; plano em PLANO-DESEMPENHO-T-B5.md; remoto não autorizado |

## Concluídas

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
