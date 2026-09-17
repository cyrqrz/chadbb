# G4 · Painel do evento (plano executado)

Data: 2026-09-17. Responsável: Claude (front). Base: `main` em `2f4d3a5`.
Pedido do usuário: o organizador precisa achar o painel com os dados sem
procurar, e conseguir ver o convite como o convidado vê.

## Problema

- O painel (“Convites e confirmações”) ficava a três cliques de “Seus eventos”,
  atrás da tela de edição do evento.
- Não havia um jeito de ver o convite sem criar um convite de teste.
- Cada tela do evento tinha o próprio cabeçalho; nada mostrava “onde estou”.

## Decisões

| Tema | Decisão |
|---|---|
| Tela inicial do evento | `/eventos/:id` passa a ser o **Painel**. O card em “Seus eventos” leva direto a ele |
| Edição do evento | Vai para `/eventos/:id/dados` (“Dados do evento”). Criar um evento novo abre essa aba, porque ele ainda precisa dos detalhes |
| Endereço antigo | `/eventos/:id/convites` redireciona para `/eventos/:id` (links e favoritos antigos continuam funcionando) |
| Cabeçalho comum | `EventLayout`: voltar para “Seus eventos”, status, **título do evento (h1)**, data, “faltam N dias” e abas: Painel · Presentes · Dados do evento, mais o atalho **“Ver como o convidado vê”** |
| “Faltam N dias” | Só apresentação, pela data no horário de Brasília; nenhuma regra de negócio depende dele (regra 6 do `AGENTS.md`) |
| Ordem do painel | Resumo → Convidados → Fraldas por tamanho → Mimos → Escolhas dos convidados |
| Criar convite | Botão **“Convidar alguém”** abre o formulário no próprio painel; o formulário continua aberto enquanto houver link novo ou aviso |
| Fraldas | Uma lista de progresso num só bloco (tamanho, barra, “N de M”, selo “Completo”), em vez de um card por tamanho |
| Prévia | `/eventos/:id/previa` mostra o convite real (mesmo componente do convidado) com dados de exemplo para o convidado, só leitura: nada é enviado, e uma faixa explica isso |
| Total geral de fraldas | Continua fora: depende de `summary.diapers` do servidor (pedido no quadro) |

## Fora deste gate

- Lista de presentes “com menos caixas” e A11–A13: a tela só entra no cabeçalho
  comum; a reorganização interna fica para a G4b.
- `ConfirmDialog` (A17) e `ActionMenu`: sem dependência nova agora.
- Ressalvas de `CARDS.md` §4 que não tocam estas telas.

## Gates

| Gate | Entrega | Evidência exigida |
|---|---|---|
| G4.0 | Este plano | — |
| G4.1 | Rotas e `EventLayout` (cabeçalho e abas) | testes e2e novos falhando antes, passando depois; axe nas quatro abas |
| G4.2 | Painel: ordem nova, “Convidar alguém”, fraldas em lista | e2e do painel, 320 px com texto a 200% |
| G4.3 | Prévia do convite | e2e: nada é enviado, faixa visível, axe |
| G4.4 | QA de UX, `npm run check`, e2e completo, `test:browser:local`, capturas | relatório do QA e página de revisão |
| G4.5 | Aprovação do usuário → commit, push e PR | diff revisado |

Nenhum gate mexe em `supabase/`, `functions/` ou contratos.
