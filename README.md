# chadbb

MVP para o chá de bebê do irmão do solicitante, com cerca de 50 convidados.
Prioridades: uso simples no celular, design profissional, acessibilidade e dados
confiáveis e atualizados. Entrega planejada para a segunda semana de outubro de
2026; evolução comercial fica para depois do evento. Implementação guiada pelo
[plano de execução](docs/PLANO-EXECUCAO-MVP.md), com a stack do ADR 001.
Já estão implementados acesso por link de e-mail, criação/edição/publicação/encerramento
de eventos e envio de capa, com permissões por proprietário, além de catálogo e
lista de presentes. Convites e reservas ainda não estão implementados.
Testes SQL e de API do organizador passaram no Supabase local; o ensaio de login
por link de e-mail no navegador permanece pendente.
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
o catálogo do chá — 4 tamanhos de fralda e os 23 mimos de [FRALDAS-E-MIMOS](docs/FRALDAS-E-MIMOS.md) — entra por migration, sem marcas, preços ou links; `seed.sql` permanece vazio e os testes criam e removem seus próprios dados fictícios.
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
# Em outro terminal: npm run functions:serve
npm run test:api
npm run test:browser:local
npm run test:email:local
npm run test:load:local
```

`test:api` obtém a configuração da stack local pelo CLI e aceita somente loopback
na porta 54321. Cria dois usuários fictícios, verifica isolamento pela API,
valida upload/download/tamanho/tipo e remove os dados de teste ao terminar.
Não aponta para produção. Se a execução for interrompida, `db:reset` limpa a stack
local inteira, incluindo quaisquer dados locais de desenvolvimento.

Os testes de navegador e e-mail precisam da porta 5173 livre e rodam em sequência.
O teste de e-mail usa apenas Mailpit local. O ensaio de carga cria 50 convidados
fictícios e mede p50/p95 das chamadas Edge. Resultados e contratos atualizados:
[revisão técnica](docs/REVISAO-TECNICA-2026-09-14.md).

## Usar o fluxo do organizador

Com Supabase iniciado e `.env.local` preenchido, acesse `/entrar`, solicite o link
e consulte o servidor de e-mail **local** em http://127.0.0.1:54324. Abra o link no
mesmo navegador para concluir o PKCE. O callback local está configurado para
`http://localhost:5173/auth/callback` e `http://127.0.0.1:5173/auth/callback`.
Em ambientes remotos, cadastre a URL correspondente no Auth antes de usar.

As telas seguem o contrato de atualização do plano: nenhuma resposta em cache é
apresentada como nova. Eventos, detalhe e lista reconsultam o servidor ao abrir,
ao voltar para a aba, ao reconectar e a cada 5 segundos com a aba visível, com
recuo progressivo enquanto a consulta falhar e indicação “Atualizando…”. O que
está digitado nunca é substituído por uma atualização recebida: o formulário
avisa que existe versão mais recente e oferece recarregar.

Em `/eventos`, crie um rascunho, salve título e data futura e publique. O encerramento
é definitivo nesta etapa. Campos privados não têm leitura anônima. Edições usam
versão para detectar conflitos entre abas; o botão de recarregar permite recuperar.

A capa aceita JPEG, PNG e WebP até 5 MB. O envio exige autorização explícita e o
arquivo fica público por link mesmo em rascunho. `event-private` é separado e
protegido por proprietário; esta interface só envia capas publicáveis.
Remover a referência de uma capa não apaga o objeto na hora. A Edge Function `retention`
apaga os arquivos exclusivos do evento 30 dias após o término, junto com os dados
pessoais ([política](docs/ENTREGA-E-SUPORTE.md#retenção-e-exclusão)).

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

Consulte [execução da base](docs/EXECUCAO-BASE.md), [execução do organizador](docs/EXECUCAO-ORGANIZADOR.md)
e [validação local de 11/09](docs/VALIDACAO-LOCAL-2026-09-11.md). Não há aprovação de piloto.
Docker, contas de hospedagem, orçamento, restauração, regras comerciais e
validação em celular/WhatsApp precisam das etapas previstas no plano.

Referências técnicas: [Vite](https://vite.dev/guide/),
[Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite),
[Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Smoke test remoto (projeto do chá)

`npm run test:smoke:remote` cria e remove dados fictícios no projeto `chadbb-cha`.
Só executar com aprovação. Exige `CHADBB_SMOKE_REF` igual ao ref do projeto e
`CHADBB_SMOKE_DB_URL` apontando para ele, e recusa qualquer outro host. As chaves
vêm do CLI autenticado e o segredo da retenção de `~/.config/chadbb/`; nada disso
é impresso. Fora da CI.
