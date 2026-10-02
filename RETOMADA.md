# Retomada — 02/10/2026

**Comece por aqui.** O titular pediu para salvar tudo no Git e continuar depois
em outro PC. Trabalho salvo na branch temporária
`retomada/2026-10-02-lista`, criada sobre `clone-main` (`1001935`).

## No outro PC

Em um clone existente e sem alterações locais:

```sh
git fetch origin
git switch --track origin/retomada/2026-10-02-lista
npm ci
```

Se a branch local já existir, use `git switch retomada/2026-10-02-lista`.
Se houver arquivos alterados, preserve-os antes de trocar a branch.
Para um clone novo:

```sh
git clone --branch retomada/2026-10-02-lista https://github.com/cyrqrz/chadbb.git
cd chadbb
npm ci
```

Leia `AGENTS.md` e a [revisão](docs/reviews/2026-10-02-retomada-lista-acessibilidade.md).
Use Node 22. Credenciais, `.env`, dependências e sessões não foram enviados.
O ambiente local deve ser configurado conforme o `README.md`.

## O que está pronto

- **Adicionar todos os tamanhos** de fralda com a quantidade de cada linha.
- Selecionar sugestões para incluir e itens da lista para remover em lote.
  O banco aplica tudo ou nada; itens existentes não recebem soma e reservas
  ativas impedem a remoção.
- Barra de seleção compartilhada por eventos, convites e presentes.
- Títulos por tela, foco após compra/cancelamento e rolagem que considera a
  altura do cabeçalho fixo.
- Correção da validação de quantidade de itens já listados, com teste de banco.
- Dois testes de login corrigidos: porta configurável e medição de layout no
  mesmo instante, após carregamento das fontes.

## Validação

Consulte os resultados exatos e os limites na revisão. `npm run check` passou
(101 testes unitários) e o PostgreSQL portátil passou 114/114 testes.
A suíte completa local foi interrompida para evitar duplicação com a do
auxiliar do Claude; não relatar suíte completa verde. A rodada focada abrange
68 cenários de computador e celular; a revisão registra a repetição dos
cenários que excederam o tempo de carregamento inicial.

As capturas e os diffs estão na
[página HTML de revisão](docs/reviews/2026-10-02-retomada/diffs.html), que pode
ser baixada e aberta localmente. Dados das capturas são fictícios.

## Próximo passo

1. Revisar o código e os diffs com o titular.
2. Se necessário, concluir a suíte completa com a máquina livre. O auxiliar
   do Claude ainda rodava seus testes na máquina antiga; seus resultados
   posteriores não fazem parte desta entrega.
3. Antes de publicar o front, repetir o dry-run e obter aprovação para
   aplicar **as duas migrations**, nesta ordem:
   `20261002040000_add_diaper_sizes.sql` e
   `20261002050000_list_items_batch.sql`.
   O dry-run desta sessão mostrou apenas essas duas, sem seeds nem roles.
4. Integrar a branch temporária na `clone-main`, publicar o preview e abrir/
   atualizar o PR para `main` conforme a aprovação do titular.

**Nenhuma migration foi aplicada em produção nesta retomada.** O push desta
branch serve para continuar o trabalho em outro PC. Não presumir que o botão
novo funciona em um preview automático antes de aplicar as migrations.
O merge na `main` continua com o titular.

## Origem do trabalho

O Claude tinha quatro commits em uma worktree isolada (até `732a3cc`) e ajustes
de acessibilidade sem commit. A entrega foi integrada e revisada pelo Codex.
Não reaplique também os commits daquela worktree: o conteúdo já está aqui.
A cópia original foi preservada na máquina antiga.
