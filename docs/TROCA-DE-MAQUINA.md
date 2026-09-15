# Retomar o chadbb em outra máquina

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
