# Arquitetura de produção e plano do backend — 2026-09-15

Levantamento pedido antes de configurar o Pages. Conclusão adiantada: **o
backend já existe, já está publicado e já está com CORS correto.** Não há um
serviço separado aguardando deploy, e as variáveis do Pages não transformam a
produção em SPA falando direto com o banco.

## O que foi verificado

`supabase functions list` no `chadbb-cha`:

| Função | Versão | Status | `verify_jwt` |
|---|---|---|---|
| `guest` | 2 | ACTIVE | false |
| `retention` | 1 | ACTIVE | false |

`supabase secrets list` confirma nove segredos server-side, entre eles
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` e `GUEST_ALLOWED_ORIGINS`. Os
valores não são legíveis pelo CLI, apenas os digests.

## Arquitetura real: dois caminhos, não um

A decisão está no ADR 001, que rejeitou explicitamente uma API Python separada e
adotou Edge Functions como camada de servidor.

### Caminho do convidado — sem login, passa pelo servidor

```
navegador → POST https://fcykqrlnofmdtmewlejr.supabase.co/functions/v1/guest
          → Edge Function guest (guarda SUPABASE_SERVICE_ROLE_KEY)
          → RPC SQL SECURITY DEFINER no Postgres
```

O convidado **nunca toca no banco**. A função valida origem, método, tamanho do
corpo (16 KB), formato do token (`/^[a-f0-9]{64}$/`), aplica cota por IP, por
token e global, e só então chama o SQL. `src/features/guests/api.ts:27` mostra o
frontend chamando por `fetch`, sem cliente de banco.

### Caminho do organizador — com login, PostgREST sob RLS

```
navegador → PostgREST com o JWT do próprio organizador
          → RLS + funções SECURITY DEFINER
```

Isto **não é acesso privilegiado**. É o organizador autenticado agindo como ele
mesmo, limitado por RLS:

- `public.events`: RLS ativo, política `owner_reads_events` restrita a
  `authenticated` com `owner_id = (select auth.uid())`. Não há política para
  `anon`.
- `public.event_items` e `public.products`: RLS ativo, leitura só para
  `authenticated` e vinculada ao evento do dono.
- `public.organizer_invitations`: `revoke all ... from public, anon,
  service_role` e `grant execute ... to authenticated`
  (`20260914050000_aggregate_guest_snapshot.sql:88-89`).

As sete RPCs chamadas pelo frontend são todas de organizador autenticado. Os
únicos `.from()` diretos são `events`, `event_items` e `products` — todos sob as
políticas acima.

## Respostas aos itens que você pediu

### Variáveis de ambiente — onde cada coisa mora

| Credencial | Onde fica | Chega ao navegador? |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | segredo da Edge Function | **Nunca** |
| `SUPABASE_DB_URL` | segredo da Edge Function | **Nunca** |
| `RETENTION_CRON_SECRET` | segredo da Edge Function | **Nunca** |
| `GUEST_ALLOWED_ORIGINS` | segredo da Edge Function | **Nunca** |
| Credenciais do R2 | secrets do GitHub Actions | **Nunca** |
| Senha do banco | secret do GitHub Actions + arquivo local 600 | **Nunca** |
| `VITE_SUPABASE_URL` | build do Pages | **Sim, por desenho** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build do Pages | **Sim, por desenho** |

As duas últimas são públicas por definição. `src/lib/config.ts:17` recusa
qualquer valor que não case com `/^sb_publishable_[A-Za-z0-9_-]+$/`, o que
bloqueia chave JWT legada e secret key. Uma `service_role` colada por engano não
funcionaria. O `.env.example` já registra a regra.

### URL pública da API

`https://fcykqrlnofmdtmewlejr.supabase.co/functions/v1/guest`. Derivada de
`VITE_SUPABASE_URL` em `api.ts:27`. Não há domínio próprio de API; adicionar um
exigiria custom domain no Supabase e não é necessário para o piloto.

### CORS — verificado em produção

Sonda somente leitura contra a função publicada:

| `Origin` enviado | Resposta |
|---|---|
| `https://chadbb.pages.dev` | **405 `METHOD_NOT_ALLOWED`** — origem aceita |
| `https://atacante.example` | 403 `ORIGIN_DENIED` |
| `http://localhost:5173` | 403 `ORIGIN_DENIED` |

Ou seja: a allowlist de produção aceita o domínio do Pages, recusa terceiros e
**não confia em origem de desenvolvimento**. Está correto e não precisa de
mudança. O fallback com `localhost` no código só vale quando
`GUEST_ALLOWED_ORIGINS` não existe, o que não é o caso remoto.

### Conexão com o banco

A Edge Function não abre conexão direta: chama PostgREST com a service key
(`index.ts:13`). A retenção usa `SUPABASE_DB_URL` no cron
`personal-data-retention` (`17 6 * * *`). Backups usam o pooler
`aws-0-sa-east-1.pooler.supabase.com:5432` com TLS `verify-full`. O host direto
`db.<ref>.supabase.co` não existe neste projeto.

### Health check — o que realmente falta

**Não existe.** É a única lacuna real deste levantamento. Proposta sem custo novo:

- Sonda de disponibilidade: `GET /functions/v1/guest` com
  `Origin: https://chadbb.pages.dev`, esperando 405 e corpo
  `{"error":"METHOD_NOT_ALLOWED"}` — exatamente a sonda já usada no CI, que
  distingue o Kong respondendo do runtime Edge pronto.
- Sonda de frescor do backup: idade do objeto mais recente em `chadbb-backups`,
  alertando acima de 36 h. Cobre a falha silenciosa do agendamento do GitHub.
- Onde rodar: um workflow agendado à parte, ou verificação manual antes do
  evento. Não recomendo serviço externo pago para um piloto.

### Integração do frontend

Nada a construir. `guestCall` já trata 4xx/5xx, converte resposta ilegível em
503 retentável e traduz os códigos conhecidos. `getClient()` lança
`BACKEND_UNAVAILABLE` quando a configuração está ausente, que é o estado atual em
produção.

## O que de fato falta, em ordem

1. **As duas variáveis `VITE_*` no Pages, Production e Preview, com rebuild.**
   É o único elo quebrado. Sem elas o navegador não sabe o endereço da API e
   nem chega na Edge Function.
2. Health check acima, se você quiser antes do evento.
3. Secrets do R2 no GitHub e primeira execução do `backup.yml`.
4. SMTP no Resend com domínio verificado.

## Sobre a preocupação de origem

A separação que você quis preservar **já está preservada** e não é afetada pelo
passo 1. Nenhuma credencial privilegiada passa a existir no navegador: a
publishable key é a credencial pública, o organizador age com a identidade dele
sob RLS, e o convidado não alcança o banco em nenhum momento. Manter as duas
variáveis fora do bundle não aumentaria a segurança — apenas manteria o site
inoperante, porque é assim que um SPA descobre o endereço do próprio backend.
