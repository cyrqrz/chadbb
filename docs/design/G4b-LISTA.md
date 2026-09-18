# G4b · Lista de presentes com menos caixas (plano)

Data: 2026-09-18. Responsável: Claude (front). Base: `main` em `3f8db58`.
Origem: `PLANO-VISUAL.md` §6 (“resumo no topo, menos caixas, catálogo como
lista”), `plano-original.md` §16 e os achados A11–A13 de `audit.md`. A G4 só
pôs a aba Presentes no cabeçalho comum (`G4-PAINEL.md`, “Fora deste gate”).

## Problema

- A aba empilha caixa dentro de caixa: cartão da lista pronta, um cartão por
  tamanho de fralda, um cartão por mimo e uma grade de cartões no catálogo.
  Com 4 fraldas e 23 mimos, a tela vira uma parede de bordas.
- Não há visão geral: para saber quantos pacotes foram pedidos, é preciso ler
  os quatro cartões.
- Três falhas de estado herdadas da G2:
  - **A11**: voltar a uma categoria que falhou mostra o erro antigo durante a
    nova tentativa, em vez de “Carregando a lista…”.
  - **A12**: se uma página da lista falha, a paginação some e só resta “Tentar
    novamente”; não dá para voltar à página anterior.
  - **A13**: se só a consulta do evento falha na reconsulta, nada avisa. O
    estado “encerrado” pode ficar desatualizado (a lista continuaria editável
    num evento que já foi encerrado em outra aba).

## Decisões

| Tema | Decisão |
|---|---|
| Resumo no topo | Um cartão “Lista do chá” com os pacotes pedidos por tamanho (P · M · G · XG, ou “fora da lista”) e o número de mimos. **Sem total somado no front** (regra 6 e `PLANO-VISUAL.md`): o total entra quando o servidor mandar `summary.diapers` (pedido no quadro). Reservas e progresso continuam no Painel |
| Lista pronta | Lista vazia: continua o destaque “Comece com a lista pronta do chá”. Lista com itens: vira uma linha discreta no resumo (“Completar a lista do chá”), sem cartão próprio |
| Fraldas | Uma lista única, uma linha por tamanho (selo do tamanho, produto, stepper, “Atualizar quantidade”). Erro, “versão mais recente” e sucesso ficam na própria linha |
| Mimos | Uma lista única, uma linha por mimo (nome e, se for o caso, o selo “Fora do catálogo”). O texto “sem limite” aparece uma vez no topo da lista, e não em cada item |
| Catálogo | Busca igual; resultados em lista (nome, selos, pacotes/“Adicionar” ou “Já na lista”), no lugar da grade de cartões |
| A11 | O erro exibido pertence à categoria e à página atuais; ao trocar de categoria, a tela mostra “Carregando a lista…” até a resposta |
| A12 | Página com falha: o erro aparece no lugar dos itens e a paginação continua visível, para voltar à página anterior |
| A13 | Falha na reconsulta do evento aparece como aviso no topo da aba (“Não foi possível conferir se o evento continua aberto…”, com “Conferir de novo”), mantendo os dados da última consulta |
| Regras | Nada muda no comportamento de salvar: versão, limite 1–10 000, recusa de repetição pelo banco, reconsulta depois de salvar (regras 6 e 7 do `AGENTS.md`) |

## Fora deste gate

- Progresso de reservas na lista (já está no Painel; o total geral de fraldas
  depende de `summary.diapers`, pedido no quadro).
- `ConfirmDialog` (A17): o “Recarregar quantidade” continua com
  `window.confirm`.
- Qualquer mudança em `supabase/`, `functions/` ou contratos. Se o resumo
  precisar de dado que a consulta atual não traz, o pedido vai para o quadro e o
  resumo sai sem esse número.

## Gates

| Gate | Entrega | Evidência exigida |
|---|---|---|
| G4b.0 | Este plano | — |
| G4b.1 | A11, A12 e A13 | um teste e2e por achado, falhando antes e passando depois |
| G4b.2 | Resumo no topo e lista pronta compacta | e2e do resumo (valores, lista vazia, encerrado); axe |
| G4b.3 | Fraldas e mimos em lista, sem um cartão por item | e2e existentes da lista verdes (stepper, versão, erro no item, encerrado); 320 px com texto a 200% |
| G4b.4 | Catálogo em lista | e2e existentes do catálogo verdes; teclado e foco |
| G4b.5 | QA de UX, `npm run check`, e2e completo, `test:browser:local`, capturas antes e depois | relatório do QA e página de revisão |
| G4b.6 | Aprovação do usuário → commit, push e PR | diff revisado |

Nenhum gate mexe em `supabase/`, `functions/` ou contratos.
