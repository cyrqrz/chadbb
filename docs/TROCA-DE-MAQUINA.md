# Retomar o chadbb em outra máquina

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

### 4. Pendente — `db push` no `chadbb-cha` (gate remoto, aprovação manual)

Obrigatório **antes do merge do PR** do front: sem as migrations, "Concluí…",
"Remover da lista" e "Adicionar mimo" falham em produção.

1. Confirmar a ordem com a `codex/back`: a migration `20260917010000_guest_rates_batch`
   é anterior às de 18/09. Se ela já estiver no remoto, o push a partir deste clone
   recusa; faça o push de uma branch que tenha as três (ex.: depois do merge da
   `codex/back` na `main` e `git pull origin main` aqui).
2. `db push --dry-run` com `--project-ref fcykqrlnofmdtmewlejr`, sem `supabase link`,
   sem `--linked` e sem `--db-url` (regra 2 do `AGENTS.md`). A lista deve ter só as
   migrations esperadas. Mostrar ao titular e esperar aprovação.
3. `db push` e `migration list` remoto igual ao local.
4. Abrir o PR `claude/front` → `main` com a CI verde.

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
