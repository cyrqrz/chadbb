# Segurança — auditoria e plano (02/10/2026)

Pedido do titular: tratar os dados com seriedade, Auth do Supabase, RLS restrita,
operações atômicas contra condição de corrida, tentar invadir, alinhar tamanhos
dos campos e revisar as regras de negócio. Este documento registra o que foi
verificado, o que já foi corrigido localmente e o que depende de aprovação.
Nada remoto foi executado.

## Escopo verificado (leitura do código, sem Docker nesta máquina)

- 34 migrations: RLS, grants, `security definer` + `search_path`, ordem de locks.
- Edge Functions `guest`, `contact`, `delete-event`, `retention`, `rsvp-reminders`.
- Pages Function `/c/[id]` (prévia do convite) e `public/_headers`.
- Front: login por OTP, limites de campo, chaves no bundle.
- Dependências (`npm audit`) e segredos no Git.

## O que já está sólido

| Área | Evidência |
|---|---|
| RLS | Toda tabela de `public` com RLS; só `select` do dono em `events`/`event_items`; `reservations` e `event_previews` sem acesso direto. `private` sem `usage` para `anon`/`authenticated` e fora das APIs expostas. |
| Escrita | Só por RPC `security definer` com `search_path=''`, dono por `auth.uid()`, nunca pelo payload. Nenhuma função definer sem `search_path`. |
| Privilégio padrão | Funções novas nascem sem `execute` para `anon`/`authenticated` (`supabase/tests/permissions.test.sql`). |
| Credenciais de convidado | Token de 256 bits, só o hash SHA-256 no banco; sessão separada de 2 h; troca invalida sessões. |
| Concorrência | Ordem global evento → convite → item → reserva; `FOR UPDATE`/`FOR SHARE`; versões otimistas; idempotência por `request_id`; cota por `INSERT … ON CONFLICT` atômico; `set_event_preview` com versão. Nenhuma corrida encontrada. |
| Storage | Pasta `<dono>/<evento>/arquivo`, sem `UPDATE`, extensões e MIME restritos, 5 MB. |
| Prévia `/c/:id` | Projeção só de evento publicado; HTML escapado; `$` tratado. |
| Segredos | Nada no Git nem no bundle; monitor de saúde procura `sb_secret_`/`service_role`. |
| Cron | Segredos ≥ 32 caracteres comparados em tempo constante. |

## Achados e correções locais (G1–G2 concluídos, aguardando revisão do diff)

| # | Severidade | Achado | Correção |
|---|---|---|---|
| S1 | Média | A Edge `guest` repassava o payload inteiro (até 16 KB) para `guest_action`, que grava o corpo em `private.guest_requests`. Quem tem um convite válido podia gravar ~2 MB/min de lixo (120 pedidos/min) por 90 dias. | `supabase/functions/guest/payload.ts`: lista de chaves por ação, só valores primitivos, texto ≤ 254; corpo máximo 2 KB. Teste `tests/guest-payload.test.ts`. |
| S2 | Baixa | CSP liberava `https://*.supabase.co` em `img-src`/`connect-src`: um XSS poderia enviar dados para um projeto Supabase de terceiros. | CSP restrita a `https://fcykqrlnofmdtmewlejr.supabase.co`; `upgrade-insecure-requests`. |
| S3 | Baixa | Sem `Strict-Transport-Security` nem `Cross-Origin-Opener-Policy`. | Adicionados em `public/_headers`; guardados em `tests/headers.test.ts`. |
| S4 | Baixa (dev) | `brace-expansion` 5.0.9 (via ESLint) com DoS conhecido. | `npm audit fix` → 5.0.12; `npm audit` sem vulnerabilidades. |
| S5 | Manutenção | Tamanhos de campo coincidiam por acaso, espalhados em literais. | `src/lib/limits.ts` é a tabela única; `tests/limits.test.ts` confere front (`maxLength`), modelo, Edge `contact` e migrations. |

Tabela de tamanhos (alinhada nas três camadas):

| Campo | Máximo |
|---|---|
| Título do evento / nome do convite / nome no contato | 120 |
| Nome do mimo | 160 |
| Endereço privado | 500 |
| Descrição pública, instruções, descrição do mimo | 2000 |
| Mensagem e detalhes do contato | 4000 |
| E-mail (login, lembrete, contato) | 254 |
| Pessoas por convite | 1–50 |
| Pacotes por item da lista / por reserva | 10000 / 1000 |

## Regras de negócio: lacunas encontradas

| # | Regra decidida | Situação no banco | Proposta |
|---|---|---|---|
| N1 | Q8: cadastro público **fechado** em produção até 01/11 (T3). | O login usa `signInWithOtp` sem `shouldCreateUser: false`; a trava depende só da configuração remota, que não consegui conferir daqui. Com o cadastro aberto, qualquer e-mail vira organizador e pode criar eventos e subir arquivos sem limite. | G4: titular mostra Auth → "Allow new users to sign up" desligado. Front com `shouldCreateUser: false` como segunda barreira (reverter na T13). |
| N2 | "Presentes seguem liberados **até o evento**." | `guest_action` aceita RSVP, reserva e troca enquanto o evento estiver `published`, mesmo depois do início, até o organizador encerrar. Isso pode mudar o resumo de 02/11. | **Aprovado em 02/10 e implementado:** `20261002010000_guest_actions_until_start.sql` (cópia das funções vigentes + trava), `event.started` no snapshot, convite travado. G3 local em 02/10: pgTAP 153/153, `test:db:portable` 104/104 (com o teste N2), e2e do convite 145 ok, `test:api` da Edge `guest` toda verde. |
| N3 | "Depois do prazo, trava a resposta de presença." | Só o Talvez fecha (10 dias antes); Sim/Não seguem abertos. Já previsto na T9. | Manter na T9, com a trava no banco. |
| N4 | Sem regra de volume por conta. | Sem limite de eventos por organizador, de convites por evento ou de arquivos por pasta. | Migration com tetos (sugestão: 5 eventos, 300 convites, 20 arquivos por evento), contados sob o lock do evento/usuário. |

## Endurecimento proposto no banco (G3 exige Supabase local)

Sem Docker nesta máquina, nenhuma migration foi escrita: SQL sem rodar não entra.

1. `guest_requests` guarda o SHA-256 do payload no lugar do JSON (defesa em
   profundidade para S1; idempotência continua por comparação).
2. Recusar caracteres de controle e de direção (`U+202A–U+202E`, `U+2066–U+2069`)
   em títulos e nomes: evitam nomes que se disfarçam no painel e na prévia do WhatsApp.
3. Teto de sessões ativas por convite (ex.: 20), apagando as mais antigas na troca.
4. N4 acima (N2 já feito).
5. pgTAP para cada item, mais um teste que liste todas as funções `security definer`
   e falhe se alguma tiver `execute` para `anon` fora de `public_event_preview`.

## Teste de invasão remoto (G4)

Script proposto `scripts/security/probe.mjs`, só com a chave publicável (papel `anon`)
e sem escrever dados: `select` em cada tabela de `public`, chamada de cada RPC como
`anon`, listagem e envio no Storage, `GET` nas Edge Functions, origem falsa no CORS,
token inválido na `guest` e conferência dos headers do site. Espera-se 401/403/vazio em
tudo. Não chama `contact` (enviaria e-mail). Roda só com aprovação.

## Riscos aceitos

- **Cota global da `guest` (2400/min):** dois IPs no limite (1200/min cada) podem
  esgotá-la por um minuto. O Supabase não fica atrás do Cloudflare do site; mitigar
  exigiria WAF pago. Aceitável para 50 convidados, com monitoramento.
- **Convite é credencial compartilhável:** quem recebe o link responde pela família. É o desenho do produto.

## Gates

| Gate | Conteúdo | Estado |
|---|---|---|
| G1 | Achados e plano (este documento) | pronto para revisão |
| G2 | S1–S5 locais, `npm run check` verde (99 testes) | feito, sem commit |
| G3 | Migration de endurecimento + pgTAP no Supabase local | precisa de Docker |
| G4 | Conferir Auth remoto (N1), rodar a sondagem, `functions deploy guest`, Pages | aprovação do titular |
