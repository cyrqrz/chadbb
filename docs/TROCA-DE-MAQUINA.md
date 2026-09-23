# Retomar o chadbb em outra máquina

## Retomada depois de 2026-09-23, no PC pessoal — esta seção é a mais recente

**Toda a parte dos agentes está feita.** O que falta depende do titular.
Estado no fim de 23/09: `main` em `21dd13e`, com Pages e CI verdes; a
`clone-main` tem o mesmo conteúdo (a `main` só tem a mais os commits de merge).
Nada ficou sem commit.

```sh
git pull origin clone-main
npm ci
npm run check                # lint, TypeScript, 62 testes, build
```

Entregue em 23/09 (PRs #24 a #27, todos mergeados):

- **#24:** deadlock de 16/09 corrigido (era a limpeza dos testes, não o
  produto) e T-B6 validada: Workers Builds removido, oito backups seguidos.
- **#25 e #26:** os dois testes instáveis resolvidos — a barra de etapas e o
  `panel.spec.ts` “reconsulta sem tremida” (animação de entrada medida sob carga).
- **#27:** auditoria de teclado sem barreira e jornadas só com teclado nos
  testes; instruções do organizador reescritas; roteiros do ensaio com a
  família e da restauração com dados reais, em `ENTREGA-E-SUPORTE.md`.

Evidências em `reviews/2026-09-23-t-b6.md` e `reviews/2026-09-23-adiantamento.md`.
O `gift-list.spec.ts:142` segue só em observação: não reproduziu em 123 execuções.

### O que falta, todo do titular

1. Juntar e cadastrar o conteúdo real (local, instruções com o prazo de
   18/10, imagem autorizada, lista), seguindo as instruções do organizador.
2. No dia seguinte ao cadastro, a restauração com dados reais e a medição do
   RTO, pelo roteiro de seis passos — fecha a T-B6.
3. Ensaio com o irmão e um convidado (meta: 2 a 4/10), pelo roteiro.
4. Uma passada com leitor de tela no celular (TalkBack ou VoiceOver).
5. Liberar o envio dos convites depois do ensaio.

Opcional, não pedido: ensaio de acessibilidade no convite e painel publicados
com dados fictícios no `chadbb-cha` — exige aprovação (regra 1).

**Congelamento a partir de 05/10:** dali até 01/11, só correções.

## Retomada em 2026-09-23, no PC do trabalho (histórico)

Os PRs #20, #21 e #22 foram mergeados na `main` em 22/09. A nota de retomada
foi commitada depois, em **`50a21af`**, e enviada apenas para `clone-main`:
na conferência de 23/09, `main` estava em `b97721c`, um commit atrás.
Não há trabalho local do PC de casa por recuperar. Para obter a nota ao clonar
do zero, use `git clone --branch clone-main https://github.com/cyrqrz/chadbb.git`.

Branch: **`clone-main`**, como manda o `AGENTS.md`. Não há mais clone nem área
de arquivo por agente — os dois trabalham no projeto inteiro, na mesma branch.

### Primeiros comandos

```sh
git pull origin clone-main   # traz o trabalho de 22/09
npm ci                       # o node_modules da máquina pode estar velho
npm run check                # lint, TypeScript, 62 testes, build
```

Se `npm run db:start` falhar com `address already in use` sem nada ouvindo a
porta, a causa e a correção estão no `README.md`, logo abaixo do comando.

### O que foi entregue em 22/09

- **T-F2** (PR #20, mergeado): painel e convite sem cálculo próprio. Os
  adaptadores `panelSummary` e `availableOf` saíram; `summary`, `available`,
  `id` e `invitation_id` são **obrigatórios** no tipo. Se o back mudar a forma
  do payload, a tela quebra em vez de recalcular — é o comportamento desejado
  pela regra 6, mas convém saber antes de mexer no contrato.
- **Teste instável do `:hover`** (PR #20): era corrida de leitura no teste, não
  bug de CSS.
- **Fim da divisão por área** (PR #20): registrado no `AGENTS.md`.
- **Auditoria das caixas** (PR #20): 21 itens do plano do MVP estavam
  desmarcados com a entrega feita. Antes de implementar qualquer coisa,
  confira se já existe — foi o pedido explícito do titular.
- **Handoff da T-B6** (PR #21, mergeado em `8e6e935`):
  `docs/HANDOFF-CODEX-T-B6.md`.
- **Login** (PR #22, mergeado em `b97721c`): erro de envio honesto e volta à
  página pedida depois de entrar. O destino é validado por `safeInternalPath`
  (`src/features/auth/destination.ts`), que recusa endereço externo para o
  recurso não virar redirecionamento aberto.

### Estado do trabalho

**O front não tem nenhum item de código aberto.** Sobram só duas observações de
teste instável, nenhuma bloqueando nada: `gift-list.spec.ts:142` no `mobile` e
`panel.spec.ts:1755`. Ambas passaram nas últimas rodadas completas; estão
anotadas no quadro para olhar se reaparecerem.

**A T-B5 está encerrada** desde 21/09, por decisão do titular: aceitar os 2,2 s
medidos. Não reabrir achando que é pendência — esse engano já aconteceu nesta
sessão, por leitura de uma seção antiga deste próprio arquivo.

Do back sobra só uma parte da **T-B6**. A integração órfã "Workers Builds"
foi desconectada pelo titular em 23/09, e o PR #23 e a `main` (`8c16661`)
passaram em Pages e CI sem o check. A sequência de backups está limpa: oito
execuções agendadas com sucesso de 16 a 23/09. Resta a restauração com dados
e Storage reais e a medição do RTO, que dependem do conteúdo do titular.
O deadlock intermitente de 16/09 foi reproduzido e corrigido no mesmo dia
(era a limpeza dos testes, não o produto). Evidências em
`reviews/2026-09-23-t-b6.md`.

### O que depende do titular, não de código

Juntar o conteúdo real (local, instruções, imagem autorizada); o ensaio com o
irmão e um convidado, no celular e no navegador do WhatsApp; e a inspeção
manual com leitor de tela. Sem o conteúdo real, a restauração de backup com o
RTO também não anda.

**Congelamento a partir de 05/10:** dali até 01/11, só correções.


## Retomada do front — 2026-09-18, Claude (`claude/front`)

Esta seção vale para o clone do Claude (`~/projetos/chadbb-claude`). O commit
desta data traz, sem PR ainda:

- **Fluxo de criação semi-linear:** "Evento criado" → prévia → publicar → etapas
  "Convidados e presença" e "Lista de presentes" marcadas pelo organizador
  (`events.guests_done_at`/`gifts_done_at`, RPC `set_event_step`), barra de
  pendências no rodapé e abas escondidas na tela de dados durante a configuração.
- **Lista editável:** remover item (`remove_event_item`, recusa com reserva
  ativa), mimo próprio (`add_custom_treat`) e seção única "Adicionar à lista"
  com só as sugestões que faltam.
- **Mapa no convite:** embed interativo do Google carregado com o convite
  (decisão do titular em 18/09, substitui a de 17/09), "Como chegar", bloco
  "Informação importante" e `frame-src` do Google na CSP.
- Migrations novas: `20260918000000_event_setup_steps.sql` e
  `20260918010000_list_item_removal.sql`, com pgTAP `event_steps` e `list_items`.

### 1. Código e dependências

```sh
cd ~/projetos/chadbb-claude
git fetch origin && git checkout claude/front && git pull
npm ci
```

### 2. Banco local (Supabase na máquina nova)

As migrations de 18/09 só foram aplicadas no banco local da máquina do trabalho.
Na máquina nova, com a stack no ar (`npm run db:start`, no clone do Codex ou neste):

```sh
cd ~/projetos/chadbb-claude
npx supabase migration list --local   # conferir o que falta
npx supabase migration up --local     # aplica 20260918000000 e 20260918010000
npm run db:test                       # esperado: 7 arquivos, 137 testes ok
```

Se `migration up` recusar com `LegacyMigrationMissingLocalError` (o banco tem
migration que este clone não tem, como `20260917010000_guest_rates_batch` da
`codex/back`), **não** use `migration repair`. Aplique cada arquivo numa transação
e registre a versão (não apaga nada):

```sh
for m in 20260918000000_event_setup_steps 20260918010000_list_item_removal; do
  { echo "begin;"; cat supabase/migrations/$m.sql
    echo "insert into supabase_migrations.schema_migrations(version, name) values ('${m%%_*}', '${m#*_}');"
    echo "commit;"; } | docker exec -i supabase_db_chadbb psql -U postgres -d postgres -v ON_ERROR_STOP=1
done
```

Alternativa destrutiva (apaga os dados locais, pede aprovação): `npm run db:reset`
a partir deste clone.

### 3. Conferência antes de seguir

```sh
npm run check        # 51 unitários, lint, tipos e build
npm run test:e2e     # porta 4173 livre; ~10 min
```

### 4. Concluído em 2026-09-21 — `db push` e deploy da Edge `guest`

Feito com aprovação do titular, depois que a unificação das branches (`clone-main`)
pôs as três migrations de setembro na mesma árvore:

1. `db push --dry-run --project-ref fcykqrlnofmdtmewlejr` (sem `link`, sem `--linked`,
   sem `--db-url`) listou só as três esperadas: `20260917010000_guest_rates_batch`,
   `20260918000000_event_setup_steps`, `20260918010000_list_item_removal`.
2. `db push` aplicou as três. `migration list` remoto e branch ficaram iguais:
   **24 de cada lado, nenhuma sobrando**.
3. `supabase functions deploy guest --project-ref …`: a Edge passou a usar
   `check_guest_rates` (T-B5). A RPC já estava em produção — banco antes da função.
4. `npm run health:remote` (somente leitura): **6/6**, com backup no R2 de 0,5 h.

**Lição de ordem:** a `main` foi enviada antes do `db push`, e o Cloudflare Pages
publica a partir dela. Isso abriu ~40 min com front novo e banco antigo, em que
"Concluí…", "Remover da lista" e "Adicionar mimo" falhariam para o organizador
(convite, presença e reserva do convidado não dependiam do que faltava). Na próxima
leva, **empurrar o banco antes da branch que o Pages publica**.

## Retomada prioritária — 2026-09-16, Codex/back

Esta seção prevalece sobre o registro histórico abaixo. Clone do Codex:
`~/projetos/chadbb-codex`, branch **`codex/back`**, remoto
`https://github.com/cyrqrz/chadbb.git`. Não trabalhar na pasta `~/projetos/chadbb`
do usuário nem no clone do Claude. O usuário seguirá com o Claude no front
enquanto o back fica neste ponto de retomada.

### Entregue e validado

- **T-B1:** SMTP Resend configurado no Auth após aprovação. O próprio titular
  assumiu como organizador, usando o e-mail da sua conta Resend. Confirmou
  entrega, login, persistência após recarga, logout e proteção de `/eventos`.
  Production do Pages tinha `│ ` antes da URL e espaço antes da chave pública;
  corrigido com aprovação e rebuild validado. Preview já estava correto.
- **T-B2/T-B3:** testes de convites e pós-evento ampliados; **62/62** no Postgres
  portátil. Contrato atualizado para descrever cancelamento/compra após fechar,
  com convite válido. Nenhuma migration nova ou alteração de política remota.
- **T-B4:** runner isolado revisado e testado localmente; execução remota
  autorizada condicionalmente pelo titular e concluída. Criar/editar/publicar
  evento e lista e negar acesso cruzado passaram; limpeza restrita confirmou
  zero contas, eventos e itens fictícios restantes.
- **T-B5:** instrumento local preparado e revisado pelo especialista sênior.
  Último ensaio: p95 leitura **711 ms**, escrita **692 ms**; atualização visual
  **4960 / 4932 / 4965 ms**; zero erros e zero dados fictícios restantes.
  Primeiro ensaio ultrapassou 2 s e continua registrado. **Não é prova remota.**
- Agente de apoio `tdd_senior` em `.codex/agents/tdd-senior.toml`; modelo e
  permissões herdados, sem autorização especial de produção. Achou problemas
  reais no instrumento T-B5, corrigidos com testes RED/GREEN.
- `npm run check` aprovado; gate de métricas **13/13**; isolamento/interrupção
  T-B5 **3/3**; isolamento do smoke T-B4 **2/2**. Sem reset da stack compartilhada.

### Onde retomar

1. Ler `AGENTS.md`, `docs/TAREFAS-AGENTES.md` e
   `docs/PLANO-DESEMPENHO-T-B5.md`.
2. **Próximo gate é T-B5 remoto**, ainda sem aprovação específica: apresentar
   dry-run de 1 conta, 1 evento, 27 itens, 50 convites e teto 420 POSTs guest.
   Comando proposto está no plano. Não interpretar aprovação da T-B4 como
   autorização de carga. Se p95 reprovar, investigar sem mudar o limite para
   passar. Sincronização é medida após carga; não prova simultaneidade com 50.
3. T-B6 continua pendente: sequência diária de backups, restauração com conteúdo
   e Storage reais quando cadastrados, RTO completo e integração Workers Builds.
   Não houve leitura nova do histórico de backups nesta sessão.
4. T-B7: acompanhar pedidos do Claude em `TAREFAS-AGENTES.md`.

Não executar o smoke antigo `tests/remote/smoke.mjs` em produção com dados reais:
ele pressupõe ausência de tráfego real, limpa cotas compartilhadas e chama
retenção global. Usar o runner isolado `tests/remote/organizer-smoke.mjs` apenas
sob o gate correspondente. O remoto já tem ao menos a conta do titular; não
reutilizar a premissa histórica de projeto vazio.

### Código no PC de casa

Após a publicação autorizada da branch, em uma pasta que ainda não exista:

```sh
git clone --branch codex/back https://github.com/cyrqrz/chadbb.git chadbb-codex
cd chadbb-codex
nvm use
npm ci
git status --short
```

Se o clone já existir, conferir alterações locais antes de atualizar a branch;
nunca descartar trabalho para forçar sincronização. Commits/push/merge continuam
dependendo dos gates do `AGENTS.md`. Integração com o front somente por PR/main
e merge pelo usuário. Claude pode consultar os documentos da branch via
`git show origin/codex/back:docs/TAREFAS-AGENTES.md` após fetch, sem misturar código.

Docker Desktop: habilitar a distro WSL; nesta máquina é `Ubuntu-24.04`.
Verificar `docker version`, iniciar Supabase somente no clone Codex se necessário
(`npm run db:start`, sem reset), e servir Edge com `npm run functions:serve`.
A porta 5173 precisa estar livre para o ensaio T-B5 local. O runner sobe e fecha
seu Vite, sem encerrar servidor de outro agente. Node 22.

Comandos independentes e seguros de preparação:

```sh
node tests/load/event-performance.mjs --dry-run
node tests/remote/organizer-smoke.mjs --dry-run
npm run check
node --test tests/local/performance-gates.test.mjs
```

### Credenciais fora do Git

A chave SMTP acrescentada nesta sessão é `~/.config/chadbb/resend-api-key`,
modo 600. **Não está incluída automaticamente no pacote histórico de transferência.**
SMTP já está configurado remotamente e o site continua funcionando sem o PC.
Se precisar copiar a chave para casa, usar gerenciador de senhas ou transferência
cifrada por canal seguro; nunca chat, docs ou repositório em texto claro.
Os demais arquivos e sessões CLI seguem o procedimento histórico abaixo.

### Recado para o front

Login real está liberado. O titular relatou que “Conheça o chadbb” parece não
fazer nada: hoje aponta para `#como-funciona`, já visível na tela. Pedido
registrado para Claude tornar CTA claro e retirar “Convites estão em preparação”.
Não alteramos arquivos do front nesta sessão.

## Registro histórico — 2026-09-15

Escrito em 2026-09-15, no PC do trabalho (`SFRNTTI01`), ao encerrar a sessão em
que o backup diário entrou em operação. Substitui a seção equivalente de
`OPERACAO-M6.md`, que não menciona `r2.env` nem a sessão do `wrangler`.

## Estado que você encontra

Tudo está mesclado na `main`, em `a6ecdf4`. Não há branch aberta, nem trabalho
não commitado, nem PR pendente.

| Componente | Situação |
|---|---|
| Backup diário cifrado no R2 | Rodando sozinho às 07:23 UTC (04:23 BRT) |
| Health check | A cada 6 horas, seis verificações |
| Pages Production e Preview | Configurados |
| Supabase `chadbb-cha` | 20 migrations, `guest` v2 e `retention` v1 ativas |
| Dados | Zero usuários, zero eventos, zero objetos no Storage |

O ponto importante: **o backup e o monitoramento não dependem mais de nenhuma
máquina sua.** Rodam no GitHub. Trocar de PC não interrompe nada.

## O que precisa ser transferido

O repositório é só `git clone`. O que não está no Git são os segredos em
`~/.config/chadbb/`:

| Arquivo | Para quê |
|---|---|
| `backup-private.asc` | **Decifrar backups. Sem ele nenhum backup é recuperável.** |
| `backup-public.asc` | Cifrar novos backups |
| `backup-gnupg/` | Chaveiro usado pelos ensaios de restauração |
| `chadbb-cha.db-password` | Conectar ao banco remoto |
| `r2.env` | Ler e escrever no bucket de backups |
| `pages-production.env` | Variáveis públicas do Pages |
| `retention-cron-secret` | Acionar a retenção manualmente |
| `supabase-ca.crt` | Cópia da CA; também existe em `scripts/backup/` |

### Como transferir

O repositório privado `Leonardocmartins02/chadbb-secret-transfer` já tem o
mecanismo. São dois passos, nesta ordem, porque o segundo depende do primeiro.

**1. Pacote principal**, cifrado com senha (AES256, simétrico). A senha viaja por
outro canal — gerenciador de senhas, nunca por mensagem ou commit.

```bash
gh repo clone Leonardocmartins02/chadbb-secret-transfer
cd chadbb-secret-transfer
mkdir -p ~/.config/chadbb && chmod 700 ~/.config/chadbb
gpg --output pacote.tar.gz --decrypt chadbb-secrets-transfer.tar.gz.gpg
tar -xzf pacote.tar.gz -C ~/.config/chadbb
rm -f pacote.tar.gz
chmod 600 ~/.config/chadbb/*
```

**2. Credenciais do R2**, cifradas para a chave de backup — por isso o passo 1
vem antes:

```bash
bash sync-r2.sh import
```

O script recusa sobrescrever um `r2.env` existente, valida os quatro campos
obrigatórios e instala com permissão 600.

### Confira antes de seguir

```bash
ls -l ~/.config/chadbb/
```

Devem existir sete entradas, todas `600` (ou `700` para `backup-gnupg/`). Se
`backup-private.asc` não estiver lá, pare: sem ela os backups são ilegíveis.

## Sessões de CLI a refazer

Credenciais de CLI não vêm no pacote. Na máquina nova:

```bash
gh auth login          # GitHub
npx supabase login     # Supabase
npx wrangler login     # Cloudflare — necessário para ler/ajustar o Pages
```

O `wrangler` passou a ser necessário nesta sessão; o registro anterior dizia que
o CLI não tinha credencial Cloudflare, o que deixou de ser verdade.

## Docker: o que muda sem ele

O Docker Desktop está instalado no PC do trabalho. Se a outra máquina não tiver,
**isto continua funcionando**:

- `npm run health:remote` — precisa apenas de Node e da AWS CLI
- Todo o trabalho de Git, `gh`, `supabase` e `wrangler`
- O backup diário e o health check, que rodam no GitHub

**Isto exige Docker:**

- `npm run db:start`, `db:reset`, `db:test` e toda a suíte local
- `npm run backup:remote` — captura manual
- `npm run test:recovery:archive` — ensaio de restauração

Como a captura e a publicação agora rodam no GitHub, a ausência de Docker deixa
de ser bloqueio operacional. Vira limitação de desenvolvimento: sem ele não dá
para rodar os testes antes de abrir PR, e o CI passa a ser a primeira validação.

A AWS CLI é necessária para a verificação de frescor do backup. Sem ela, essa
verificação é marcada `SKIP` em vez de falhar, e as outras cinco continuam.

## Primeiros comandos ao retomar

```bash
git clone https://github.com/cyrqrz/chadbb.git && cd chadbb
npm ci
set -a && . ~/.config/chadbb/r2.env && set +a
npm run health:remote
```

O esperado é **6/6**. Se a verificação de backup acusar idade acima de 36 h,
alguma execução agendada falhou — confira em
`gh run list --workflow="Backup diário"`.

## O que continua pendente

1. **SMTP no Resend.** É o único item que ainda impede alguém de entrar no
   sistema. Decidido usar `resend.dev` sem domínio, com a conta registrada no
   e-mail do organizador. Ver a seção de decisão em `PROXIMOS-PASSOS-M6.md`.
2. **Dados reais.** Enquanto o evento não for cadastrado e a capa enviada, o
   backup não exercita os caminhos de Storage e de dados de usuário.
3. **Integração "Workers Builds" órfã** na Cloudflare, que reprova um check e
   comenta "Deployment failed" em todo PR. Cosmético; o Pages real passa.
4. **Sequência de backups diários** ainda não observada — houve uma execução
   manual, bem-sucedida.

## Custódia da chave privada

`backup-private.asc` agora existe em duas máquinas e dentro do pacote no
repositório privado. Continua valendo o registro anterior: uma cópia precisa
existir fora das duas máquinas, em gerenciador de senhas ou mídia cifrada, e
**nunca** no mesmo lugar que os backups que ela decifra — ou seja, jamais no
bucket do R2.
