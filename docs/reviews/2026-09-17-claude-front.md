# Revisão do front do Claude — 2026-09-17

Base revisada: `origin/claude/front`, commit `2f321dc`; implementação G3/G3.1
em `806ca84`. Comparação principal com `origin/main` em `f7be77f`.
Responsável: Codex, com revisão independente de contratos por `tdd_senior`.

## G1 — revisão e achados

Dois problemas de prioridade P2 precisam ser corrigidos no convite antes da
integração. Não foi identificada incompatibilidade nova nos payloads revisados
com o backend. As verificações de autorização e concorrência continuam no banco.

### R1 — edição durante envio pode ser apagada (regressão)

Arquivo: `src/features/guests/GuestPage.tsx`, linhas 257–258 na base revisada.

O novo `QuantityField` deixou de receber `disabled={busy}`. O usuário pode enviar
2 pacotes e digitar 3 enquanto aguarda. A confirmação do pedido anterior chama
`setDraft(null)`, descartando a edição posterior. Os controles de quantidade
devem ficar bloqueados enquanto uma mutação está pendente de resposta, como
ficavam antes da substituição do input pelo componente.

Correção proposta: passar `disabled={busy}` ao `QuantityField`; o componente
já propaga a propriedade ao campo e aos botões de aumentar/diminuir.

### R2 — continuar digitando aceita uma versão concorrente (preexistente)

Arquivo: `src/features/guests/GuestPage.tsx`, linha 258 na base revisada.

Cada edição atualiza a versão do rascunho com `own.version`. Se uma consulta
trouxer outra reserva enquanto o convidado digita, a próxima tecla remove o
aviso de conflito e adota a versão nova sem o usuário escolher “Usar escolha
atual”. A proteção do banco depende da versão enviada pelo cliente.

Correção proposta: conservar a versão do primeiro rascunho por atualização
funcional de estado. `null` é uma versão válida (reserva inicialmente ausente),
portanto não usar `previous?.version ?? own?.version`.

Os testes cobrem tanto reserva existente na versão 1 quanto ausência inicial de
reserva. Após a atualização concorrente, exigem que o aviso continue visível,
que o envio conserve a versão original, que o erro não apague o valor digitado
e que a adoção explícita da escolha atual recarregue o campo.

## G2 — evidências locais

Revisão feita em snapshots temporários, sem mudar a branch ou a pasta do Claude.
Node `v22.23.2`, dependências instaladas com `npm ci`. Os testes de navegador
usam somente API simulada e dados fictícios, nas portas 4173, 4174 e 4175.

- Base original: `npm run check` passou, incluindo 44 testes, lint, tipos e build.
- Base original: `npm run test:e2e` passou com **164/164**, desktop e mobile,
  sem retries (4,3 minutos).
- Regressões novas contra a base original: 3 falhas esperadas no desktop,
  exatamente nas verificações de bloqueio e permanência do aviso de conflito.
- Cópia com a correção: `npm run check` passou, incluindo os 44 testes existentes.
- `git apply --check` do patch contra a base original passou.
- Patch: os **6 cenários de regressão** (3 × desktop/mobile) passaram.
  Reexecução final dirigida: **8/8** em 25 segundos, incluindo os dois testes
  existentes da prévia do link.
- Também foi executado `guest.spec.ts` completo com o patch. Na primeira
  rodada conjunta foram 47 sucessos e 5 falhas: faltava a imagem OG na cópia
  temporária e o seletor dos testes novos confundia o aviso do rascunho com a
  mensagem do servidor após o 409. A imagem foi restaurada e o seletor passou
  a identificar a região `status`; todos esses casos passaram na reexecução
  dirigida. São 52 cenários distintos cobertos no total, não uma execução
  única de 52/52.

A tentativa inicial de compartilhar `node_modules` por symlink foi descartada
por restrição do Vite ao servir fontes fora da raiz; a validação acima usou
cópia própria das dependências. Quando outro processo ocupou a porta 4173,
a última rodada usou 4175 sem interrompê-lo. Esses ajustes são apenas do
ambiente temporário, não integram o patch.

Inspeção visual: página inicial em 1440 px e convite em 390 px, com dados
fictícios. A página inicial mais recente mantém “Mais carinho. Menos
complicação.”, como a captura enviada pelo usuário. A captura, sozinha, não
comprova deploy antigo. Não foi verificado o commit efetivamente publicado no
Cloudflare. As ressalvas de acessibilidade já documentadas pelo Claude em
`docs/design/CARDS.md`, seção 4, continuam para G4; não foram tratadas como
descobertas novas desta revisão.

Limites: não foram executados testes com banco real, smoke remoto ou publicação.
As evidências de API simulada não substituem a validação integrada de banco/API.

## G3 — correção pronta para o responsável pelo front

O arquivo [2026-09-17-claude-front.patch](2026-09-17-claude-front.patch) contém
somente a correção de `GuestPage.tsx` e os três cenários novos de regressão
em `tests/e2e/review-quantity.spec.ts` (desktop e mobile).

O patch foi preparado e exercitado numa cópia descartável. Não está aplicado
em `codex/back` nem em `claude/front`: `AGENTS.md` determina que “Um agente não
altera arquivos da área do outro”, com achados de front encaminhados ao quadro.
Pedido registrado em `docs/TAREFAS-AGENTES.md`.

No clone/branch do front, após revisar o patch e conferir a base:

```sh
git apply --check /caminho/2026-09-17-claude-front.patch
git apply /caminho/2026-09-17-claude-front.patch
npm run check
npm run test:e2e
```

Se o código já tiver evoluído, adaptar os dois ajustes e os testes; não forçar
aplicação. Commit/push dependem da revisão do diff pelo usuário. Merge continua
com o usuário; nenhum gate remoto é autorizado por este relatório.
