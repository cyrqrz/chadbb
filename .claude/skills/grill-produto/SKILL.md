---
name: grill-produto
description: Entrevista implacável sobre o chadbb, usando o que o projeto já tem (docs, código, pendências) para achar o que melhorar no produto. Use quando o usuário pedir para ser questionado/grelhado sobre o produto, prioridades ou próximos passos.
disable-model-invocation: true
---

Chame a skill `grilling` e conduza a entrevista em português.

Antes da primeira rodada, envie um sub-agente para levantar os fatos (nunca peça ao
usuário o que dá para ler): `docs/PLANO-PRODUTO-HISTORICO.md`,
`docs/PROXIMOS-PASSOS-M6.md`, `docs/TAREFAS-AGENTES.md`, `docs/FRALDAS-E-MIMOS.md`,
`docs/RSVP-LEMBRETES.md`, `docs/ENTREGA-E-SUPORTE.md`, `git log --oneline -30` e as telas
em `src/features/`. Traga: o que já existe, o que está pendente ou bloqueado, decisões
que ficaram em aberto e riscos.

Questione com base nesses fatos, citando o arquivo ou a tela de onde veio cada ponto.
Áreas para percorrer na árvore de decisão: experiência do convidado (convite, RSVP,
presentes, mimos), experiência do organizador (painel, prévia, convites), operação
(e-mails, backup, restauração, suporte), segurança e LGPD, e o que falta para a
família entrar de verdade. Cada pergunta traz a sua recomendação.

Respeite o `AGENTS.md`: a entrevista só decide e registra; nada de commit, push ou
ação remota sem a aprovação do usuário. Ao terminar (fronteira vazia e confirmação do
usuário), resuma as decisões e proponha as tarefas resultantes.
