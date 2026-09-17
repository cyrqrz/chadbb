# Plano visual adaptado ao chadbb

Versão do `plano-original.md` ajustada ao nosso contexto: prazo do chá, divisão
Claude/Codex, regras do `AGENTS.md` e o que já existe na branch `claude/front`.
A direção continua a mesma: **organizar deve ser simples; participar deve ser
memorável.**

Data: 2026-09-16. Responsável: Claude (front). Aprovação: usuário, gate a gate.

## 1. O que muda em relação ao plano original

| Plano original | No chadbb | Motivo |
|---|---|---|
| 9 fases sem prazo | 6 gates até o ensaio (02–04/10), depois congelamento | O convite é enviado no início de outubro; a confirmação de presença vai até 18/10; o chá é em 01/11 |
| Sistema de temas (Botânico, Boho…) | Só a base preparada (`[data-theme]` em variáveis CSS); um tema, “Minimal”, no MVP | Tema por evento exige coluna e contrato novos no banco (Codex); fica para depois do chá |
| Botão “Compartilhar” no cabeçalho do evento | Trocado por “Criar convite” | Não existe página pública do evento: cada convidado tem link próprio, e o token só aparece na emissão |
| “Mensagem dos pais” | Usa a descrição pública que já existe | Sem campo novo no banco |
| “72% da lista de fraldas”, “18 de 42 pacotes” | Só com total vindo do servidor | Regra 6 do `AGENTS.md`: o front não calcula agregados; pedido ao Codex (seção 7) |
| “faltam 32 dias” | Pode ser calculado no front, só para exibição, no fuso de Brasília | Não é regra de negócio nem prazo de retenção; documentado no código |
| Onboarding, login social | Depois do MVP | Login fica só pelo link por e-mail (decisão do usuário); social depende do Auth |
| Fontes Manrope/Inter/Geist + Fraunces | Decisão no G2 (seção 4) | A CSP só aceita arquivos do próprio site: toda fonte vem por `@fontsource` e pesa no carregamento |
| Biblioteca de animação | Só CSS | Evitar dependência grande; tudo desligável com `prefers-reduced-motion` |
| Revisão independente | Usuário revisa pela página de antes/depois; Codex revisa o PR quando possível | Os agentes não se veem em tempo real; o pedido de revisão vai no quadro |

## 2. Baseline (G0)

O trabalho ainda não commitado em `claude/front` vira o baseline, como pede o
plano original. Como o original proíbe “redesign em um único commit”, ele entra
em **três commits** num PR:

1. Estados das telas e painel do organizador (T-F1, T-F2) + testes.
2. Login em duas colunas.
3. Base visual inicial (fonte Figtree, variáveis, abas, catálogo com “Já na
   lista”, evento encerrado) + testes.

Achados do audit que o baseline ainda tem e que o G2 corrige:

- borda dos campos `#cdb8c1` tem contraste 1,87:1 com o branco; WCAG 1.4.11
  pede 3:1 para contorno de controle;
- placeholder `#8c7780` tem 4,15:1 (abaixo de 4,5:1);
- a estrela flutuante da capa padrão anima sem função (o plano pede evitar);
- animações entraram antes da foundation (o plano pede o contrário): ficam, mas
  passam a usar os tokens de motion no G2;
- 16 usos de `card` e 31 de `text-stone-600` espalhados; o G2 troca por tokens.

**Gate G0:** usuário aprova o diff e as capturas; commit, PR para `main`.
Evidências: `npm run check`, `npm run test:e2e`, página de antes/depois.

## 3. Fases e gates

| Gate | Fase(s) do original | Entrega | Janela |
|---|---|---|---|
| G0 | — | Baseline em 3 commits, PR | 16–17/09 |
| G1 | 1 · Audit | `docs/design/audit.md` (páginas, componentes, estados, cores e espaçamentos fixos, contraste, pontos de toque) | 17/09 |
| G2 | 2 · Foundation (+ 7 · Login, só acabamento) | Tokens, fontes, componentes base e `docs/design/foundation.md`; página de amostras | 18–20/09 |
| G2.1 | — | Forma e hierarquia de ações (`docs/design/G2.1-FORMA-E-ACOES.md`), no mesmo PR do G2 | 16–17/09 |
| G3 | 3 · Convite | Nova página do convidado (hero editorial, presença, fraldas, mimos, local) | 21–25/09 |
| G4 | 4 · Shell + 5 · Painel + 6 · Lista | Cabeçalho do evento, resumo, fraldas como progresso, mimos, lista com menos caixas | 26–30/09 |
| G5 | 8 · Estados + 9 · QA | Skeleton, offline, somente leitura; QA visual, funcional, acessibilidade e desempenho | 01/10 |
| — | Congelamento | Depois do ensaio, só correções até 01/11 | a partir de 05/10 |
| Depois | Temas, onboarding, login social, prévia por evento | Backlog pós-evento | após 01/11 |

Cada gate = um PR (ou um commit por fase dentro dele), com diff revisável e
capturas de antes/depois em 320, 390 e 1366 px, sempre com dados fictícios.

O G3 vem antes do painel porque o convidado é quem recebe o link primeiro, e
porque a página pública define a identidade usada no resto.

## 4. Foundation (G2)

### Cores

A paleta do original entra com três correções de contraste:

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| canvas | `#FCF9F7` | fundo | — |
| surface / surface-soft | `#FFFFFF` / `#F8EEF1` | superfícies | — |
| text | `#292326` | texto | 14,7:1 |
| muted | `#746B70` | texto secundário | 4,9:1 no canvas, 4,5:1 no surface-soft |
| brand / brand-hover | `#8E3658` / `#742845` | ação principal, marca | 7,5:1 com branco |
| border | `#E8DEE2` | só divisórias decorativas | — |
| **border-strong** | `#948790` | contorno de campos e botões secundários | 3,4:1 (original não tinha) |
| success (fill) | `#66806A` | barras e ícones | 3,9:1 (não usar em texto) |
| **success-text** | `#4E6852` | texto de sucesso | 5,5–5,9:1 (o `#66806A` do original dá 4,1:1) |
| **warning** | `#8A5A12` sobre `#FBF3E4` | avisos | 5,4:1 (original não tinha) |
| danger | `#A23B43` sobre `#FBEDEE` | erros | 5,7:1 (o `#B8474E` dá 4,6:1, no limite) |
| focus | `#8E3658`, anel de 3 px | foco | — |

O rosa fica restrito à marca e a detalhes; o fundo passa a ser off-white quente.

### Tipografia

Proposta para aprovar no G2, pesando identidade e peso de download:

- **Interface:** Manrope Variable (`@fontsource-variable/manrope`), substituindo a
  Figtree do baseline. Alternativa: manter a Figtree (20 KB, já instalada).
- **Editorial:** Fraunces Variable, só no nome do evento, no hero do convite e em
  títulos especiais. Nunca no painel.
- Só o subconjunto latino; `font-display: swap`; medir o peso no build (meta:
  fontes somadas abaixo de 120 KB).

Escala: display, h1, h2, h3, body, body-sm, label, caption. Espaçamento
4/8/12/16/24/32/48/64. Raios `sm`, `md`, `lg`, `xl`, `full`. Duas sombras no
máximo. Motion: `--duration-fast` 120 ms, `--duration-normal` 240 ms,
`--ease-standard`, `--ease-emphasized`.

### Componentes

Em `src/components/ui/`, extraídos das telas atuais sem mudar comportamento:
`Button`, `Field`, `Tabs` (pílula com indicador animado), `StatusBadge`
(ícone + texto, nunca só cor), `Progress`, `Alert` (sucesso, aviso, erro),
`EmptyState`, `Skeleton`, `Section` (título + descrição, sem caixa).
`States.tsx` passa a usar esses componentes.

**Gate G2:** página de amostras publicada (claro, 320/1366 px, foco,
desabilitado, somente leitura, movimento reduzido); axe sem violações;
`npm run check`.

## 5. Convite (G3)

Estrutura, reaproveitando os campos existentes do evento:

1. Hero: nome do evento (Fraunces), frase do convite (“{nome}, este convite é
   para você”), capa (`cover_path`) ou arte padrão sem clichês, data e hora de
   Brasília, local; botão “Confirmar presença” que leva à seção de presença.
2. Mensagem: descrição pública.
3. Presença.
4. Presentes: abas Fraldas | Mimos, com progresso por tamanho.
5. Local e instruções.

Microinterações com função: confirmação “✓ Presente reservado”, “✓ Tamanho M
completo” quando o saldo chega a zero, barra animada, número que muda suave.
Avisos ao leitor de tela só no resultado da ação, nunca a cada consulta de 5 s.

Preservar todos os textos e estados testados em `tests/browser` e `tests/e2e`.

**Gate G3:** jornada completa no celular (320 e 390 px, texto a 200%) e no
computador; axe; e2e; se o Supabase local estiver no ar, `test:browser:local`.

## 6. Painel e lista (G4)

- Cabeçalho do evento: nome, data, “faltam N dias”, status e ação “Criar
  convite”.
- Resumo com três números: pessoas confirmadas, convites respondidos (“4 de 5”)
  e progresso de fraldas (só com total do servidor; sem ele, o terceiro número
  não aparece).
- Fraldas como lista de progresso (tamanho, barra, “6 / 6 ✓ completo”), sem um
  cartão por tamanho.
- Convites: nomes em destaque, status com ícone e texto, ações secundárias em
  menu ou link.
- Lista de presentes: resumo no topo, menos caixas, catálogo como lista.

**Gate G4:** capturas antes/depois, axe nas telas do organizador (T-F3), teclado
e foco, e2e.

## 7. Dependências do back (pedidos ao Codex)

Registrados em `docs/TAREFAS-AGENTES.md`:

- já pedidos: `summary` do painel, `available` por item, `id` nas reservas;
- novo: no `summary`, o total de pacotes de fralda
  (`diapers: { committed, limit }`) para o progresso geral;
- depois do chá: campo de tema por evento; página pública do evento, se o
  produto quiser “Compartilhar”.

Nenhuma fase visual depende desses pedidos para começar; sem o dado, a
informação simplesmente não aparece.

## 8. Relação com as tarefas do quadro

| Tarefa | Onde entra |
|---|---|
| T-F3 · Acessibilidade | Gates de todos os passos; axe do organizador no G4; 320 px + 200% no G3 e G4 |
| T-F4 · Contrato de atualização | G5 (estado offline, “salvo” × “painel ainda não atualizado”) |
| T-F5 · Prévia no WhatsApp | G3 (meta tags e imagem estática em `public/`, alinhada à nova identidade) |
| T-F6 · Testes | Todos os gates |

## 9. Gates de reprovação

Os do plano original, mais estes, específicos do projeto:

- qualquer mudança em `supabase/`, `functions/` ou contrato sem pedido no quadro;
- cálculo de agregado ou prazo de negócio no front;
- nome ou dado real em captura, teste ou texto fixo da interface;
- fonte ou script de fora do próprio site (quebra a CSP);
- texto testado alterado sem atualizar `tests/browser` e `tests/e2e`;
- mudança visual grande depois do congelamento (05/10).
