# T-B4 — validação remota da API do organizador

Preparação em 2026-09-16. Nenhum smoke remoto autorizado ou executado nesta
continuidade. Não executar `tests/remote/smoke.mjs` como está em produção com
usuários reais: sua limpeza assume ausência de tráfego real e remove janelas
compartilhadas de rate limit alteradas durante o teste; também chama a retenção
global. T-B4 precisa de um runner dedicado, restrito à API do organizador.

## G1 — Preparar e provar isolamento local

Criar runner dedicado com dry-run padrão (nenhuma conexão/credencial), execução
local separada e execução remota protegida por confirmação explícita do ref
`fcykqrlnofmdtmewlejr`. Não reutilizar o smoke global. Fluxo:

1. Criar dois usuários Auth fictícios com UUIDs exclusivos e e-mails
   `@example.test`, confirmados administrativamente, sem enviar e-mail.
2. Entrar com senha aleatória em cada conta usando a API pública.
3. Usuário A cria rascunho, salva título, datas futuras e endereço fictício.
4. Montar a lista, editar uma cota e publicar o evento; conferir dados e versões.
5. Usuário B tenta ler evento/lista e editar/publicar o evento ou alterar a
   cota: leitura vazia e mutações recusadas, sem mudança no estado do usuário A.
6. Em `finally`, remover somente os dados associados aos IDs dos dois usuários
   criados nesta execução e conferir zero sobras nesses IDs, inclusive em falha
   intermediária. Não consultar pessoas reais nem limpar tabelas inteiras.

Sem Edge guest, Storage, retenção, Vault, migrations ou limpeza de rate limits.
Conexão administrativa para limpeza via TLS verificado; credenciais lidas de
arquivos protegidos, nunca como argumentos ou saída. Diagnósticos limitados à
fase/código, sem payloads de Auth.

Evidências exigidas para G2: diff do runner, dry-run, sucesso contra API local,
falha intermediária com limpeza comprovada, resultado de `npm run check`.
Bloqueio local observado nesta máquina: Docker não está disponível nesta distro
WSL; o comando orienta habilitar a integração no Docker Desktop. Os testes de
Postgres portátil não substituem Auth/PostgREST reais. Não foi feito `db:reset`.

Atualização em 2026-09-16: integração Ubuntu-24.04 habilitada pelo titular;
cliente e servidor Docker 29.7.2 acessíveis fora do sandbox. Stack local já
estava ativa. `node --test tests/api/organizer.integration.mjs`: **3/3**,
incluindo isolamento de organizadores, Storage e criar/salvar/publicar/encerrar.
Limpeza dos dados fictícios concluída pelo teardown. Resolve o bloqueio de
ambiente; runner dedicado e evidências restantes de G1 ainda pendentes.

### G1 concluído — runner isolado e evidências

Implementado `tests/remote/organizer-smoke.mjs`. Comando sem argumentos ou
`--dry-run` não abre conexão nem lê credenciais. `--remote` exige
`CHADBB_SMOKE_REF=fcykqrlnofmdtmewlejr`; nenhuma URL remota arbitrária é aceita.
Chaves são capturadas do CLI em memória e a senha vem do arquivo protegido;
TLS verifica a CA do Supabase. Erros mostram somente a fase.

Dry-run efetivo: **2 usuários, 1 evento, 27 itens**; criação, edição, preparação
de lista, edição de cota, publicação e negação de acesso cruzado. Limpeza por
e-mails UUID exclusivos gerados antes da criação, cobrindo resposta perdida.
Nenhum envio de e-mail, Storage, guest, retenção ou alteração de rate limits.

Evidências locais em 2026-09-16:

- `node tests/remote/organizer-smoke.mjs --local`: fluxo aprovado e
  `users=0 events=0 items=0` após limpeza.
- `node --test tests/api/organizer-smoke.integration.mjs`: **2/2**; falha
  injetada depois da lista retorna erro, remove os próprios dados e preserva
  outro evento/convite/lista fictícios; dry-run padrão e ref inválido verificados.
- `npm run check`: aprovado, incluindo 40 testes unitários; lint repetido após
  acrescentar os testes de isolamento. Nenhum reset local ou smoke remoto.

Falha de limpeza impede sucesso e requer investigação antes de repetir.

## G2 — Aprovação do smoke remoto

Apresentar as evidências de G1 e o comando exato antes de solicitar aprovação.
Escopo a aprovar: dois usuários sintéticos, um evento e lista sintética; leitura
e mutações exclusivamente nesses IDs; limpeza final desses dados. Informar se a
limpeza falhar, sem declarar sucesso ou avançar para carga. Ainda não liberado.

Comando proposto, **aguardando aprovação explícita**:

```sh
CHADBB_SMOKE_REF=fcykqrlnofmdtmewlejr node tests/remote/organizer-smoke.mjs --remote
```

Diff revisável: novo runner de 2 contas/1 evento/27 itens e teste de isolamento;
não há migration ou alteração no código implantado. Este gate não autoriza o
smoke antigo nem as medições de carga da T-B5.

### G2 concluído — 2026-09-16

Titular autorizou a execução condicionada à revisão e aprovação dos testes.
Revisão do runner não exigiu alterações. Dry-run, fluxo local, testes de
isolamento (2/2), `npm run check` (40 testes unitários) e `git diff --check`
reexecutados com sucesso antes da escrita remota.

Comando acima executado no `chadbb-cha`, saída 0:

```text
PASS: criar, editar, montar lista, publicar e negar acesso cruzado.
PASS: limpeza restrita confirmada — users=0 events=0 items=0.
```

T-B4 concluída: duas contas fictícias, um evento e 27 itens exercitados pela
API Auth/PostgREST real, com limpeza transacional restrita confirmada. Sem
envio de e-mail, Storage, retenção ou contadores compartilhados. T-B5 continua
com gate próprio, ainda sem aprovação para carga remota. Sem commit ou push.

## G3 — Medições T-B5, aprovação separada

Depois de T-B4 passar e limpar os dados: preparar dry-run de 50 convites
fictícios, orçamento de requisições e limpeza restrita. Medir p95 por operação
com falhas contabilizadas e verificar a mudança em uma segunda sessão pelo
frontend publicado, com alvo de 7 s desde o commit. Consulta API isolada não
prova atualização visual. Meta p95: até 2 s. Execução remota ainda não aprovada.

## G4 — Operação T-B6

Conferir sete backups diários consecutivos por leitura do histórico e presença
dos objetos, sem disparar backup. Recaptura e restauração com conteúdo/Storage
reais dependem desse conteúdo e de aprovação específica; medir recuperação
completa até 2 h. Remoção de Workers Builds exige identificar a integração exata
e apresentar a mudança antes de aprovação, preservando Cloudflare Pages.
