# Audit visual e de UX (G1)

Data: 2026-09-16. Base: `claude/front` em `69b9d33`, mais as três correções da
revisão do PR #7 (ainda em aprovação). Plano: `docs/design/PLANO-VISUAL.md`.

As medições foram feitas com o backend simulado das capturas (dados fictícios),
a 390 px e a 320 px com texto a 200%. O axe vem dos testes e2e.

## 1. Telas

| Rota | Quem usa | Carregando | Erro | Vazio | Sucesso | Atualização | Somente leitura | Sem conexão |
|---|---|---|---|---|---|---|---|---|
| `/` | público | — | aviso de configuração | — | — | — | — | não |
| `/entrar` | organizador | sim | sim | — | sim | — | — | não |
| `/auth/callback` | organizador | sim | sim (texto solto) | — | — | — | — | não |
| `/eventos` | organizador | sim | sim | sim | — | sim | — | não |
| `/eventos/:id` | organizador | sim | sim | “não encontrado” | sim | sim | sim (encerrado) | não |
| `/eventos/:id/presentes` | organizador | sim | sim | sim | sim | sim | sim | não |
| `/eventos/:id/convites` | organizador | sim | sim | sim | sim | sim | parcial (sem evento publicado) | não |
| `/convite` | convidado | sim | sim | sim | sim | sim | sim (encerrado) | não |
| `*` | todos | — | 404 simples | — | — | — | — | — |

Lacunas: não há estado **sem conexão** em nenhuma tela (fica para o G5/T-F4),
não há **skeleton**, e o erro do `/auth/callback` e o 404 não usam os
componentes comuns.

## 2. Componentes

Existentes: `Layout`, `States` (`LoadingState`, `ErrorState`, `EmptyState`,
`SuccessMessage`, `RefreshStatus`).

Padrões que só existem como classe CSS ou JSX repetido, e que o G2 deve virar
componente:

| Padrão | Onde aparece hoje | Componente no G2 |
|---|---|---|
| Botões `.button` / `.secondary` / `.text-link` | todas as telas | `Button` (variantes) |
| Campo `label.field` + `input` + `.hint` | 22 usos | `Field` |
| Abas `.segmented` com `aria-pressed` | convite, lista | `Tabs` |
| Barra `.meter` | painel | `Progress` |
| Selo `.badge` / `.badge-success` | 6 usos | `StatusBadge` (ícone + texto) |
| Formulário de quantidade | `GuestGift`, `ItemCard`, `ProductCard` | `QuantityField` |
| Paginação | `EventsPage` (própria) e `GiftListPage` | `Pagination` único |
| Título de seção + descrição | todas | `Section` |
| Confirmação destrutiva | `window.confirm` (reemitir, revogar, descartar) e confirmação na tela (encerrar evento) | `ConfirmInline` único |

O JSX tem muitas linhas longas (acima de 200 caracteres): `GuestPage` 21,
`GiftListPage` 17, `InvitationsPage` 15, `EventPage` 12. Extrair os
componentes acima sem mudar comportamento reduz isso e facilita a revisão.

## 3. Tokens e valores fixos

- **Cores:** `styles.css` já tem variáveis em `:root` e sobrescreve os tons
  `stone` do Tailwind, mas ainda há 26 hexadecimais diferentes (gradientes,
  bordas de estado, placeholder). Nos componentes, `text-stone-600` aparece 31
  vezes e `border-stone-300`, 6.
- **Espaçamento:** margens avulsas por elemento (`mt-4` 33×, `mt-6` 30×,
  `mt-3` 26×, `mt-2` 17×, `mt-5` 16×, `mt-8` 11×, `mt-10` 10×). Não há ritmo
  vertical definido; o G2 adota a escala 4/8/12/16/24/32/48/64 e `gap` nos grupos.
- **Raios:** 12 valores diferentes (0,25 a 2 rem, `999px`, `rounded-2xl`,
  `rounded-3xl`, `rounded-[2rem]`). Meta: `sm`, `md`, `lg`, `xl`, `full`.
- **Tipografia:** `h1` e `.page-title` com `clamp`; títulos de seção com
  `text-xl`/`2xl`/`3xl` escritos direto nas telas (11 em `GiftListPage`, 11 em
  `InvitationsPage`); rótulos pequenos em 0,78 rem (`.eyebrow`, `.badge`) e
  dica em 0,86 rem. Não há escala nomeada.
- **Alturas mínimas:** 44, 48 e 52 px convivem; o G2 fixa 44 px como mínimo de
  toque e 48 px para campos e botões principais.
- **Pontos de quebra:** `sm` 6×, `md` 14×, `lg` 4×, mais 768 px (convite) e
  900 px (login) no CSS.

## 4. Movimento

Animações: `rise` (entrada de página, estados, cartões em sequência e troca de
aba), `grow` (barra), `spin` e `float`. Existe uma regra global para
`prefers-reduced-motion`, e os e2e rodam com movimento reduzido.

Problemas:

- `float` anima a estrela da capa padrão em loop, sem função; sai no G2;
- as animações vieram antes da foundation e usam durações soltas
  (0,3–0,8 s); o G2 as passa para `--duration-*` e `--ease-*`.

## 5. Acessibilidade (achados com evidência)

| # | Gravidade | Achado | Evidência | Critério | Quando |
|---|---|---|---|---|---|
| A1 | alta | Detalhes do evento (publicado ou encerrado) rolavam 218 px na horizontal a 320 px com texto a 200% | medição: o `fieldset` “Só para convidados” não encolhia abaixo do conteúdo | WCAG 1.4.10 | **corrigido** (`fieldset { min-width: 0 }`, teste e2e novo) |
| A2 | média | Contorno dos campos `#cdb8c1` com 1,87:1 sobre branco | cálculo de contraste | WCAG 1.4.11 (3:1) | G2 |
| A3 | média | Placeholder `#8c7780` com 4,15:1 | cálculo de contraste | boa prática (4,5:1) | G2 |
| A4 | média | Links de voltar (“← Detalhes do evento”, “← Seus eventos”) com 19 px de altura | medição a 390 px | WCAG 2.5.8 (24 px) e meta do projeto (44 px) | G2 |
| A5 | baixa | Ações destrutivas usam `window.confirm`, fora do visual e sem explicar a consequência | código | consistência | **corrigido** no G5.1 (`ConfirmDialog`, `<dialog>` nativo, nos seis pontos que usavam `window.confirm`) |
| A6 | baixa | Sem axe em `/`, `/entrar`, `/eventos` e `/auth/callback` | testes atuais | T-F3 | G2 (login) e G4 |
| A7 | baixa | Erro do callback e 404 fora dos componentes comuns | código | consistência | G5 |
| A8 | média | Ao apertar Enter em “Tentar novamente”, o botão fica `disabled` e o foco volta ao `body` | QA de UX, confirmado no Playwright | WCAG 2.4.3 | G2 (`Button` com `aria-disabled`) |
| A9 | baixa | No primeiro carregamento do catálogo, itens já incluídos mostram “Adicionar” por um instante | QA de UX | UX | G4 |
| A10 | baixa | Reemitir o link do convite que está em edição mantém a versão antiga no formulário; salvar em seguida dá conflito | QA de UX | UX | G4 |
| A11 | baixa | Voltar a uma categoria da lista que falhou mostra o erro anterior durante a nova tentativa, em vez de “Carregando a lista…” | QA de UX (G2) | UX | **corrigido** na G4b.1 (`useLastError` com chave da categoria e da página; e2e “A11 ·”) |
| A12 | baixa | Se uma página da lista falha, a paginação some e só resta “Tentar novamente” | QA de UX (G2) | UX | **corrigido** na G4b.1 (última contagem conhecida mantém a paginação, também no catálogo; e2e “A12 ·”) |
| A13 | baixa | Na lista de presentes, falha só na consulta do evento não é avisada (o estado “encerrado” pode ficar desatualizado) | QA de UX (G2) | UX | **corrigido** na G4b.1 (`RefreshStatus` no topo da aba; e2e “A13 ·”) |
| A14 | baixa | Durante a tentativa, o leitor de tela ouve só “Tentar novamente, indisponível”, sem dizer que está tentando | QA de UX (G2) | WCAG 4.1.3 | **corrigido** no G5.4 (`ErrorState`/`RefreshStatus`: `role="status"` `sr-only` "Tentando de novo…" enquanto `busy`, sem trocar o nome do botão — o foco e os testes existentes dependiam do nome fixo) |
| A15 | baixa | “Tamanho completo” comunicava um estado por meio de um botão indisponível (texto a ~3,1:1) | QA de UX (G2.1) | UX | **corrigido no G3** (selo “Completo”) |
| A16 | baixa | Várias ações primárias por tela (uma por card de presente, por produto, e “Salvar convite” junto de “Criar convite”) | QA de UX (G2.1) | hierarquia | **corrigido** no G5.4 para convites: abrir “Convidar alguém” cancela uma edição em curso (sem confirmação, como “Cancelar edição”); editar um convite fecha “Convidar alguém” — com a mesma confirmação de link não copiado quando há um link pendente. A coexistência de `edit` com o link recém-reemitido (dentro da própria edição) é intencional e já teria testes próprios; fora deste achado |
| A17 | baixa | Confirmação de encerramento na própria tela, sem diálogo | QA de UX (G2.1) | UX | **decisão no G5.2**: não migrar. A confirmação inline em disclosure (`EventPage`, `EventsPage`) já é acessível e sem `window.confirm`; um modal não é uma melhoria clara sobre manter a pergunta no lugar da ação, e trocar sem necessidade arrisca regressão nos testes existentes desses fluxos. `ConfirmDialog` fica reservado para onde a ação sai do contexto da tela (como já está nos seis pontos do G5.1) |
| A18 | baixa | No convite, se outro convidado esgota o tamanho enquanto a pessoa digita a quantidade, o formulário some sem explicação | QA de UX (G3) | UX, regra 7 do AGENTS.md | **corrigido** no G5.4: com um rascunho pendente, o cartão mostra “Este tamanho completou enquanto você escolhia. Sua quantidade não foi enviada; escolha outro tamanho, se houver.” no lugar do formulário |
| A19 | baixa | Quantidade acima do máximo só mostra a mensagem nativa do navegador; falta dica visível do limite | QA de UX (G3) | UX | **já coberto pelo G3.1**: o `Availability` (“N de M disponíveis” + barra) fica sempre visível antes do `QuantityField` nos itens com limite (fraldas), então o limite real já aparece perto do campo antes de a pessoa digitar. Revisto no G5.4; nenhuma mudança de código |
| A20 | média | A 320 px com texto a 200%, o campo do stepper não encolhia. Onde o campo era forçado a caber (convite e lista), quem cedia espaço eram o − e o +, que caíam para 36 px, porque `.stepper` esconde o que transborda; no catálogo, onde nada forçava, o próprio campo passava da borda da linha (medido: 242 px numa linha de 224 px) e o + era cortado por um ancestral. Preexistente nas duas telas do convidado e do catálogo | medição no Playwright (QA da G4b.3): botões de 36 px a 320 px com texto a 200%, no convite e na lista; o documento continua com rolagem lateral zero, e por isso nenhum teste de 320 px pegava a falha | WCAG 2.5.5 / 2.5.8 (alvo de toque) | **corrigido** na G4b.3 (`min-width: 0` no campo, `flex-shrink: 0` nos botões); guardas: e2e “stepper: − e + mantêm 44 px a 320 px com texto a 200%” (`panel.spec.ts`) e “quantidade: − e + mantêm 44 px a 320 px com texto a 200%” (`guest.spec.ts`) |

Sem problema, medido:

- **Rolagem horizontal:** nenhuma a 320 px com texto a 200% no painel (com e
  sem dados), no convite (fraldas e falha), na lista vazia, no catálogo e no erro
  do evento.
- **Tamanho de toque:** todos os outros elementos clicáveis dessas telas têm
  44 px ou mais (incluindo “Já comprei”, “Cancelar reserva”, “Revogar acesso” e
  a lista de mimos que abre ao toque).
- **axe:** sem violações nas telas cobertas pelos e2e (painel, convite, lista,
  catálogo, evento encerrado e estados de erro).
- **Leitor de tela:** o aviso de falha deixou de ser relido a cada nova tentativa
  (correção em revisão no PR #7).

## 6. Desempenho (build de produção)

| Arquivo | Tamanho | gzip |
|---|---|---|
| `index` (React, rotas, estados) | 302 KB | 95 KB |
| `supabase` | 215 KB | 54 KB |
| CSS | 28 KB | 7 KB |
| Fonte Figtree (latino / latino estendido) | 20 KB / 10 KB | — |
| Telas (carregadas sob demanda) | 5–14 KB cada | 1,5–4,6 KB |

Não há imagens próprias. Fontes novas do G2 entram com meta de até 120 KB somadas
(seção 4 do plano).

## 7. Prioridades para o G2

1. ~~Corrigir A1~~ (feito no PR #7) e resolver A8 junto com o `Button`.
2. Tokens: cores com as correções de contraste (A2, A3), escala de espaço, raios,
   tipografia e movimento; retirar os hexadecimais soltos.
3. Componentes: `Button`, `Field`, `Tabs`, `Progress`, `StatusBadge`,
   `Section`, `Pagination` e `QuantityField`, extraídos sem mudar comportamento.
4. Links de voltar como alvo de 44 px (A4).
5. Decisão de fontes (Manrope + Fraunces ou manter Figtree) com o peso medido.
6. Página de amostras para aprovação do G2.
