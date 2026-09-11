# chadbb

Aplicação de chá de bebê e lista de presentes. Implementação iniciada pelo
[plano de execução](docs/PLANO-EXECUCAO-MVP.md), com a stack do ADR 001.
Já estão implementados acesso por link de e-mail, criação/edição/publicação/encerramento
de eventos, capa, catálogo, lista de presentes e convites familiares com RSVP por pessoa.
Reservas ainda não estão implementadas. As APIs Supabase locais e os testes de navegador com APIs simuladas foram validados; o login por link de e-mail também foi validado de ponta a ponta no ambiente local. Veja as [evidências atuais](docs/VALIDACAO-LOCAL-2026-09-11.md).
Veja o [contrato do piloto](docs/CONTRATO-PILOTO.md).

## Desenvolvimento

Requisitos: Node 22.12+ (linha 22, `.nvmrc`), npm e Docker para o Supabase local.
No WSL, instale Node dentro da distribuição e habilite a integração Docker
Desktop com ela. Não misture npm do Windows com Node do Linux.

```sh
npm ci
npm run dev
```

Abra http://localhost:5173. Sem configuração de backend, a página inicial funciona
e informa que a conexão está pendente. Para integrar com banco local:

```sh
npm run db:start
cp .env.example .env.local
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL da API e a
**publishable key** mostradas pelo CLI (`npx supabase status`), e reinicie o Vite.
Não use a chave `service_role`, uma secret key ou uma chave JWT legada. As duas
variáveis são públicas e entram no bundle. A validação no cliente detecta erros,
mas não remove um segredo já incluído no build: nunca o configure ali.

```sh
npm run db:reset
npm run db:test
npm run check
```

Reset e testes usam explicitamente `--local`; não há comandos destrutivos para
banco remoto nos scripts. Não vincule este ambiente local à produção nem troque
os scripts por `--linked`/`--db-url`. A migration inicial estabelece permissões;
`seed.sql` contém apenas produtos fictícios locais; os testes criam e removem seus próprios dados fictícios.
Nenhuma pessoa/evento real deve ser cadastrada nesta fase.

A CI foi configurada para lint, TypeScript, testes, build, PostgreSQL temporário,
navegador e Supabase local com testes pgTAP e de API. Ainda não foi executada no remoto.

## Testar sem Docker

```sh
npm run check
npm run test:db:portable
npx playwright install --with-deps chromium
npm run test:e2e
```

O teste portátil cria um **PostgreSQL 17 real** em uma pasta temporária, aplica as
migrations e usa conexões independentes. Auth e Storage são representados por um
schema mínimo de teste; isso comprova SQL/RLS e bloqueios, não as APIs Supabase.
O cluster usa porta livre de loopback e é removido ao terminar, sem aceitar URL
externa. Executar como usuário comum, sem root.

Playwright testa desktop e celular com Auth/PostgREST/Storage simulados, sem
contas ou e-mails reais. O comando instala as bibliotecas de navegador pelo sistema
quando necessário. Os testes usam porta 4173 e configuração fictícia própria.

## Testar integração Supabase completa (Docker)

```sh
npm run db:start
npm run db:reset
npm run db:test
npm run test:api
```

`test:api` obtém a configuração da stack local pelo CLI e aceita somente loopback
na porta 54321. Cria dois usuários fictícios, verifica isolamento pela API,
valida upload/download/tamanho/tipo e remove os dados de teste ao terminar.
Não aponta para produção. Se a execução for interrompida, `db:reset` limpa a stack
local inteira, incluindo quaisquer dados locais de desenvolvimento.

## Usar o fluxo do organizador

Com Supabase iniciado e `.env.local` preenchido, acesse `/entrar`, solicite o link
e consulte o servidor de e-mail **local** em http://127.0.0.1:54324. Abra o link no
mesmo navegador para concluir o PKCE. O callback local está configurado para
`http://localhost:5173/auth/callback` e `http://127.0.0.1:5173/auth/callback`.
Em ambientes remotos, cadastre a URL correspondente no Auth antes de usar.

Em `/eventos`, crie um rascunho, salve título e data futura e publique. O encerramento
é definitivo nesta etapa. Campos privados não têm leitura anônima. Edições usam
versão para detectar conflitos entre abas; o botão de recarregar permite recuperar.

A capa aceita JPEG, PNG e WebP até 5 MB. O envio exige autorização explícita e o
arquivo fica público por link mesmo em rascunho. `event-private` é separado e
protegido por proprietário; esta interface só envia capas publicáveis.
Remover a referência de uma capa não apaga o objeto já publicado: limpeza de
arquivos e retenção serão concluídas antes do piloto.

## Estrutura

- `src/features/`: fluxos; `src/components/`: interface compartilhada.
- `src/lib/`: configuração, Supabase e TanStack Query.
- `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`: backend.
- `functions/`: futura prévia pública no Cloudflare Pages.
- `tests/`: testes unitários, banco PostgreSQL, API Supabase e navegador.

## Preview no Cloudflare Pages

Conecte o repositório a um projeto Pages de **desenvolvimento**, com build
`npm run build`, saída `dist`, Node 22 e diretório raiz deste repositório.
Habilite previews das branches. Para essa base, as variáveis Supabase podem ficar
ausentes. Quando necessário, use um projeto Supabase separado da produção e
configure URLs de retorno do Auth por ambiente. Não reutilize dados reais nos previews.

`public/_redirects` prepara fallback das rotas SPA. `public/_headers` configura
cabeçalhos para arquivos estáticos. A futura Pages Function deverá aplicar seus
próprios cabeçalhos. Domínio próprio de Supabase exige revisar `connect-src`.
Verifique `/` e uma rota inexistente após cada deploy. Preview remoto ainda não
foi criado: depende de acesso às contas e repositório remoto.

## Evidências e pendências

Consulte [execução da base](docs/EXECUCAO-BASE.md) e [execução do organizador](docs/EXECUCAO-ORGANIZADOR.md). Não há aprovação de piloto.
Docker, contas de hospedagem, orçamento, restauração, regras comerciais e
validação em celular/WhatsApp precisam das etapas previstas no plano.

Referências técnicas: [Vite](https://vite.dev/guide/),
[Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite),
[Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Testar login por e-mail local

Com Supabase iniciado e Chromium instalado, execute `npm run test:auth:local`.
O teste inicia Vite em `127.0.0.1:5173` (a porta precisa estar livre), usa a
configuração pública da stack local e solicita acesso pela interface. Lê somente
a mensagem fictícia correspondente no Mailpit, abre o link no mesmo navegador,
verifica PKCE, sessão após recarregar, logout e proteção da rota.
Não usa mocks nem envia e-mail externo; remove o usuário e a mensagem de teste.
Não grava traces ou capturas que possam conter credenciais. A CI executa esse
ensaio após os testes de API.

## Testar convites familiares locais

Com Supabase iniciado, aplique migrations pendentes sem resetar os dados:

```sh
npx supabase migration up --local
npx supabase functions serve guest
```

Mantenha a função rodando e, em outro terminal com a porta 5173 livre, execute
`npm run test:invites:local`. O teste usa organizador autenticado, Chromium
(desktop e celular emulado), PostgREST e Edge Function reais. Cria suas próprias
famílias fictícias e verifica respostas individuais, reabertura na mesma aba,
bloqueio no início, revogação e troca de família. Remove seus dados ao terminar.

O organizador cadastra até 20 integrantes por convite em **Convites e presença**.
O link não exige login e pode ser reaberto; a sessão dura 2 horas em memória.
Respostas podem mudar até o início do evento. Depois, ou após encerramento manual,
o convite permanece disponível para consulta até ser revogado. Não há expiração
automática do link emitido pela interface. Configuração da função em
[supabase/functions/README.md](supabase/functions/README.md).
