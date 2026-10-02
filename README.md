# chadbb

Organizador de chá de bebê: o organizador monta o evento, envia um convite por
link para cada pessoa ou família, e os convidados confirmam presença e escolhem
fraldas ou mimos pelo celular, sem criar conta. Primeiro evento real: chá da Liz,
**01/11/2026, 12h (Brasília)**, cerca de 50 convidados. Produção em
https://chadbb.pages.dev. Prioridades: uso simples no celular, design
profissional, acessibilidade e dados confiáveis e atualizados.

Implementado:

- **Organizador:** entrada por código enviado por e-mail; criação, edição,
  prévia, publicação, encerramento e exclusão do evento; capa; etapas guiadas
  após publicar (convidados e lista de presentes, com mimos próprios).
- **Convites:** um link por pessoa ou família (`/c/<evento>#token`), com prévia
  do evento no WhatsApp, reemissão e revogação; painel de presença com resumo
  vindo do banco.
- **Convidado:** confirmação de presença com prazo "Confirme até" definido pelo
  servidor; Talvez com lembrete por e-mail ([regras](docs/RSVP-LEMBRETES.md));
  reserva de fraldas por tamanho (com troca de tamanho) e de mimos, "Já comprei"
  e cancelamento. A partir do início do evento, presença e novas reservas travam;
  cancelar e informar compra continuam.
- **Operação:** retenção e exclusão de dados 30 dias após o término, backups e
  verificação de saúde; privacidade, termos e formulário de contato em
  `/privacidade` ([contrato do piloto](docs/CONTRATO-PILOTO.md)).
- **Segurança:** RLS restrita e escrita só por funções no banco; auditoria e
  plano em [SEGURANCA-2026-10-02](docs/SEGURANCA-2026-10-02.md).

Decisões de produto vigentes: [30/09/2026](docs/DECISOES-PRODUTO-2026-09-30.md).
Ponto de retomada: [troca de máquina](docs/TROCA-DE-MAQUINA.md) e
[quadro dos agentes](docs/TAREFAS-AGENTES.md). Arquitetura no
[ADR 001](docs/ADR-001-arquitetura-mvp-eventos-presentes.md).

## Desenvolvimento

Requisitos: Node 22.12+ (linha 22, `.nvmrc`), npm e Docker para o Supabase local.
No WSL, instale Node dentro da distribuição e habilite a integração Docker
Desktop com ela. O Docker Desktop precisa estar aberto no Windows: sem ele,
`docker` responde que o daemon não está rodando. Não misture npm do Windows com
Node do Linux.

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

### Se `db:start` falhar com `address already in use`

No WSL, as portas 54321 e 54322 do Supabase local caem dentro da faixa efêmera do
kernel (`net.ipv4.ip_local_port_range`, por padrão `32768 60999`). O sistema pode
ter dado uma delas a uma conexão de saída qualquer, e aí o `db:start` falha
**sem nenhum processo seu ouvindo a porta** — conferir com `ss -ltnp` não mostra
nada. A saída é reservar a faixa para que o kernel pare de sorteá-la:

```sh
echo 'net.ipv4.ip_local_reserved_ports = 54320-54330' | sudo tee /etc/sysctl.d/99-supabase.conf
sudo sysctl --system
```

Vale para qualquer máquina nova do projeto e sobrevive ao reinício. Reservar a
faixa não ocupa as portas: só impede que sejam distribuídas como porta de origem.

### Se o upload no Storage local falhar com `42P10`

Volume local criado antes de 30/09: a versão antiga do Storage criou os índices
`idx_objects_current_version` e `idx_objects_null_version` sem `COLLATE "C"`, e o
`IF NOT EXISTS` das migrations novas não os refaz. Depois que a migration 0072 apagou
o índice antigo, todo upload falha (`there is no unique or exclusion constraint
matching the ON CONFLICT specification`). Corrigido em 02/10 sem apagar dados,
recriando os dois índices como o Storage atual define:

```sh
D() { docker exec supabase_db_chadbb psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -tAc "$1"; }
for spec in "idx_objects_current_version|archived_at IS NULL" "idx_objects_null_version|NOT is_versioned"; do
  n=${spec%%|*}; w=${spec#*|}
  D "CREATE UNIQUE INDEX CONCURRENTLY ${n}_c ON storage.objects (bucket_id, name COLLATE \"C\") WHERE $w" &&
  D "DROP INDEX CONCURRENTLY storage.$n" && D "ALTER INDEX storage.${n}_c RENAME TO $n"
done
```

Só no Supabase local: o Storage de produção é gerenciado pelo Supabase. Um `db:reset`
também resolve, mas apaga os dados locais.

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
os scripts por `--linked`/`--db-url`. Comandos do CLI que gravam em
`supabase/.temp/` (fora do Git) podem deixar o ref de produção ali: rode sempre
com `--local` ou `--project-ref` explícito. Para aplicar só as migrations novas
sem apagar a base local, use `npx supabase migration up --local`. A migration inicial estabelece permissões;
o catálogo do chá — 4 tamanhos de fralda e os 23 mimos de [FRALDAS-E-MIMOS](docs/FRALDAS-E-MIMOS.md) — entra por migration, sem marcas, preços ou links; `seed.sql` permanece vazio e os testes criam e removem seus próprios dados fictícios.
Nenhuma pessoa/evento real deve ser cadastrada nesta fase.

A CI (GitHub Actions) roda lint, TypeScript, testes, build, PostgreSQL temporário,
navegador e Supabase local com testes pgTAP e de API.

Tamanhos máximos dos campos ficam em `src/lib/limits.ts`; `tests/limits.test.ts`
confere que front, Edge e migrations usam os mesmos números.

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

Com Supabase iniciado e `.env.local` preenchido, acesse `/entrar`, informe o
e-mail e consulte o servidor de e-mail **local** em http://127.0.0.1:54324. O
e-mail traz só um **código** (sem link); digite-o na mesma tela. Em produção o
cadastro público está fechado até 01/11: só entram famílias liberadas pelo
titular ([decisões](docs/DECISOES-PRODUTO-2026-09-30.md)).

As telas seguem o contrato de atualização do plano: nenhuma resposta em cache é
apresentada como nova. Eventos, detalhe e lista reconsultam o servidor ao abrir,
ao voltar para a aba, ao reconectar e a cada 5 segundos com a aba visível, com
recuo progressivo enquanto a consulta falhar e indicação “Atualizando…”. O que
está digitado nunca é substituído por uma atualização recebida: o formulário
avisa que existe versão mais recente e oferece recarregar.

Em `/eventos`, crie um rascunho, salve título, data e término, confira a prévia e
publique. Depois de publicar, as etapas guiam a criação dos convites e da lista de
presentes. O encerramento é definitivo nesta etapa. Campos privados não têm leitura anônima. Edições usam
versão para detectar conflitos entre abas; o botão de recarregar permite recuperar.

A capa aceita JPEG, PNG e WebP até 5 MB. O envio exige autorização explícita e o
arquivo fica público por link mesmo em rascunho. `event-private` é separado e
protegido por proprietário; esta interface só envia capas publicáveis.
Remover a referência de uma capa não apaga o objeto na hora. A Edge Function `retention`
apaga os arquivos exclusivos do evento 30 dias após o término, junto com os dados
pessoais ([política](docs/ENTREGA-E-SUPORTE.md#retenção-e-exclusão)).

## Compatibilidade de migrations

As versões `20260911000000` e `20260911010000` foram usadas com conteúdos diferentes
numa implementação antiga de convites que existiu apenas na `main`
(`family_invitations` e `invitation_response_deadline`), substituída pela linha
`mvp-familiar`. Um banco que tenha aplicado aquelas migrations antigas não é
compatível com esta sequência: o CLI consideraria essas versões já aplicadas.
Esses bancos devem ser recriados (`npm run db:reset` localmente). O projeto do chá
(`chadbb-cha`) nasceu com a sequência atual e não é afetado.

## Design system

Tema "chá de bebê": vinho (`#8E3658`) sobre creme, com rosa-antigo e champagne
só em detalhes decorativos; títulos em Fraunces (eixo SOFT), corpo em Manrope e
um único acento manuscrito (Patrick Hand) por tela. Todos os valores visuais são
tokens em `src/styles.css`; contrastes medidos (WCAG AA), componentes e regras de
uso em [foundation](docs/design/foundation.md).

- **Botões:** `primary` (uma por contexto), `advance` (conclui a etapa e leva ao
  próximo passo, como "Publicar evento": seta no fim, largura total no celular,
  uma por tela), `secondary`, `ghost`, `danger`, `icon` e `link`.
- **Motivos** (`BabyMotif`): SVG decorativos, ocultos do leitor de tela e em
  cores forçadas.
- **Home e rodapé:** etapas em nuvens, benefícios, perguntas frequentes e rodapé
  com links úteis ([revisão](docs/reviews/2026-10-01-home-referencias.md)). No
  convite, o rodapé é só a barra com a política, em nova aba.
- **Cards de evento:** atalhos "Editar dados" e "Excluir", com "Desfazer" por 10 s
  ([revisão](docs/reviews/2026-10-01-atalhos-desfazer.md)).
- **Amostras:** `/amostras`, só no servidor de desenvolvimento, mostra paleta,
  tipografia, botões e estados; o e2e roda axe nela.

## Estrutura

- `src/features/`: fluxos (auth, eventos, convidados, presentes, privacidade).
- `src/components/`: interface compartilhada; `src/components/ui/`: componentes do design system.
- `src/lib/`: configuração, Supabase e TanStack Query.
- `supabase/migrations/`, `supabase/functions/` (`guest`, `contact`,
  `rsvp-reminders`, `retention`, `delete-event`), `supabase/tests/`: backend.
- `functions/c/[id].ts`: Pages Function do link `/c/<evento>`, que troca as meta
  tags do convite pela prévia pública do evento ([plano](docs/PLANO-CONVITE-WHATSAPP.md)).
- `scripts/`: backup, saúde e modelos de e-mail.
- `tests/`: unitários, banco PostgreSQL, API Supabase, navegador e e2e (Playwright).
- `docs/`: decisões, contratos, planos, revisões (`docs/reviews/`) e design (`docs/design/`).

## Cloudflare Pages

Produção em https://chadbb.pages.dev, com build `npm run build`, saída `dist` e
Node 22. Para previews de branch, as variáveis Supabase podem ficar ausentes;
quando necessário, use um projeto Supabase separado da produção. Não reutilize
dados reais nos previews.

`public/_redirects` prepara fallback das rotas SPA. `public/_headers` configura
CSP, HSTS e demais cabeçalhos; a Pages Function `/c/[id]` repete os cabeçalhos
do `convite.html` que ela devolve. A CSP libera só o projeto Supabase de produção
(`img-src`/`connect-src`): trocar de projeto ou usar domínio próprio exige
atualizar `public/_headers` e `tests/headers.test.ts`.
Verifique `/` e uma rota inexistente após cada deploy.

## Evidências e pendências

Revisões e evidências por entrega ficam em `docs/reviews/`. O que falta antes do
envio dos convites (conteúdo real, restauração com dados reais, ensaio com a
família, passada com leitor de tela) está na retomada mais recente de
[TROCA-DE-MAQUINA](docs/TROCA-DE-MAQUINA.md) e no [quadro](docs/TAREFAS-AGENTES.md).
Roteiros de ensaio e suporte: [entrega e suporte](docs/ENTREGA-E-SUPORTE.md).

Referências técnicas: [Vite](https://vite.dev/guide/),
[Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite),
[Supabase local](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Smoke test remoto (projeto do chá)

`npm run test:smoke:remote` cria e remove dados fictícios no projeto `chadbb-cha`.
Só executar com aprovação. Exige `CHADBB_SMOKE_REF` igual ao ref do projeto e
`CHADBB_SMOKE_DB_URL` apontando para ele, e recusa qualquer outro host. As chaves
vêm do CLI autenticado e o segredo da retenção de `~/.config/chadbb/`; nada disso
é impresso. Fora da CI. A conexão usa o pooler de sessão com
`sslmode=verify-full&sslrootcert=` apontando para a CA oficial do Supabase
(Project Settings → Database → SSL), salva localmente fora do repositório.
