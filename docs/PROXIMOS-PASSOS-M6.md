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

Ainda não feita. O ensaio local restaura de dumps soltos, não do `.tar.gz.gpg`.

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

Depende do titular, porque o CLI desta máquina não tem credencial Cloudflare:

- Criar o bucket (sugestão: `chadbb-backups`, região automática).
- Criar token de API com escopo restrito a esse bucket, permissão de
  leitura e escrita de objetos, sem acesso a outros recursos da conta.
- Definir a regra de ciclo de vida da retenção.

Validações de aceite:

- Upload e download de um arquivo de teste com `rclone` ou `aws s3`.
- Token recusado ao tentar listar outro bucket da conta.
- Objeto com mais de N dias desaparece após a regra de ciclo de vida entrar.

### 4. Agendamento diário: GitHub Actions

O PC do trabalho não fica ligado; agendador local produziria falha silenciosa. O
Actions cobre agendamento, alerta de falha (notificação nativa) e ambiente com
Docker, rodando o `remote.mjs` sem alteração.

Secrets necessários: senha do banco, chave **pública** de backup e credenciais do
R2. Vale registrar o risco: a senha do banco passa a existir no GitHub. O que o
atenua é que só a chave pública participa do pipeline — um comprometimento do
repositório expõe a senha, que é rotacionável, e **não torna nenhum backup
legível**.

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

Validações de aceite:

- Tela de entrada deixa de informar conexão não configurada.
- Requisição do frontend ao Supabase retorna 200.
- Bundle publicado não contém a chave secreta.

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
