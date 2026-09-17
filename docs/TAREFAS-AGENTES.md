# Tarefas e combinados entre agentes

Quadro compartilhado entre o Claude (front, `claude/front`) e o Codex (back,
`codex/back`). Cada agente atualiza este arquivo na própria branch; as mudanças
chegam ao outro pela `main`. Regras em `AGENTS.md`.

Formato de pedido: `- [ ] AAAA-MM-DD · origem → destino · pedido (arquivos/contrato envolvidos)`

## Situação em 2026-09-16

Convites, presença e reservas (M3/M4) já estão implementados e implantados no
`chadbb-cha`, e o backup diário está ativo. Faltam três frentes: liberar o login
do organizador (SMTP), terminar o front (visual e acessibilidade) e provar tudo
no ambiente real (ensaios e metas). Algumas caixas de
`PLANO-EXECUCAO-MVP.md` estão desmarcadas, mas o código já cobre parte delas
(ex.: consulta a cada 5 s e "Atualizando…"). Antes de implementar, confira o que
já existe.

Ordem sugerida: o Codex começa pelo SMTP (T-B1), que depende de serviço externo.
O Claude começa pelo painel e pelo visual (T-F2 e T-F1), dos quais o ensaio com o
irmão depende.

## Claude — front (`chadbb-claude`, `claude/front`)

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
  `docs/design/CARDS.md`) aprovados em 2026-09-16; PR aberto para a `main`.
- [ ] **T-F6 · Testes.** Ampliar os testes e2e para o que mudar; `npm run check`
  antes de cada PR.

## Codex — back e tarefas difíceis (`chadbb-codex`, `codex/back`)

- [ ] **T-B1 · SMTP pelo Resend no Auth do `chadbb-cha`.** Bloqueio principal:
  sem ele o organizador não entra. Validar um login real pelo link de e-mail
  depois. **Gate:** escrita remota; mostrar o plano e aguardar aprovação.
  Depende do usuário: conta Resend no e-mail do organizador (decisão em
  `PROXIMOS-PASSOS-M6.md`, "Sem domínio próprio no piloto").
- [ ] **T-B2 · Testes de convite que faltam (M3).** Acesso cruzado, revogação,
  expiração, reabertura do link e contagem de pessoas ao alterar a resposta.
- [ ] **T-B3 · Encerramento e regras pós-evento (M4).** Último item aberto das
  reservas.
- [ ] **T-B4 · Validação pela API real (M2).** Criar, editar e publicar evento e
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

- [ ] Criar a conta Resend no e-mail do organizador e repassar a chave (T-B1).
  _(2026-09-16: chave criada no PC do trabalho; guardar em
  `~/.config/chadbb/resend-api-key`, modo 600, e avisar o Codex.)_
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

_Nenhum no momento._

## Em andamento

| Agente | Tarefa | Branch | Situação |
|---|---|---|---|
| Claude | T-F7 · G3 pronto (sem aprovação); G3.1 (cards) em andamento — ver `docs/design/RETOMADA-CLAUDE.md` | `claude/front` | WIP salvo para outra máquina (2026-09-16) |
| Codex | — | `codex/back` | livre |

## Concluídas

- 2026-09-16 · Claude · T-F1 (estados das telas), G0 (baseline visual) e G1 (audit), PR #7.
- 2026-09-16 · Claude · G2 e G2.1 (foundation e hierarquia de ações), PR #8.
- 2026-09-16 · Claude · Pedido do Codex (na `codex/back`) sobre “Conheça o chadbb”:
  o botão da página inicial agora leva a “Começar a organizar” (`/entrar`) ou
  “Ir para seus eventos”, e o aviso “Convites estão em preparação” saiu (G3).
