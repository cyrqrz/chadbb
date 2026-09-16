# chadbb · Padronização de Cards

## Objetivo

Padronizar os cards do produto para eliminar a sensação de interface desorganizada, reduzir “caixas dentro de caixas” e criar uma hierarquia visual consistente entre painel, convite, lista de presentes e estados de reserva.

Este ajuste deve trabalhar principalmente:

- anatomia dos cards;
- hierarquia interna;
- espaçamento;
- ações;
- estados;
- responsividade;
- acessibilidade.

A ideia não é redesenhar cada tela isoladamente. O objetivo é criar **um sistema de cards reutilizável**.

---

## 1. Princípio principal

> Um card deve parecer uma única superfície organizada, e não um conjunto de blocos empilhados dentro de outro bloco.

Evitar:

- excesso de bordas internas;
- excesso de fundos coloridos;
- muitos elementos com `rounded-*`;
- repetir informações;
- mostrar todas as ações possíveis ao mesmo tempo;
- vários botões competindo com o CTA principal.

Preferir:

- espaço em branco;
- tipografia;
- agrupamento;
- divisores discretos;
- progressive disclosure;
- um único CTA dominante.

---

## 2. Anatomia padrão

Todos os cards devem partir desta estrutura:

```txt
Card
├─ Header
│  ├─ badges / status
│  ├─ título
│  └─ descrição opcional
│
├─ Content
│  └─ informação principal
│
├─ InteractiveArea
│  └─ controles da tarefa atual
│
└─ Actions
   └─ ações secundárias
```

Nem todo card precisa usar todas as áreas.

A composição deve continuar simples quando partes forem omitidas.

---

## 3. CardHeader

O topo do card deve responder rapidamente:

- o que é;
- em qual estado está;
- qual informação é mais importante.

Ordem sugerida:

```txt
[Badge] [Status]

Título principal
Descrição curta
```

### Regras

- badges podem continuar em formato pill;
- título deve ter maior peso que descrição;
- evitar repetir no conteúdo algo que já aparece no título;
- status deve ser curto;
- não criar caixas adicionais apenas para status simples.

---

## 4. Conteúdo

O conteúdo deve ser agrupado por significado.

Exemplo para fraldas:

```txt
Fraldas tamanho P
Pacote fictício

4 de 6 disponíveis
████████████░░░
```

Evitar:

```txt
Fraldas tamanho P

Pacote fictício

barra

4 de 6 pacotes disponíveis

Pacotes de Fraldas tamanho P
```

Há informação repetida demais no segundo modelo.

---

## 5. Disponibilidade

Padronizar a área de disponibilidade.

Sugestão:

```txt
4 de 6 disponíveis
████████████░░░
```

ou, quando houver espaço:

```txt
Disponibilidade                   4 / 6
████████████████░░░░░
```

### Regras

- texto vem antes da barra;
- barra complementa a informação;
- não depender apenas de cor;
- estado completo deve ter texto e/ou ícone além da mudança visual;
- progress bar deve possuir semântica acessível.

---

## 6. Área de reserva

Quando houver reserva ativa, evitar criar uma caixa colorida grande apenas para dizer:

> Você confirmou 2 pacote(s).

Preferir:

```txt
Sua reserva
2 pacotes
```

ou:

```txt
Reservado por você
2 pacotes
```

A informação deve ser integrada ao card, não parecer outro card dentro dele.

---

## 7. Stepper de quantidade

Padronizar `- quantidade +` como um único componente.

Preferir:

```txt
Quantidade

┌──────┬────────┬──────┐
│  −   │   2    │  +   │
└──────┴────────┴──────┘
```

Em vez de três controles visualmente independentes.

### Regras

- altura mínima de toque adequada;
- botões `−` e `+` com nome acessível;
- valor atual legível;
- estado disabled perceptível;
- radius de controle, não pill;
- comportamento consistente em todos os cards.

---

## 8. CTA principal

Cada card deve ter, no máximo, **uma ação de alta ênfase**.

Exemplos:

```txt
Escolher presente
```

```txt
Atualizar quantidade
```

```txt
Salvar alterações
```

O restante deve usar `secondary`, `ghost`, `text` ou menu de ações.

---

## 9. Ações secundárias

Ações como:

- trocar tamanho;
- já comprei;
- cancelar reserva;
- revogar acesso;
- reemitir link;

não devem competir visualmente com o CTA principal.

Sugestão:

```txt
────────────────────────

Trocar tamanho ›
Já comprei
Cancelar reserva
```

Ou usar um menu de ações quando houver muitas opções.

---

## 10. Progressive disclosure

Não mostrar controles complexos até serem necessários.

Exemplo atual:

```txt
Trocar tamanho P por
[ Escolha outro tamanho ]

[ Trocar meus 2 pacotes ]
```

Preferir inicialmente:

```txt
Trocar tamanho ›
```

Após interação:

```txt
Trocar tamanho

[ Escolha outro tamanho ]

[ Confirmar troca ]
```

### Acessibilidade

Usar:

- `<button>`;
- `aria-expanded`;
- `aria-controls`;
- foco previsível;
- suporte a teclado.

---

## 11. Cards não devem conter outros “cards visuais”

Evitar este padrão:

```txt
Card
 ├─ badge
 ├─ bloco rosa arredondado
 ├─ input arredondado
 ├─ botão arredondado
 ├─ outro bloco
 └─ outro botão
```

Usar:

```txt
Card
 ├─ conteúdo
 ├─ espaço
 ├─ divisor
 └─ ações
```

A hierarquia deve vir principalmente de:

- espaçamento;
- tamanho;
- peso tipográfico;
- alinhamento;
- cor semântica;
- divisores.

---

## 12. Shape system

Padronizar radius por categoria.

| Elemento | Radius sugerido |
|---|---:|
| Badge | pill |
| Button | 10px |
| Input / Select | 10–12px |
| Stepper | 10–12px |
| Card | 14–16px |
| Modal / painel grande | 16–20px |

### Regra

`rounded-full` deve ser exceção.

Usar em:

- badges;
- avatar;
- controles realmente circulares.

Não usar como padrão para botões ou cards.

---

## 13. Espaçamento

Criar ritmo consistente.

Sugestão conceitual:

```txt
Card padding             16–20
Badge → título            8–12
Título → descrição         4–8
Seção → seção             16–20
Controle → CTA            12–16
Divisor → ações           16
```

Não precisa usar exatamente esses números se já houver escala oficial no projeto.

O importante é centralizar em tokens.

---

## 14. Tokens

Criar tokens semânticos reutilizáveis:

```css
--card-radius;
--card-padding;
--card-gap;
--card-border;
--card-surface;

--control-radius;
--control-height;

--action-gap;

--divider-color;
```

Evitar definir cada card com classes arbitrárias diferentes.

---

## 15. Variantes de Card

Evitar criar dezenas de componentes independentes.

Preferir uma base comum com composição.

Exemplos:

```txt
Card
GiftCard
GuestCard
EventCard
SummaryCard
```

Todos devem compartilhar:

- radius;
- border;
- background;
- padding;
- spacing;
- estados de foco quando interativos.

As diferenças ficam no conteúdo interno.

---

## 16. Card interativo vs card estático

### Card estático

Apenas exibe informação.

Não deve parecer clicável.

### Card interativo

Só usar quando o card inteiro realmente for uma ação.

Nesse caso:

- suporte completo a teclado;
- foco visível;
- semântica correta;
- não colocar botões clicáveis conflitantes dentro do card clicável.

---

## 17. Estados

Padronizar visualmente:

```txt
default
hover
focus-visible
selected
disabled
reserved
completed
error
```

Nenhum estado importante deve depender apenas de cor.

Exemplo:

```txt
✓ Completo
```

é melhor que apenas transformar uma barra em verde.

---

## 18. Responsividade

O card deve adaptar sua composição ao espaço disponível.

Priorizar:

- layout vertical no mobile;
- redução de texto redundante;
- botões ocupando largura total apenas quando fizer sentido;
- ações secundárias compactas;
- evitar quebra de texto em CTA.

Avaliar `container queries` quando o componente aparecer em contextos diferentes.

---

## 19. Acessibilidade

Cada card deve manter:

- heading ou estrutura semântica coerente;
- botões reais para ações;
- links apenas para navegação;
- foco visível;
- targets adequados;
- contraste suficiente;
- nomes acessíveis;
- status não dependente só de cor;
- progress bar com semântica;
- disclosures com ARIA correto;
- leitura coerente em screen reader.

---

## 20. Primeiro card de referência

Usar o card de fraldas como primeiro componente para definir o padrão.

### Estado sem reserva

```txt
[ Tamanho M ]

Fraldas tamanho M
Pacote fictício

15 de 19 disponíveis
████████████████░░░

Quantidade

[ − | 1 | + ]

[ Escolher presente ]
```

### Estado reservado

```txt
[ Tamanho P ] [ Reservado ]

Fraldas tamanho P
Pacote fictício

4 de 6 disponíveis
████████████░░░░

Sua reserva
2 pacotes

[ − | 2 | + ]

[ Atualizar quantidade ]

────────────────────────

Trocar tamanho ›
Já comprei
Cancelar reserva
```

A intenção não é copiar literalmente esse layout, mas usar essa hierarquia como referência.

---

## 21. Aplicação no projeto

Depois de validar o card de fraldas:

1. transformar a estrutura aprovada em padrão;
2. extrair tokens;
3. extrair componentes reutilizáveis;
4. aplicar aos demais cards;
5. remover estilos duplicados;
6. revisar estados;
7. revisar acessibilidade;
8. testar desktop e mobile.

Evitar fazer pequenas correções diferentes card por card sem uma regra central.

---

## 22. Critérios de aceite

A padronização estará aprovada quando:

- cards compartilham a mesma linguagem visual;
- radius é consistente;
- não existem pills sem função clara;
- cards não parecem conter outros cards;
- há um único CTA principal por contexto;
- ações secundárias têm menor peso;
- conteúdo redundante foi removido;
- informações relacionadas estão agrupadas;
- espaçamento segue tokens;
- estados são consistentes;
- controles continuam acessíveis;
- mobile não parece uma pilha de formulários;
- o mesmo componente mantém coerência em diferentes telas.

---

## Princípio final

> O card deve organizar a decisão do usuário.

Antes de adicionar uma borda, fundo, badge, botão ou bloco interno, perguntar:

1. isso cria hierarquia ou apenas adiciona outra caixa?
2. essa informação já aparece em outro lugar?
3. essa ação precisa estar visível agora?
4. ela merece o mesmo peso do CTA principal?
5. consigo organizar isso com espaço e tipografia em vez de outro container?

A meta é fazer os cards parecerem partes do mesmo produto, com menos ruído e uma hierarquia visual previsível.
