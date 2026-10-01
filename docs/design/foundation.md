# Foundation do chadbb (G2, G2.1 e G3.1)

Base visual única do front. Os valores vivem em `src/styles.css` (`@theme` e
`:root`); os componentes, em `src/components/ui/`. A página de amostras fica em
`/amostras`, só no servidor de desenvolvimento (`npm run dev`), e não entra no
build.

Plano: `docs/design/PLANO-VISUAL.md`. Achados que motivaram cada decisão:
`docs/design/audit.md`.

## Como usar

- Cores, raios, tipografia e sombras são tokens do Tailwind v4: use
  `text-muted`, `bg-surface-soft`, `border-line`, `rounded-surface`, `text-h2`,
  `shadow-md`. Não escreva hexadecimal nem raio numérico nas telas.
- Nos componentes (CSS), use os aliases por intenção: `--color-text`,
  `--color-text-muted`, `--color-surface-subtle`, `--color-border`,
  `--color-border-subtle`, `--color-focus`, `--control-height-sm/md`,
  `--space-control-x`, `--space-card`, além de `--radius-*`, `--duration-*` e
  `--ease-*`. Trocar um alias muda todos os componentes de uma vez.
- Camadas: a ordem é a do Tailwind v4 (`theme` = tokens, `base`, `components` =
  gramática do chadbb, `utilities` = ajustes locais). Conflito se resolve pela
  camada, nunca aumentando especificidade.
- Os utilitários `stone-*` antigos apontam para os mesmos neutros; na refatoração
  de cada tela, troque-os pelos nomes semânticos.
- Novas telas usam os componentes abaixo em vez de repetir classes.

## Cores

Contraste medido pela fórmula da WCAG 2.x.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `cream` / `canvas` | `#FFF8EF` | fundo quente da página | — |
| `rose` | `#B8798D` | decoração e preenchimento de progresso, nunca texto | 3,24:1 no creme |
| `champagne` | `#D8BC86` | detalhes exclusivamente decorativos | 1,74:1 no creme |
| `surface` | `#FFFFFF` | superfícies | — |
| `surface-soft` | `#F8EEF1` | superfície suave, somente leitura | — |
| `ink` | `#292326` | texto | 14,62:1 no creme |
| `muted` | `#6A6166` | texto secundário, placeholder | 4,9:1 no pior fundo (`brand-soft`); 5,67:1 no creme |
| `line` | `#D9B9C5` | bordas de cards e divisórias decorativas | — (não usar como contorno de controle) |
| `line-strong` | `#948790` | contorno de campos e botões secundários | 3,0:1 no `surface-soft`, 3,3:1 no canvas, 3,4:1 no branco |
| `brand` | `#8E3658` | ação principal, marca, foco | 7,45:1 com branco; 7,07:1 no creme; 4,83:1 no blush; 6,11:1 no brand-soft |
| `brand-hover` | `#742845` | hover, texto de selo | 9,9:1 com branco; 8,1:1 no `brand-soft` |
| `brand-soft` | `#F6E4EB` | fundo de aviso, selo, trilho de barra | — |
| `blush` | `#F2C4D4` | painel do login, seleção | 10:1 com `ink` |
| `success` | `#66806A` | ícones de concluído | 4,3:1 com branco (não usar em texto) |
| `success-text` | `#4E6852` | texto de sucesso | 5,5:1 no `success-soft` |
| `warning` | `#8A5A12` | texto de aviso | 5,4:1 no `warning-soft` |
| `danger` | `#A23B43` | texto e contorno de erro | 5,7:1 no `danger-soft` |

Diferenças em relação ao plano original, todas por contraste:

- `muted` passou de `#746B70` (4,2:1 no `brand-soft`) para `#6A6166`;
- `success` ganhou a variante `success-text`, porque `#66806A` dá 4,1:1 em texto;
- `danger` é `#A23B43`, e não `#B8474E` (4,6:1, no limite);
- foram criados `line-strong` e `warning`, que o original não tinha.

## Tipografia

| Papel | Fonte / arquivo latino | Bytes carregados |
|---|---|---|
| Corpo e interface | Manrope Variable, eixo `wght` | 24.836 |
| Títulos | Fraunces Variable, eixos `wght` + `SOFT` | 62.432 |
| Saudação do convite | Patrick Hand, peso 400 | 23.944 |

Todas são locais, OFL e usam **font-display: swap**. No convite, foram medidos
**111.212 bytes (111,2 KB / 108,6 KiB)** de fontes WOFF2 efetivamente recebidas
pelo Chromium, com cache vazio. Sem fontes externas, itálicos ou Nunito carregados.
Os CSS de Manrope/Fraunces usam unicode-range: apenas latino foi requisitado
no cenário em português. Outros alfabetos podem elevar esse total.

A variante `soft.css` instalada expõe SOFT; o token `--title-softness: 50`
só é aplicado a títulos. Corpo, campos, mensagens e números não recebem esse
eixo. Patrick Hand fica na saudação e em amostras, no máximo dois acentos por
tela; nunca em instruções extensas, prazos ou controles. A descrição do convite
usa Manrope. A personalização por evento permanece fora desta etapa visual.

A etapa de 01/10 substitui a restrição antiga de Fraunces fora do painel:
títulos do organizador também podem herdar o tratamento; controles e conteúdo
continuam Manrope. Patrick Hand foi adicionada no rascunho anterior e é mantida
para o acento aprovado; não se adicionou outra biblioteca nesta etapa. Nunito
ficou guardada no patch da personalização, sem dependência no tema entregue.

Escala (`text-*`):

| Token | Tamanho | Altura de linha | Uso |
|---|---|---|---|
| `display` | clamp(2,5–4,25 rem) | 1,05 | nome do evento, capa |
| `h1` | clamp(2–3 rem) | 1,1 | título da página |
| `h2` | 1,5 rem | 1,25 | título de seção |
| `h3` | 1,125 rem | 1,35 | título de cartão ou item |
| `body` | 1 rem | 1,6 | texto |
| `body-sm` | 0,9375 rem | 1,55 | texto de apoio |
| `label` | 0,875 rem | 1,4 | rótulos, dicas, erros de campo |
| `caption` | 0,8125 rem | 1,4 | selos, sobretítulos |

## Espaço, raio, sombra, toque

- **Espaço:** escala do Tailwind nos passos 1, 2, 3, 4, 6, 8, 12 e 16
  (4, 8, 12, 16, 24, 32, 48 e 64 px). Grupos usam `gap`; margem só entre blocos.
  Os passos 5, 7 e 10 que ainda aparecem nas telas saem na refatoração delas
  (G3/G4).
- **Forma (G2.1):** pill é exceção.

  | Token | Valor | Uso |
  |---|---|---|
  | `--radius-control` | 10 px | botões, abas, alvos de navegação |
  | `--radius-field` | 12 px | campos, opções de rádio |
  | `--radius-surface` | 20 px | cards, avisos, estados |
  | `--radius-panel` | 24 px | login, capa, lista pronta |
  | `--radius-pill` | 9999 px | só selo, spinner, avatar e ícone circular |
- **Sombras:** só `shadow-sm` (repouso) e `shadow-md` (destaque ou hover). Um
  cartão existe pela borda, não pela sombra.
- **Toque:** `--touch-min` 44 px para qualquer alvo; `--control-height` 48 px para
  campos e botões principais.

## Movimento

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | 120 ms | hover, cor, pressão |
| `--duration-normal` | 240 ms | troca de aba, estados |
| `--duration-slow` | 420 ms | entrada de página, barra de progresso |
| `--ease-standard` | cubic-bezier(0.2, 0, 0, 1) | transições |
| `--ease-emphasized` | cubic-bezier(0.2, 0.7, 0.2, 1) | entradas |

Com `prefers-reduced-motion`, todas as animações e transições caem para ~0 ms e o
spinner vira um anel parado. A estrela flutuante da capa padrão saiu (animação
sem função). Os testes e2e rodam com movimento reduzido.

## Componentes (`src/components/ui`)

Estados mínimos de todo controle: padrão, hover, pressionado (`:active`), foco
visível (anel de 3 px em `--color-focus`), indisponível (contorno tracejado +
opacidade), ocupado (`aria-disabled`, mantém o foco), erro e selecionado
(`aria-pressed`). Todos respeitam `prefers-reduced-motion`,
`prefers-contrast: more` (texto secundário e contornos mais escuros) e
`forced-colors` (`ButtonText`, `GrayText`, `Highlight`).

| Componente | Anatomia | Variantes e tamanhos | Tokens | Responsivo | Acessibilidade |
|---|---|---|---|---|---|
| `Button` | `<button>` com rótulo | `primary` (uma por contexto), `secondary`, `ghost`, `danger`, `link` (só dentro de frase); `md` 48 px, `sm` 44 px | `--radius-control`, `--control-height-*`, `--space-control-x` | quebra linha; em `.card-actions` ocupa a largura quando o card é estreito | `busy` = `aria-disabled` e ignora cliques sem soltar o foco (A8); `disabled` só quando a ação não existe; destrutivas pedem confirmação |
| `Button variant="icon"` | `<button>` quadrado com ícone decorativo | 44 px | `--radius-control` | — | `aria-label` obrigatório no tipo; ícone com `aria-hidden` |
| `BackLink` | `<a>` com seta | — | `--radius-control`, `--touch-min` | — | alvo de 44 px; seta fora do nome acessível (A4) |
| Card (`.card` + `.card-stack`) | `card-header` (selos, título, descrição), conteúdo, área interativa, `card-actions` abaixo do divisor; detalhes em `CARDS.md` | `.guest-card` é contêiner de consulta; `.product-listed` para item já incluído | `--card-radius`, `--card-padding`, `--card-gap`, `--card-border`, `--card-surface`, `--action-gap`, `--divider-color` | abaixo de 22 rem as ações do card de convidado empilham; acima ficam em linha, perigo à direita | título do card como `h3` (ou `h4` sob um grupo); ações com nome completo (o contexto vai em `.sr-only`); sem caixa colorida dentro |
| `StatusBadge` | selo pill com ícone + texto | `brand`, `neutral`, `success`, `warning`, `danger` | `--radius-pill` | quebra linha | ícone decorativo; a cor nunca é a única pista |
| `Field` (input, select, textarea) | rótulo, controle, dica, erro | — | `--radius-field`, `--control-height-md`, `--color-border` | largura total | `htmlFor`, `aria-describedby` (dica e erro) e `aria-invalid`; somente leitura com contorno tracejado |
| `Tabs` | `nav` rotulada com botões | — | `--radius-control` | quebra linha | `aria-pressed`; troca de conteúdo sem mover o foco |
| `Progress` | trilho + barra | rosa-antigo → vinho; completa fica vinho | `--radius-control` | largura do contêiner | sem `label`, decorativa (o número está escrito ao lado); com `label`, `progressbar` com `aria-label`, `aria-valuenow/max` e `aria-valuetext` |
| `Availability` | texto “N de M disponíveis” + `Progress` | — | `.availability` | largura do contêiner | texto antes da barra; a barra recebe o nome “N de M {unidade} reservados” |
| `QuantityField` | rótulo + stepper `− \| valor \| +` | `label` (padrão “Quantidade”), `context` só para leitor de tela, `min`/`max` | `--control-radius`, `--control-height-md`, `--color-border` | não passa da largura do card | grupo rotulado; `−`/`+` com nome (“Diminuir pacotes”); nos limites, `aria-disabled` mantém o foco; campo vazio volta ao mínimo |
| `Section` | `section` + título + descrição | `level` 2 ou 3 | `--text-h2` | — | `aria-labelledby` |
| `Skeleton` | bloco | largura e altura | `--radius-control` | — | decorativo; o anúncio fica com o `LoadingState` |
| `Pagination` | `nav` + anterior/próxima + “Página X de Y” | recebe `pageSize` | botões `secondary` | quebra linha | `nav` rotulada; botões indisponíveis nas pontas |
| `ActionMenu` (G4) | botão “…” + menu | — | `--radius-surface` | — | a definir com Radix: setas, Esc, foco de volta ao botão |
| `ConfirmDialog` (G5.1) | `<dialog>` nativo: título, descrição opcional, Cancelar + ação | destrutivo e comum | `--radius-panel` | largura mínima entre o conteúdo e a tela | foco preso e Esc vêm do próprio `<dialog>` (`showModal`); clique fora (`::backdrop`) cancela; foco guardado antes de abrir e devolvido ao fechar (feito à mão, sem garantia do navegador) |

Estados (`src/components/States.tsx`): `LoadingState`, `ErrorState`,
`EmptyState`, `SuccessMessage` e `RefreshStatus`, agora com `Button`. Aviso sem
componente próprio: classe `state state-warning`.

Consultas (`src/lib/query.ts`, `src/lib/useLastError.ts`): `failedLast` e
`useLastError` mantêm a tela de erro (e o foco no botão) durante a nova tentativa,
e evitam que uma falha de atualização apague uma tela que já tinha dados.

Ficam para as fases seguintes: `ActionMenu` (G5.2) e componentes React para os
cards (G4).

## Automação de acessibilidade

- axe em todos os e2e (telas do convidado, do organizador e `/amostras`), com
  movimento reduzido e medição de rolagem horizontal;
- testes de foco, teclado, cores forçadas e container query no card de
  convidado;
- `test:browser:local` com axe a 320 px e texto a 200% nas áreas do convidado;
- `eslint-plugin-jsx-a11y`: **bloqueado** (sem versão para ESLint 10);
- teste manual por teclado e leitor de tela nas jornadas críticas continua
  obrigatório antes do ensaio (G5).

## Tema bebê aprovado em 01/10/2026

G1: paleta aprovada pelo titular, com ajustes de progresso, bordas e fontes.
G2: implementação só de front/estilos/documentação. G3: check, e2e e revisão
visual em celular. G4: titular revisa diff antes de qualquer commit/push.

### Tokens e contraste

Medição: luminância relativa sRGB da WCAG 2.x, `(Lmaior + 0,05) / (Lmenor + 0,05)`.
Valores opacos, antes de qualquer transparência decorativa.

| Primeiro plano / fundo | Razão | Uso |
|---|---:|---|
| brand / cream | 7,07:1 | títulos, foco e links |
| brand / blush | 4,83:1 | texto normal permitido |
| brand / brand-soft | 6,11:1 | texto normal permitido |
| branco / brand | 7,45:1 | botão principal |
| ink / cream | 14,62:1 | corpo |
| muted / cream | 5,67:1 | texto secundário |
| muted / brand-soft | 4,90:1 | texto secundário no painel suave |
| rose / cream | 3,24:1 | barra; nunca texto normal |
| champagne / cream | 1,74:1 | só decoração, nunca informação |
| line / cream | 1,70:1 | borda decorativa de card; não contorno de controle |
| line-strong / cream | 3,25:1 | trilho de progresso e controles |
| line-strong / branco | 3,43:1 | campos |
| line-strong / surface-soft | 3,02:1 | controles no fundo suave |

Cards têm fundo branco, borda `line` rosada (#D9B9C5) e sombra; não dependem
só da sombra para delimitar a superfície. Em `prefers-contrast: more`, contornos
semânticos usam `line-strong`. A leitura sob sol real continua sendo verificação
manual; captura de tela não simula reflexo/brilho do aparelho.

Sombras `shadow-sm: 0 2px 8px rgb(142 54 88 / 6%)`,
`shadow-md: 0 8px 24px rgb(142 54 88 / 10%)` e `shadow-dock` vinho.
Cards 20px, painéis 24px; botões/campos preservam seus raios e alvos ≥44px.
Todos os valores novos de cor, raio, dimensão e opacidade vivem em tokens.

Progresso: trilho creme delimitado por `line-strong`, preenchimento rose → brand.
A disponibilidade continua escrita e o valor da barra também aparece por extenso
(ex.: “12 de 20 pacotes reservados”). Leitor de tela recebe valor/nome da barra.
Nem o número nem o estado dependem de reconhecer cor; cores forçadas mantêm
contorno e preenchimento do sistema. O estado completo continua identificado
pelos valores e pelos selos/textos existentes.

### Motivos e aplicação

`BabyMotif` usa SVG inline, tokens/currentColor, `aria-hidden`, `focusable=false`
e `pointer-events:none`, com opacidade 0,55. Não contém texto nem informação.

- Nuvem, lua e coração: cabeçalho do convite, painel da home e lateral do login.
- Estrelas: divisores de seção do convite e mensagens de sucesso.
- Ursinho de traço: estados vazios; sem alterar rótulos ou anúncios existentes.
- Folhinha: rodapé, sem competir com o link de privacidade.

Não há animação nos motivos; escondidos em cores forçadas. Patrick Hand fica
restrita à saudação. O nome real do bebê não é fixado em componente algum.
`InvitePreview` reutiliza `GuestEvent`, portanto herda a mesma apresentação.
`/amostras` demonstra paleta, motivos, títulos SOFT, acento e progresso.
`theme-color` acompanha o creme. Favicon e imagem OG existentes foram
inspecionados: já usam vinho/rosé e continuam coerentes, sem nova imagem pesada.
