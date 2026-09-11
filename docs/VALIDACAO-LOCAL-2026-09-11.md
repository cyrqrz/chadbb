# Validação local — 2026-09-11

## Resultados

- `npm run check`: aprovado, incluindo lint, TypeScript, 36 testes unitários e build.
- `npm run test:db:portable`: 19 testes aprovados em PostgreSQL temporário, incluindo catálogo, isolamento, quantidades e concorrência.
- `npm run db:start`: concluído. Stack local criada com migrations e catálogo fictício; containers saudáveis. Não foi necessário resetar o banco.
- `npm run db:test`: 21 testes pgTAP aprovados no Supabase local.
- `npm run test:api`: 4 cenários aprovados com Auth, PostgREST e Storage reais. Cobrem dois organizadores, permissões, imagens, eventos, catálogo, inclusão de itens, quantidades, conflito de versão e bloqueio após encerramento.
- A limpeza dos testes agora remove os itens fictícios antes dos eventos, por conexão administrativa restrita ao banco local na porta 54322 e aos usuários criados pela própria execução.
- Acrescentado cenário Playwright de inclusão de presente, edição de quantidade, publicação e consulta após encerramento, em desktop e celular. Compilação e lint aprovados. Navegador: 16 cenários existentes passaram na suíte completa; os 2 cenários da lista passaram na repetição direcionada após corrigir a exposição do cabeçalho `Content-Range` na API simulada. Total: 18 cenários validados em Chromium, desktop e celular emulado. Auth/PostgREST/Storage são simulados nesses testes.

## Ambiente

Node 22.23.2 está instalado em `~/.nvm/versions/node/v22.23.2/bin`. O PATH inicial selecionava npm do Windows; os comandos desta sessão usaram explicitamente Node Linux.

Docker instalado e funcionando. A sessão antiga não havia carregado o grupo `docker`, ao qual o usuário já pertence. `sg docker -c 'npm run db:start'` e os comandos de teste funcionaram sem reinstalar Docker.

Chromium e bibliotecas Linux instalados; a verificação de dependências não indica bibliotecas ausentes. Comandos de reprodução:

```sh
cd ~/projetos/chadbb
source ~/.nvm/nvm.sh
nvm use 22
npx playwright install-deps chromium
npm run test:e2e
```

## Limites e próximos passos

A integração do backend do organizador e da lista foi validada localmente. A suíte de navegador foi validada com APIs simuladas. O novo `npm run test:auth:local` passou com navegador, Auth e Mailpit reais: solicitação pela interface, entrega local, PKCE, URL limpa no painel, persistência após recarga, logout e proteção de rota. Usuário e mensagem fictícios removidos ao terminar. O comando foi incluído na CI, cuja execução remota permanece pendente.

CI remota, preview, experiência em celular real/WhatsApp e reservas continuam pendentes. Convites familiares foram validados no passe descrito abaixo. O piloto não está liberado. A implementação do catálogo está mais adiantada que os checkboxes históricos do plano; este registro fornece as evidências atuais sem presumir aceite de etapas ainda incompletas.

## Passe de convites familiares

- Verificação final: `npm run check` aprovado (lint, TypeScript, 36 testes unitários e build); `npm run test:e2e` com todos os 18 cenários aprovados em uma execução completa; `git diff --check` sem erros.

- Migration `20260911010000_invitation_response_deadline.sql` aplicada ao Supabase local sem resetar dados.
- `npm run test:db:portable`: 24 testes aprovados. Os 5 novos cenários cobrem isolamento entre organizadores/famílias, restrições das RPCs, respostas por pessoa, versão concorrente, início/encerramento somente leitura, sessão expirada, reabertura e revogação.
- `npm run test:invites:local`: aprovado com Chromium, Auth, PostgREST e Edge Function reais. Organizador em desktop cadastra três pessoas; convidado em Pixel 7 emulado responde Sim/Não/Talvez. O painel recupera as respostas persistidas.
- Reabrir o link original na mesma aba falhava quando a navegação mudava apenas o fragmento. Corrigido para reiniciar a troca do token e limpar o erro anterior. Link inválido passa a remover os dados da família anterior da tela.
- Ensaio cobre recarga/reabertura, alteração posterior, negação de escrita após início com a página já aberta, consulta após início, revogação de sessão ativa e troca para outra família na mesma aba.
- Verificado que o token não aparece em URLs de requisições ou Referer e que credenciais de convidado não são persistidas em localStorage/sessionStorage. Sem traces/capturas; registros fictícios removidos ao terminar.
- Comando incluído na CI, que inicia `supabase functions serve guest` antes do ensaio. Execução remota ainda pendente.

A sessão técnica continua com duração de 2 horas; o link familiar não expira
automaticamente. A regra confirmada de edição termina no início do evento,
e o encerramento manual também bloqueia alterações. Acesso permanece somente
para consulta enquanto o convite não for revogado. A publicação remota da função
e a validação em aparelho real/WhatsApp permanecem pendentes.

## Cobertura de testes de convites (P4.8)

Adicionados dois arquivos de teste fechando os cenários de abuso e expiração
explícita que o passe anterior deixou em aberto:

- `supabase/tests/invitations.test.sql` (pgTAP, roda em `npm run db:test`): 48
  asserções contra a stack local real. Cobre autorização e validação na
  emissão do convite (evento alheio, rascunho, já iniciado, rótulo/nomes
  inválidos, prazo no passado), isolamento por RLS entre organizadores,
  acesso entre convites e entre eventos (`PERSON_NOT_FOUND`), conflito de
  versão de RSVP, revogação invalidando sessão e token já emitidos, sessão
  expirada, convite com prazo explícito vencido, leitura somente consulta e
  bloqueio de RSVP após início/encerramento do evento, e limitação de
  tentativas (`allow_guest_request`): formato de hash inválido é sempre
  negado e o limite de 60 requisições por minuto por IP é aplicado. Também
  confirma que `exchange_guest_invitation`, `get_guest_invitation`,
  `set_guest_rsvp` e `allow_guest_request` são inacessíveis a `anon` e
  `authenticated`, e que nem o `service_role` lê as tabelas do schema
  `private` fora dessas funções.
- `tests/api/guest.integration.mjs` (roda em `npm run test:api`): 6 cenários
  contra a Edge Function `guest` real servida pela stack local (não apenas
  contra o banco). Cobre preflight/CORS e origem não autorizada, método,
  `Content-Type` e tamanho de payload inválidos, credencial fora do formato,
  token desconhecido, o fluxo completo de troca de token → leitura →
  RSVP → conflito de versão, isolamento entre convidados de convites
  diferentes, e revogação encerrando a sessão já emitida.

`npm run check`, `npm run db:test` (69 testes, incluindo os dois arquivos
pgTAP existentes), `npm run test:api` (10 cenários) e `npm run
test:db:portable` (24 testes) aprovados juntos nesta verificação. P4.8 é
considerado fechado; testes de abuso mais amplos (ex.: variação de padrões
de tráfego) ficam para quando houver tráfego real do piloto.
