# G3.1 · Sistema de cards (adaptado ao chadbb)

Versão do `cards-original.md` encaixada no projeto. Entra no mesmo PR do G3
(convite). Não antecipa a reorganização do painel e da lista (G4): as telas
mantêm a estrutura; só os cards mudam por dentro.

Data: 2026-09-16. Responsável: Claude (front).

## 1. Regra central

Um card é **uma superfície**. A hierarquia vem de espaço, peso, cor semântica e
um divisor antes das ações; não de caixas coloridas dentro do card.

```txt
.card.card-stack
├─ header.card-header
│  ├─ .card-badges    selos (StatusBadge, sempre com ícone)
│  ├─ .card-title     título (h3; h4 quando já há um h3 de grupo acima)
│  └─ .card-description  descrição curta, opcional
├─ conteúdo           disponibilidade, número, reserva
├─ área interativa    QuantityField + um CTA
└─ .card-actions      ações secundárias, abaixo do divisor
```

Áreas vazias são omitidas; o espaçamento vem só do `gap` de `.card-stack`
(sem `mt-*` entre as partes).

## 2. O que foi aplicado

| Proposta | No chadbb | Evidência |
|---|---|---|
| Anatomia padrão | Classes `.card-stack`, `.card-header`, `.card-badges`, `.card-title`, `.card-description`, `.card-reservation`, `.card-actions`, `.card-disclosure` | todo `article`, `li` e link com `.card` usa `.card-stack` (teste “mesma anatomia”) |
| Tokens | `--card-radius`, `--card-padding`, `--card-gap` (12 px), `--card-section-gap` (16 px), `--card-border`, `--card-surface`, `--control-radius`, `--action-gap`, `--divider-color` | `src/styles.css` |
| Disponibilidade | `Availability`: texto “N de M disponíveis” antes da barra; `Progress` com `label` vira `progressbar` com nome e valor | axe (`aria-progressbar-name`) e testes G3.1 |
| Completo sem depender de cor | Selo “✓ Completo” no convite e no painel (antes, “Tamanho completo” em texto e barra verde) | testes “fralda por tamanho” e “card de fralda” |
| Reserva integrada | “Sua reserva **2 pacotes**”, sem caixa rosa | teste “reserva integrada ao card” |
| Stepper | `QuantityField`: `− \| valor \| +` num só controle, rótulo visível curto (“Quantidade”, “Pacotes”) e o produto só para leitor de tela; nos limites, `aria-disabled` mantém o foco | testes do convite, da lista e do catálogo |
| Um CTA por card | Convite: “Escolher presente” / “Atualizar quantidade” (primário). Organizador: nenhum botão preenchido nos cards; a ação principal da tela continua fora deles (“Criar convite”, “Preparar lista do chá”) | testes “nenhum botão preenchido” |
| Ações secundárias | Abaixo do divisor, como `ghost`/`danger` compactos | card de fralda e card de convidado |
| Progressive disclosure | “Trocar tamanho ›” abre “Novo tamanho” + “Confirmar troca” (`aria-expanded`, `aria-controls`, foco no select) | teste “trocar tamanho só abre quando pedido” |
| Sem card dentro de card | Mimo da lista perdeu a caixa `.notice`; produto fora do catálogo virou selo “! Fora do catálogo” + descrição | teste “mimo sem caixa interna” |
| Card interativo | O card de evento é um link inteiro, sem botões dentro | teste “card de evento” |
| Foco ao salvar | “Atualizar quantidade” e “Adicionar” usam `busy` (`aria-disabled`): o foco fica no botão durante e depois do envio (antes caía no `body`) | testes “lista: salvar” e “catálogo: sucesso e erro” |

## 3. Onde cada card está

| Card | Arquivo | Observação |
|---|---|---|
| Fralda/mimo do convite (referência) | `src/features/guests/GuestPage.tsx` (`GuestGift`) | estados sem reserva, reservado, compra informada, completo, encerrado |
| Convidado | `src/features/guests/InvitationsPage.tsx` (`GuestCard`) | `.guest-card` é só o contêiner da container query das ações |
| Resumo | idem (`Summary`) | número grande (`.stat`) como conteúdo |
| Fralda por tamanho (painel) | idem (`Diapers`) | barra “N de M pacotes comprometidos”; “N disponíveis” some quando o tamanho completa |
| Mimo (painel) | idem (`Treats`) | título + unidades |
| Escolha do convidado | idem (`Choices`) | selo “Vai levar” ou “✓ Compra informada” |
| Item da lista | `src/features/gifts/GiftListPage.tsx` (`ItemCard`) | stepper até 10 000; “Atualizar quantidade” só habilita quando o valor muda |
| Produto do catálogo | idem (`ProductCard`) | “Adicionar” secundário; “✓ Já na lista” sem controles |
| Evento | `src/features/events/EventsPage.tsx` | link inteiro; título em `h2` com o tamanho `text-h2` |

## 4. O que não entrou agora, e por quê

| Proposta | Decisão | Quando |
|---|---|---|
| Componentes React `Card`, `GiftCard`, `SummaryCard` | As classes já concentram a anatomia; extrair componentes junto com a reorganização das listas evita mexer duas vezes | G4 |
| Menu de ações (“…”) | Continua com `ActionMenu` previsto na foundation | G4 |
| “Disponibilidade 4 / 6” em linha | O texto em cima da barra funciona de 320 px a 1366 px; a variante em linha fica para o painel novo | G4 |
| Total geral “X de Y pacotes” | Depende de `summary.diapers` do servidor (pedido ao Codex no quadro) | quando o back entregar |
| Formulários de criar/editar convite e evento | Não são cards de conteúdo; entram na revisão de formulários | G4/G5 |
| Erro de quantidade ligado ao campo | Hoje o navegador barra vazio, 0 e 10 001 com o balão nativo (nenhuma chamada sai); a mensagem própria do card nunca aparece. Precisa de uma prop `error` no `QuantityField` | G4 |
| Título antes dos selos no DOM | Quem navega por títulos não ouve o status (“Completo”, “Compra informada”), que vem antes. Opção: título primeiro no DOM e selos com `order: -1` | G4 |
| Número repetido no painel | “6 de 6 pacotes comprometidos” é lido no número e na barra | G4 (painel novo) |
| “Adicionando…” e foco após incluir | O `aria-label` fixo esconde o estado ocupado; depois de incluir, o formulário some e o foco se perde (o status é anunciado) | G4 |

## 5. Critérios de aceite

- [x] cards compartilham raio, borda, fundo, padding e `gap`;
- [x] pill só em selo e barra;
- [x] nenhuma caixa colorida dentro de card (teste);
- [x] um CTA dominante por card no convite; nenhum preenchido no organizador;
- [x] ações secundárias com menos peso, abaixo do divisor;
- [x] “completo” com texto e ícone, não só cor;
- [x] barras com `progressbar` e nome;
- [x] stepper único, com alvos de 48 px e nome acessível;
- [x] axe sem violações e sem rolagem horizontal a 320 px nas telas testadas;
- [x] nenhuma mudança estrutural do G4.
