# Próximos passos e validações — M6

Situação em 2026-09-15, branch `entrega-m6`. Complementa `OPERACAO-M6.md`, que
descreve o desenho do backup e o ensaio local de recuperação.

## O que foi concluído nesta sessão

O backup remoto saiu do papel. `npm run backup:remote` executou pela primeira
vez contra o `chadbb-cha` e produziu
`~/.config/chadbb/backups/chadbb-2026-09-15T11-12-38-606Z.tar.gz.gpg`
(31.684 bytes, modo 600, SHA-256 `5d50de77…52151c`).

Duas correções foram necessárias no `scripts/backup/remote.mjs`:

- **`--user` no `docker run`.** O container rodava como root e os arquivos
  nascidos no bind mount ficavam root. O `chmod 0600` seguinte, feito pelo host
  como uid 1000, falhava com `EPERM` e abortava na etapa `dump roles`. Não era
  falha de acesso ao Supabase: a conexão TLS, o snapshot, as contagens, as
  migrations, o cron e o inventário de Storage já tinham passado. O sintoma
  aparecia como erro de dump porque o script não relatava a causa.
- **`CHADBB_BACKUP_DEBUG=1`.** Modo de diagnóstico opcional que guarda os
  últimos 4 KB do stderr do processo filho e a mensagem da exceção, com a senha
  do banco substituída por `***`. Desligado por padrão; o comportamento de não
  relatar saída do filho continua sendo o normal.

### Validações já executadas

- Decriptação com a chave privada em `~/.config/chadbb/backup-gnupg`: bem
  sucedida. Cifra RSA-3072 para a sessão, AES256 em modo AEAD/OCB.
- SHA-256 do arquivo cifrado idêntico ao relatado pelo script.
- SHA-256 dos cinco arquivos internos (`roles.sql`, `schema.sql`, `data.sql`,
  `migrations.json`, `cron.json`) idênticos aos do `manifest.json`.
- 20 migrations no `migrations.json`, batendo com as 20 aplicadas no projeto.
- `cron.json` com o job `personal-data-retention`, `17 6 * * *`, ativo.
- `roles.sql` com os `statement_timeout` de `anon` (3s), `authenticated` (8s) e
  `authenticator` (8s), sem senhas de role.
- Texto claro apagado após a conferência.

## Achado que limita o alcance dessa validação

O projeto remoto está **vazio**. O manifest registra:

| Tabela | Linhas |
|---|---|
| `auth.users` | 0 |
| `public.events` | 0 |
| `public.event_items` | 0 |
| `public.products` | 27 |
| `private.invitations` | 0 |
| `private.guest_sessions` | 0 |
| `public.reservations` | 0 |
| `private.guest_requests` | 0 |
| `storage.objects` | 0 |

Os 27 produtos são a carga inicial do catálogo. Consequência prática: este
backup prova o caminho de **roles, schema, migrations e cron**, e não prova o de
**dados de usuário nem de Storage**. O laço que copia objetos do Storage não
executou nenhuma vez, e a checagem que recusa bucket privado
(`objects.every(...)`) passou por vacuidade, sobre lista vazia. O ensaio local
(`test:recovery:local`) cobre dados e capa, mas contra uma origem local — não
contra o arquivo cifrado que o script remoto gera.

Portanto: **não tratar o backup como validado para dados reais** até repetir a
captura com o evento cadastrado e pelo menos uma capa no bucket `event-public`.

## Passos pendentes, em ordem

### 1. Restauração real a partir do arquivo cifrado

**Concluída em 2026-09-15 para o arquivo capturado às 11:12:38 UTC.**
`npm run test:recovery:archive -- /caminho/backup.tar.gz.gpg` descriptografa e
restaura o pacote em Supabase local descartável, sem acessar a origem remota.
Requer Docker, gpg, Python 3.12+ e o chaveiro privado em
`~/.config/chadbb/backup-gnupg` (ou `CHADBB_BACKUP_GNUPGHOME`).

Resultado: **40,639 s** incluindo preparação; **0,458 s** de importação e
validação. SHA-256 do cifrado:
`5d50de77a96c0673dc27e9ff38de86db4cc476911b918263b4dd4daeeb52151c`.
Conferidos os cinco hashes internos, as 11 contagens do manifest, as 20
migrations completas, nome/horário/comando/estado do cron, timeouts das três
roles e bloqueio de anon ao schema privado e à retenção. Cron foi recriado com
seu estado original, mas o agendador ficou desligado durante todo o ensaio.

As portas 55321–55329 foram recusadas pelo encaminhamento do Docker desta
máquina; o ensaio do arquivo usa **56321–56329**. Containers, volumes e texto
claro do destino foram removidos. Diagnósticos de comandos que falham ficam
em diretório privado `/tmp/chadbb-archive-diagnostic-*`, para análise local.

O resultado cobre o pacote vazio de dados de usuário. Não valida login remoto,
Edge Functions, Storage com objetos ou o RTO operacional completo.

Validações de aceite:

- Destino Supabase descartável recebe `roles.sql`, `schema.sql` e `data.sql`
  extraídos do arquivo cifrado, com os grants automáticos neutralizados antes de
  criar os objetos, conforme o cuidado já registrado em `OPERACAO-M6.md`.
- Histórico de migrations reimportado e conferido nas 20 entradas.
- Cron recriado explicitamente — não vem junto com o dump.
- Contagens no destino idênticas às do `manifest.json`.
- Tempo total medido, para comparar com o RTO de 2 h.

### 2. Recaptura com dados reais

Depois que o evento for cadastrado e a capa enviada.

Validações de aceite:

- `storageObjects` maior que zero na saída do script.
- SHA-256 de cada objeto no manifest igual ao do arquivo baixado do bucket.
- Restauração do passo 1 repetida, agora conferindo linhas de `events`,
  `event_items`, `invitations` e `reservations`, e o download da capa.

### 3. Destino externo: Cloudflare R2

Decidido nesta sessão. Motivos: mesma conta que já hospeda o Pages, egress zero
(ensaios de restauração não custam, então serão realmente feitos), 10 GB no
plano gratuito contra um backup de ~31 KB, API compatível com S3 e regras de
ciclo de vida para a retenção.

A informação inicial de bucket/token existentes não havia sido verificada e
foi corrigida ao abrir o painel: o R2 ainda não estava ativado. O titular então
ativou o serviço, criou o bucket `chadbb-backups`, a regra de retenção de
**30 dias** e um token. Credenciais salvas em
`~/.config/chadbb/r2.env` (modo 600). O modelo contém `R2_ENDPOINT`, `R2_BUCKET`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_DEFAULT_REGION=auto`.

A transferência entre PCs foi preparada no repositório privado
`Leonardocmartins02/chadbb-secret-transfer`: `sync-r2.sh` exporta/importa
`r2.env.gpg` usando a chave de backup. O pacote original cifrado com senha foi
preservado. A chave privada viaja por outro canal. O repositório de aplicação
`cyrqrz/chadbb` é público; credenciais abertas nunca entram nele.

Pendente conferir no painel e por execução real:

- Confirmar nome e endpoint S3 do bucket criado.
- Confirmar token de API com escopo restrito a esse bucket, permissão de
  leitura e escrita de objetos, sem acesso a outros recursos da conta.
- Configurar regra de ciclo de vida de **30 dias** para os backups.

Validações de aceite:

- Upload e download de um arquivo de teste com `rclone` ou `aws s3`.
- Token recusado ao tentar listar outro bucket da conta.
- Objeto com mais de 30 dias desaparece após a regra de ciclo de vida entrar.

### 4. Agendamento diário: GitHub Actions

O PC do trabalho não fica ligado; agendador local produziria falha silenciosa. O
Actions cobre agendamento, alerta de falha (notificação nativa) e ambiente com
Docker, rodando o `remote.mjs` sem alteração.

Implementação preparada em `.github/workflows/backup.yml`, com disparo manual
e horário diário de 07:23 UTC (04:23 Brasília). O script
`scripts/backup/publish-r2.mjs` exige relatório de captura concluída e SHA-256
local válido antes do upload; depois baixa o objeto e confere novamente o hash.
Falhas de captura impedem a etapa de publicação; falhas na conferência do R2
fazem o job falhar. Arquivos do runner são removidos ao final.

**Agendamento ainda não ativo; publicação local validada contra R2.** O workflow precisa estar na branch
padrão para agendamento. O GitHub pode atrasar ou descartar execuções agendadas;
acompanhar a idade do último backup continua necessário.

Secrets necessários no repositório de aplicação:

- `CHADBB_BACKUP_DB_PASSWORD`
- `CHADBB_BACKUP_PUBLIC_KEY` (conteúdo ASCII da chave **pública**)
- `CHADBB_R2_ENDPOINT`
- `CHADBB_R2_BUCKET`
- `CHADBB_R2_ACCESS_KEY_ID`
- `CHADBB_R2_SECRET_ACCESS_KEY`

Variável necessária: `CHADBB_BACKUP_RECIPIENT`, fingerprint da chave pública.
A consulta desta rodada encontrou zero secrets e zero variáveis no repositório.

Referências: [AWS CLI com R2](https://developers.cloudflare.com/r2/examples/aws/aws-cli/)
e [agendamento no Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Nesse desenho, a senha do banco passa a existir no GitHub. Um comprometimento
com acesso aos secrets do workflow pode expor a senha e os dados acessíveis no
banco. A chave pública sozinha não decifra os backups já
existentes. Isso não protege novas capturas contra um workflow adulterado.

Validações de aceite:

- Execução manual (`workflow_dispatch`) gera arquivo novo no R2.
- Execução agendada dispara no horário previsto.
- Falha proposital (senha errada) gera notificação e **não** publica arquivo
  parcial.
- Dois dias seguidos de execução, com os dois arquivos presentes no R2.

### 5. Metas RPO 24 h e RTO 2 h

Só podem ser declaradas cumpridas depois de 1 a 4. Um backup manual e um
roteiro não são garantia.

Validações de aceite:

- Série de pelo menos sete backups diários consecutivos, sem lacuna.
- Um ensaio de restauração cronometrado a partir do arquivo mais recente do R2,
  concluído em menos de 2 h, incluindo reconfiguração de Auth e redeploy das
  Edge Functions.

### 6. Pages: variáveis de ambiente

Pendente desde 14/09. `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no
ambiente Production do projeto `chadbb`, com os valores de
`~/.config/chadbb/pages-production.env`, seguidos de novo build da `main`. Nunca
usar chave `service_role` no frontend.

**Causa confirmada em 2026-09-15.** No projeto Pages, tanto Production quanto
Preview têm apenas `NODE_VERSION`; as duas variáveis públicas do Supabase não
existem em nenhum dos dois ambientes. Como o Vite resolve `import.meta.env` em
tempo de build, o bundle sai sem endereço nem chave, e a tela de entrada informa
conexão não configurada. Não é falha de runtime nem de callback do Auth.

Verificação independente pelo artefato publicado, sem uso de credencial:
`https://chadbb.pages.dev/assets/index-B17_76md.js` (298.303 bytes) não contém
nenhuma ocorrência de `*.supabase.co` nem de `sb_publishable_`. A mesma inspeção
confirmou que **nenhum segredo vazou** para o bundle: sem `sb_secret_`, sem
`service_role`.

Corrigir **os dois ambientes**. Só Production deixaria todo deploy de preview
igualmente quebrado, e é em preview que os PRs seriam conferidos antes do merge.

**O bloqueio mudou.** O registro em `OPERACAO-M6.md` dizia que o CLI desta
máquina não tinha credencial Cloudflare; hoje o `wrangler` está autenticado por
OAuth como `leonardocmartins02@hotmail.com`, com acesso à conta
`Queirozcyro@gmail.com's Account` (`551bc632…`), onde o projeto `chadbb` vive.
Ou seja, a configuração passou a ser executável daqui — mas é escrita em
ambiente hospedado e permanece sob aprovação explícita do titular.

Validações de aceite:

- As duas variáveis presentes em Production **e** em Preview.
- Novo build da `main` concluído após a configuração — variável criada sem
  rebuild não entra em bundle já publicado.
- Bundle publicado passa a conter a URL e a chave publishable.
- Bundle publicado continua sem `sb_secret_` e sem `service_role`.
- Tela de entrada deixa de informar conexão não configurada.
- Requisição do frontend ao Supabase retorna 200.

### 7. SMTP via Resend

Pendente. Exige domínio próprio verificado — o domínio de teste `resend.dev` só
entrega para o e-mail da conta e não valida entrega ao organizador.

Validações de aceite:

- Registros DNS verificados no Resend.
- E-mail de login recebido em endereço externo à conta Resend.
- PKCE no mesmo navegador, persistência de sessão, logout e rotas protegidas.

## Custódia da chave privada

`~/.config/chadbb/backup-private.asc` continua na mesma máquina que os backups.
Enquanto isso for verdade não existe proteção fora da máquina, apenas a aparência
dela. A chave precisa ir para o gerenciador de senhas do titular e para uma
cópia offline, e **não** pode ser guardada no R2 junto dos arquivos que ela
decifra. Sem ela, nenhum backup é recuperável.

## Ordem sugerida

Passos 1, 3 e 4 destravam a continuidade e não dependem do evento estar
cadastrado. O passo 2 espera os dados reais. Os passos 6 e 7 são independentes do
backup e dependem de ação do titular no painel da Cloudflare e do Resend.

## Validações de implementação nesta continuidade

- `npm run lint`, checagem de sintaxe Node e `git diff --check`: aprovados.
- Ensaio completo do arquivo cifrado: aprovado conforme passo 1.
- Publicação R2 com CLI simulada: sucesso, download corrompido, hash local
  inválido e endpoint externo recusado verificados; não substitui o teste real.
- Transferência cifrada: campos vazios recusados, exportação/importação com
  dados sintéticos idênticos, modo 600 e proteção contra sobrescrita conferidos.

## R2 validado — 2026-09-15, 11:47 UTC

Nova captura somente leitura concluída e publicada em `chadbb-backups`:
`chadbb-2026-09-15T11-47-30-239Z.tar.gz.gpg`, 31.681 bytes.
O download do R2 teve SHA-256 idêntico ao arquivo local:
`d684451cc5c8e2eacac0397ed04ae07b2cc75c9b7a792ed58f4cebb1dcab78a8`.
A captura continua com 20 migrations e zero objetos Storage.

O `HeadObject` retornou a regra `excluir-apos-30-dias` e expiração em
**2026-10-15 11:47:53 UTC**, comprovando a regra aplicada ao objeto. A exclusão
futura ainda precisa ser observada. O escopo do token sobre outros buckets não
foi testado.

`r2.env.gpg` enviado ao repositório privado de transferência no commit
`6f29f89`; sua decriptação foi comparada com o arquivo local e é idêntica.
O pacote original de transferência foi preservado. Para o outro PC, usar
`git pull` e seguir `README.md` / `sync-r2.sh import` com a chave privada local.

Pendente: integrar e executar o workflow, validar alertas e observar a sequência
de backups diários. Nenhuma meta RPO/RTO passa a estar garantida apenas com esse
upload manual. (Os secrets e a variável foram configurados em seguida — ver a
seção de 2026-09-15, 13:30 UTC.)

## Validação do job `database` — 2026-09-15, 12:00 UTC

A correção da espera da Edge Function (`eb55e19`) ficou em teste quando a sessão
anterior terminou. O job inteiro foi reproduzido localmente, com a stack de
desenvolvimento, e passou:

| Etapa | Resultado |
|---|---|
| `db:reset` + `db:test` | 50/50 testes, 4 arquivos |
| Espera da Edge `guest` | pronta na tentativa 2 (~4 s), contra 60 tentativas de teto |
| `test:api` | 17/17 |
| `test:browser:local` | 8/8 |
| `test:email:local` | 1/1 |

A premissa da correção foi conferida no código antes de rodar: `guest` tem
`verify_jwt = false` em `config.toml`, responde 405 `METHOD_NOT_ALLOWED` a GET
(`index.ts:38`), e `http://localhost:5173` está na allowlist padrão de origens,
que o `local-test.env` não sobrescreve. A troca de OPTIONS por GET é o ponto: o
Kong responde OPTIONS antes do runtime Edge existir, então a sonda antiga podia
liberar os testes cedo demais.

Observações sobre o workflow de backup, ainda não exercitado no GitHub:

- O alerta de falha depende da notificação padrão do GitHub, que para execuções
  agendadas vai a quem alterou o cron por último. É frágil como único alerta.
- O GitHub desativa workflows agendados após 60 dias sem atividade no
  repositório. Depois do chá o repositório tende a ficar quieto, e o backup
  pararia em silêncio. Convém acompanhar a idade do último objeto no R2.

## Avanço do backup e health check — 2026-09-15, 13:30 UTC

### O agendamento diário tem um bloqueio estrutural

`backup.yml` existe **apenas em `entrega-m6`**. A branch padrão do repositório é
`main`, e o GitHub dispara `schedule:` somente a partir dela. `gh workflow list`
confirma: só `CI` aparece, e o backup nem como `workflow_dispatch` está
disponível. **O backup diário não roda até o workflow chegar na `main`.**

Ordem importa: mesclar `entrega-m6` na `main` dispara um build de produção do
Pages, porque `production_branch` é `main`. Enquanto as duas variáveis `VITE_*`
não existirem, esse build sai tão incompleto quanto o atual. Configurar o Pages
antes do merge evita publicar de novo um site sem conexão.

### Secrets e variável já configurados

No repositório `cyrqrz/chadbb`, em 2026-09-15 11:51: `CHADBB_BACKUP_DB_PASSWORD`,
`CHADBB_BACKUP_PUBLIC_KEY`, `CHADBB_R2_ENDPOINT`, `CHADBB_R2_BUCKET`,
`CHADBB_R2_ACCESS_KEY_ID`, `CHADBB_R2_SECRET_ACCESS_KEY` como secrets, e
`CHADBB_BACKUP_RECIPIENT` como variável, com valor
`63054589D5D37A839C34AEE0B7D2C32BCA0344D0` — idêntico ao fingerprint da chave
local de backup.

### O caminho de variáveis do workflow foi exercitado

Nenhuma execução tinha usado os overrides que o `backup.yml` aplica. Simulados
localmente com sucesso: `CHADBB_BACKUP_PUBLIC_KEY_FILE` a partir de chave
exportada, `CHADBB_BACKUP_OUT` para diretório próprio e a asserção de
`CHADBB_BACKUP_RECIPIENT`. O `report.json` saiu limpo no stdout, que é o formato
que o `publish-r2.mjs` consome, e o diretório de backups local ficou intacto.

O artefato produzido por esse caminho foi restaurado por
`npm run test:recovery:archive`: aprovado, **39,973 s** no total e **1,128 s** de
importação e validação, com 20 migrations, cron recriado e as onze contagens
idênticas ao manifest. É a primeira vez que um arquivo gerado pelo caminho do
workflow é restaurado de fato.

O bucket `chadbb-backups` contém um objeto, o de 11:47, confirmando o registro
anterior.

### Health check implementado

`npm run health:remote` (`scripts/health/check.mjs`), agendado por
`.github/workflows/health.yml` a cada 6 horas. Sem dependências: só módulos
nativos do Node e a AWS CLI já presente no runner. Cinco verificações:

| Verificação | Critério |
|---|---|
| edge guest responde | 405 `METHOD_NOT_ALLOWED` para a origem do site |
| edge guest recusa origem estranha | 403 `ORIGIN_DENIED` |
| frontend configurado | bundle contém a URL do projeto e `sb_publishable_` |
| frontend sem segredo | bundle **sem** `sb_secret_` e sem `service_role` |
| backup recente no R2 | objeto mais novo com menos de 36 h |

Erros da AWS ficam fora do log, porque podem conter detalhes da requisição. Sem
credenciais de R2 a última verificação é marcada `SKIP` em vez de falhar, para
continuar executável na máquina do titular.

Resultado da primeira execução: **4 de 5**, com a única falha sendo
`frontend configurado` — o estado real do Pages. O workflow ficará vermelho até
as variáveis serem aplicadas, e isso é o sinal correto, não um defeito da
verificação. Esse mesmo health check passa a proteger contra alguém remover as
variáveis depois.

Vale lembrar que `health.yml` tem o mesmo bloqueio de `backup.yml`: só passa a
rodar quando estiver na `main`.
