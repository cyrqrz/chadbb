# Handoff para o Codex — T-B6 (operação)

Escrito pelo Claude em 2026-09-22, depois do merge do PR #20. Documento de
passagem: não altera código, migration, função ou configuração remota. Todos os
passos abaixo continuam sob os gates do `AGENTS.md` — nada roda sem aprovação
explícita do titular.

## Por que este documento não é sobre a T-B5

A T-B5 **está encerrada** desde 2026-09-21, por decisão do titular: aceitar a
leitura p95 de 2187 ms e a escrita de 2328 ms contra a meta de 2000 ms, sem
comprar compute nem migrar para o pooler. A meta não foi alterada; o que se
decidiu foi não agir sobre a diferença. O registro completo está em
`PLANO-DESEMPENHO-T-B5.md`.

Fica anotado o que **não** foi medido, caso o desempenho volte a incomodar: a
origem dos ~2,2 s. O cruzamento com `rate_ms`/`action_ms` do log da Edge não foi
feito porque o CLI desta versão não tem `functions logs`; os números estão no
painel do projeto. A atribuição ao teto de CPU do plano free é hipótese herdada
do diagnóstico de 17/09, não medição. Começar por aí antes de comprar compute.

## O que sobra: T-B6, em três partes independentes

### 1. Remover a integração órfã "Workers Builds" na Cloudflare

A única parte que dá para fazer agora, sem depender de conteúdo real.

O check `Workers Builds: chadbb` falha em todo PR e **não é regressão de
nenhum deles** — é uma integração órfã apontando para um serviço de Workers que
o projeto não usa. O deploy de verdade é o `Cloudflare Pages`, que passa.

Enquanto ela existir, todo PR nasce com um check vermelho, e um vermelho
permanente treina quem revisa a ignorar vermelho. Vale remover antes de a
família entrar.

Ação no painel da Cloudflare, conta `551bc632ec878b9139fa7f846745938d`. Gate:
é escrita em serviço remoto — mostrar o que será removido e aguardar aprovação.
Depois, confirmar num PR novo que o check sumiu em vez de só falhar.

### 2. Acompanhar a sequência diária do backup

`.github/workflows/backup.yml` roda às 04:23 de Brasília (`cron: 23 7 * * *`),
captura cifrado, publica no R2 e confere o download. Scripts em `scripts/backup/`.

Pendente: acompanhar a sequência de execuções e registrar falhas. É observação,
não implementação — se a sequência estiver limpa, o registro disso já é a entrega.

### 3. Restauração com dados reais e medição do RTO

**Bloqueado por dependência do titular**, e é importante não confundir isso com
trabalho parado: o passo exige o conteúdo real, que ainda não foi juntado
(pendência aberta na seção "Usuário" do quadro).

O roteiro de seis passos já está escrito em `ENTREGA-E-SUPORTE.md`, seção
"Backup e restauração", e o próprio roteiro diz que **roteiro escrito não é
evidência**: só marcar concluído depois de executar. A meta de RTO é 2 h.

Atenção ao passo 3: backup do banco não substitui a cópia dos objetos do
Storage. As capas dos eventos precisam entrar na mesma prova.

## Item secundário, também do back

`docs/TAREFAS-AGENTES.md` guarda desde 2026-09-16 um **deadlock intermitente**
em `npm run test:browser:local`: o teste "M5: outro convite e fragmento inválido
na mesma aba…" falhou uma vez com `deadlock detected` e passou isolado e em duas
rodadas completas seguidas. A suspeita registrada é `cleanupUsers`
(`tests/support/local.mjs`) concorrendo com uma chamada da função `guest` ainda
em andamento.

Uma amostra só, de seis dias atrás, sem reprodução desde então. Vale mais uma
tentativa de reproduzir sob carga antes de mexer em qualquer coisa — foi
exatamente o que resolveu um caso parecido no front em 22/09, e ali a causa
acabou sendo corrida de leitura no teste, não bug no código.

## O que o front deixou pronto e não precisa de nada do back

O contrato do T-B7 está sendo consumido sem fallback desde a T-F2 (PR #20):
`summary`, `available`, `id` e `invitation_id` são obrigatórios no tipo do
front. Se algum deles parar de vir, a tela quebra em vez de recalcular por
conta própria — que é o comportamento desejado pela regra 6 do `AGENTS.md`,
mas convém saber disso antes de mudar a forma do payload.
