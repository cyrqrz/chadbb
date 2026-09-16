# Plano de Refatoração Visual — chadbb

## 1. Objetivo

Refatorar a identidade visual do **chadbb** sem reabrir fluxos funcionais que já foram corrigidos.

O estado atual do produto já melhorou bastante em UX: hierarquia de informação, estados vazios, mensagens de erro, lista de presentes, painel do organizador e fluxo do convidado estão mais claros. A próxima etapa deve focar em **Design Engineering**: criar uma identidade visual mais profissional, memorável, clean, acessível e coerente.

A meta é fazer o produto deixar de parecer apenas um sistema funcional e passar a parecer um **produto de eventos com identidade própria**.

---

## 2. Princípio central

O chadbb deve ter duas faces complementares:

### Experiência do convidado
**Celebração, emoção, personalidade e encantamento.**

O convidado não deve sentir que está usando um sistema administrativo. A experiência pública deve parecer um convite digital moderno e bem produzido.

### Experiência do organizador
**Calma, clareza, controle e eficiência.**

O organizador precisa entender rapidamente:

- quem vai;
- quem ainda não respondeu;
- o que já foi escolhido;
- o que ainda falta;
- quais ações precisam de atenção.

> Direção central: **organizar deve ser simples; participar deve ser memorável.**

---

## 3. Baseline que deve ser preservado

O estado atual do produto passa a ser o **baseline funcional**.

Não refazer fluxos, regras ou textos sem uma razão clara.

Preservar especialmente:

- login por link enviado por e-mail;
- estrutura atual do painel do organizador;
- separação entre pessoas confirmadas e convites respondidos;
- resumo de respostas;
- fraldas por tamanho;
- seção de mimos;
- lista pronta do chá;
- opção de completar apenas itens faltantes;
- estados vazios com orientação de próximo passo;
- estados de erro com explicação e ação;
- estados de evento encerrado;
- escolha/reserva de presentes;
- distinção entre “reservar” e “já comprei”;
- feedbacks específicos ao convidado;
- comportamento mobile atual;
- regras de negócio já implementadas.

A refatoração deve mudar principalmente a **camada visual e de interação**, não a lógica do produto.

---

## 4. Referências visuais

Usar as referências como **princípios**, não como templates para copiar.

### Luma
Usar como referência para:

- hierarquia visual;
- composição de páginas de evento;
- uso de capa;
- clareza;
- organização das informações;
- equilíbrio entre branding e interface.

### Partiful
Usar como referência para:

- personalidade;
- temas;
- movimento;
- microinterações;
- experiência social;
- sensação de evento vivo.

### Paperless Post
Usar como referência para:

- acabamento premium;
- visual editorial;
- convites;
- tipografia;
- composição emocional;
- sensação de celebração.

### Joy
Usar como referência para:

- domínio de eventos familiares;
- chá de bebê;
- presentes;
- RSVP;
- organização de convidados;
- relação entre evento e lista de presentes.

---

## 5. Direção de identidade

Nome interno sugerido para a direção:

**Warm Editorial**

Características:

- sofisticado sem ser formal;
- afetivo sem ser infantil;
- clean sem ser frio;
- acolhedor;
- atual;
- leve;
- com personalidade.

Evitar:

- visual de SaaS genérico;
- rosa aplicado em toda a interface;
- excesso de cards;
- estética infantil com nuvens, ursinhos ou clichês;
- excesso de sombras;
- excesso de gradientes;
- animações decorativas sem função;
- componentes muito pequenos no mobile.

---

## 6. Paleta inicial

Usar como ponto de partida, não como implementação final obrigatória:

```txt
Canvas       #FCF9F7
Surface      #FFFFFF
Surface Soft #F8EEF1

Brand        #8E3658
Brand Hover  #742845

Text         #292326
Muted        #746B70
Border       #E8DEE2

Success      #66806A
Danger       #B8474E
```

Direção:

- fundo off-white quente;
- branco para superfícies;
- vinho/cherry como cor principal da marca;
- blush apenas como apoio;
- sage discreto para sucesso/progresso;
- cores temáticas opcionais para eventos.

O rosa não deve dominar toda a interface.

---

## 7. Tipografia

Separar tipografia de produto e tipografia emocional.

### Interface
Possíveis referências:

- Manrope;
- Inter;
- Geist.

Usar para:

- formulários;
- navegação;
- tabelas/listas;
- dashboard;
- labels;
- botões;
- dados.

### Momentos editoriais
Possíveis referências:

- Fraunces;
- DM Serif Display.

Usar com moderação em:

- nome do evento;
- hero do convite;
- títulos especiais;
- mensagens emocionais.

Não usar serif em toda a aplicação administrativa.

---

## 8. Design tokens

Antes de refatorar páginas, consolidar tokens.

Definir:

### Cor
- canvas;
- surface;
- surface-subtle;
- text-primary;
- text-secondary;
- text-muted;
- border-default;
- border-strong;
- brand;
- brand-hover;
- success;
- warning;
- danger;
- focus.

### Espaçamento
Criar escala consistente.

Exemplo:

```txt
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
```

### Radius

Definir poucos níveis:

```txt
sm
md
lg
xl
full
```

### Sombra

Poucas sombras e baixa intensidade.

Cards não devem depender de sombra para existir.

### Tipografia

Definir tokens de:

- display;
- heading-1;
- heading-2;
- heading-3;
- body;
- body-small;
- label;
- caption.

### Motion

Definir:

- duration-fast;
- duration-normal;
- easing-standard;
- easing-emphasized.

Sempre respeitar `prefers-reduced-motion`.

---

## 9. Arquitetura visual

### Regra importante

Parar de usar card como solução padrão para tudo.

Usar cards apenas quando houver agrupamento real ou necessidade de destaque.

Preferir também:

- seções abertas;
- divisores;
- superfícies suaves;
- agrupamento por espaçamento;
- hierarquia tipográfica;
- listas estruturadas;
- barras de progresso;
- indicadores.

---

# 10. Experiência do convidado

Essa deve ser a área mais expressiva visualmente.

## Hero do evento

Estrutura sugerida:

```txt
CHÁ DA HELENA

Um dia para celebrar
uma chegada muito especial.

[ capa / foto / ilustração ]

18 de outubro · 15h
Espaço Jardim das Flores

[ Confirmar presença ]
```

Depois:

```txt
Mensagem dos pais

Presença

Presentes
Fraldas | Mimos

Local

Informações adicionais
```

A página pública deve ter mais aparência de convite/editorial do que de dashboard.

---

## 11. Sistema de temas

Preparar a arquitetura visual para temas futuros.

Possibilidades:

- Minimal;
- Botânico;
- Boho;
- Céu;
- Safari;
- Editorial.

Um tema pode alterar:

- fonte display;
- cor de destaque;
- fundo;
- ilustração;
- textura;
- decoração;
- imagem de capa;
- pequenos detalhes visuais.

Não deve alterar:

- acessibilidade;
- estrutura semântica;
- comportamento;
- contraste mínimo;
- tamanho dos controles;
- regras de negócio.

---

# 12. Painel do organizador

A experiência administrativa deve continuar funcional, mas ganhar mais clareza visual.

## Cabeçalho do evento

Exemplo:

```txt
Chá da Helena
18 de outubro · faltam 32 dias

Publicado            Compartilhar
```

## Resumo

Priorizar poucos dados importantes.

Exemplo:

```txt
5
pessoas confirmadas

4 de 5
convites respondidos

72%
lista de fraldas
```

Evitar excesso de métricas.

O dashboard precisa responder rapidamente:

- quem vem;
- quem ainda precisa responder;
- quanto da lista foi preenchido;
- o que falta;
- onde existe alguma ação pendente.

---

# 13. Convites e confirmações

Preservar a lógica atual.

Melhorar visualmente:

- destaque para pessoas confirmadas;
- proporção de convites respondidos;
- respostas separadas;
- status revogado;
- hierarquia de nomes;
- ações secundárias menos dominantes.

Evitar que todos os dados pareçam ter a mesma importância.

---

# 14. Fraldas

Transformar a seção em uma visão de progresso.

Exemplo:

```txt
Fraldas

P     6 / 6      ✓ completo
M     19 / 23
G     12 / 19
XG    0 / 6
```

Usar:

- barra de progresso;
- quantidade;
- status;
- estados completos;
- contraste claro entre disponível, reservado e concluído.

---

# 15. Mimos

Manter a lógica atual.

Melhorar:

- diferenciação entre escolhido e disponível;
- quantidade;
- status;
- leitura rápida;
- expansão progressiva da lista não escolhida.

---

# 16. Lista de presentes

Preservar:

- lista pronta do chá;
- recomendação inicial;
- completar lista;
- itens avulsos;
- Fraldas/Mimos;
- indicação de item já incluído.

Refatorar apresentação.

Possível resumo:

```txt
Lista do chá

18 de 42 pacotes definidos
[ progresso ]

Fraldas
P   6 / 6
M   19 / 23
G   12 / 19
XG  0 / 6
```

Reduzir o efeito de:

**card → card → card → controle → card**

Usar mais hierarquia e menos caixas.

---

# 17. Login

Manter o conceito atual de desktop com duas colunas:

- formulário;
- painel de benefícios.

O painel deve continuar explicando recursos reais:

- confirmação de presença;
- fraldas por tamanho;
- mimos;
- convite via WhatsApp.

Melhorar:

- contraste;
- respiro;
- tipografia;
- iconografia;
- distribuição vertical;
- acabamento dos campos;
- estado de foco;
- botão principal.

No mobile:

- formulário primeiro;
- benefícios depois;
- CTA confortável para toque.

---

# 18. Estados vazios

Todo estado vazio deve responder:

1. O que está vazio?
2. Por que isso importa?
3. Qual é o próximo passo?

Estrutura:

```txt
Título

Explicação curta.

[ ação principal ]
```

Nem todo estado vazio precisa de ilustração.

Evitar mensagens técnicas.

---

# 19. Estados de erro

Padronizar erros como componentes.

Cada erro deve ter:

- título;
- explicação simples;
- ação possível;
- estilo visual consistente;
- foco acessível;
- sem layout shift desnecessário.

Exemplo:

```txt
Não foi possível atualizar

Os dados abaixo são da última consulta.

[ Tentar novamente ]
```

---

# 20. Evento encerrado

Manter clara a diferença entre:

- conteúdo disponível para leitura;
- conteúdo bloqueado para edição.

Evitar aparência de campo desabilitado genérico.

Usar:

- superfície suave;
- label/status;
- borda discreta;
- comunicação textual clara.

Ocultar ações que não fazem sentido após encerramento.

---

# 21. Microinterações

Usar apenas quando ajudam a compreender o sistema.

Boas aplicações:

- botão com feedback de pressão;
- hover sutil;
- focus claro;
- tabs com indicador animado;
- barras de progresso;
- números atualizando suavemente;
- confirmação de reserva;
- conclusão de tamanho;
- expansão de conteúdo;
- entrada de feedback.

Exemplos:

```txt
✓ Presente reservado
```

```txt
✓ Tamanho M completo
```

Evitar:

- animações longas;
- elementos flutuando sem função;
- parallax desnecessário;
- bounce excessivo;
- movimento em todo hover.

---

# 22. Acessibilidade

Acessibilidade deve ser gate da refatoração.

Validar:

- WCAG AA;
- contraste;
- teclado;
- foco visível;
- zoom;
- labels reais;
- mensagens de erro associadas;
- sem depender apenas de cor;
- toque confortável;
- reduced motion;
- leitura por screen reader;
- ordem lógica de foco.

Para mobile, preferir controles principais próximos de **44 px de altura**, mesmo quando o mínimo técnico seja menor.

---

# 23. Responsividade

Validar pelo menos:

- 320 px;
- 375/390 px;
- tablet;
- desktop padrão;
- desktop largo.

Não apenas “caber”.

Avaliar:

- hierarquia;
- respiro;
- tamanho da tipografia;
- densidade;
- ordem do conteúdo;
- sticky elements;
- overflow;
- áreas de toque;
- modais;
- drawers.

---

# 24. Fases de implementação

## Fase 1 — Audit

Antes de alterar código:

- mapear páginas;
- mapear componentes;
- mapear estados;
- identificar tokens atuais;
- identificar duplicações;
- localizar cores hardcoded;
- localizar espaçamentos hardcoded;
- mapear breakpoints;
- mapear animações;
- registrar problemas de acessibilidade;
- identificar componentes compartilhados.

Entrega:

```txt
docs/design/audit.md
```

---

## Fase 2 — Design Foundation

Criar ou consolidar:

- tokens;
- tipografia;
- cores;
- spacing;
- radius;
- shadows;
- focus;
- motion;
- buttons;
- inputs;
- pills;
- cards;
- alert;
- empty state;
- progress;
- status badge.

Entrega sugerida:

```txt
docs/design/foundation.md
```

Não refatorar todas as páginas ainda.

---

## Fase 3 — Convite / experiência pública

Usar essa área para estabelecer a nova identidade emocional.

Prioridade:

1. hero;
2. presença;
3. presentes;
4. fraldas;
5. mimos;
6. mensagens;
7. local;
8. estados de sucesso/erro;
9. mobile.

Essa fase pode servir como referência visual para o resto do produto.

---

## Fase 4 — App Shell do organizador

Refatorar:

- header;
- navegação;
- containers;
- largura;
- background;
- page title;
- section title;
- spacing vertical;
- ações principais;
- breadcrumbs, se existirem.

---

## Fase 5 — Painel do organizador

Refatorar:

- resumo;
- convites;
- presença;
- fraldas;
- mimos;
- convidados;
- estados vazios;
- ações.

Não alterar regras de negócio.

---

## Fase 6 — Lista de presentes

Refatorar:

- resumo;
- recomendação;
- progresso;
- tabs;
- catálogo;
- quantidade;
- estados vazios;
- item já adicionado;
- responsividade.

---

## Fase 7 — Login e onboarding

Aplicar o novo sistema visual.

Preservar fluxo atual.

---

## Fase 8 — Estados globais

Padronizar:

- loading;
- skeleton;
- empty;
- error;
- success;
- offline;
- disabled;
- readonly;
- encerrado.

---

## Fase 9 — QA

Executar revisão independente.

### Visual
- consistência;
- alinhamento;
- tipografia;
- espaçamento;
- densidade;
- hierarquia;
- responsividade.

### Funcional
- regressões;
- formulários;
- RSVP;
- reservas;
- convites;
- estados;
- navegação.

### Acessibilidade
- teclado;
- foco;
- contraste;
- labels;
- screen reader;
- reduced motion;
- zoom.

### Performance
- fontes;
- imagens;
- animações;
- CLS;
- componentes desnecessários;
- assets.

---

# 25. Processo de Design Engineering

Usar ciclo separado de geração e avaliação.

```txt
Referências
    ↓
Princípios
    ↓
Design foundation
    ↓
Implementação
    ↓
Review independente
    ↓
Correções
    ↓
QA
```

O agente que implementa não deve considerar o trabalho automaticamente aprovado.

A revisão deve observar quatro critérios:

### Qualidade do design
- hierarquia;
- equilíbrio;
- spacing;
- tipografia;
- coerência;
- acabamento.

### Originalidade
- identidade própria;
- não parecer clone;
- uso inteligente das referências.

### Técnica
- arquitetura;
- componentes;
- tokens;
- responsividade;
- performance;
- manutenção.

### Funcionalidade
- UX;
- estados;
- acessibilidade;
- ausência de regressões.

---

# 26. Gates de reprovação

Uma entrega não deve ser aprovada quando houver:

- regressão funcional;
- perda de acessibilidade;
- contraste inadequado;
- layout quebrado;
- overflow;
- controles pequenos;
- perda de informação;
- comportamento diferente entre desktop/mobile sem justificativa;
- duplicação desnecessária;
- hardcode excessivo;
- dependência visual de cor;
- animações que ignoram reduced motion.

---

# 27. Restrições para a implementação

Não fazer:

- redesign completo em um único commit;
- alterações de regra de negócio misturadas com styling;
- troca de copy sem necessidade;
- refactor estrutural grande sem caracterização;
- substituir componentes maduros apenas por estética;
- adicionar biblioteca grande sem justificar;
- introduzir animações antes da foundation;
- remover estados existentes;
- otimizar apenas desktop.

Preferir:

- etapas pequenas;
- diffs revisáveis;
- screenshots antes/depois;
- testes;
- feature branches/worktrees;
- commits por etapa;
- validação mobile e desktop.

---

# 28. Resultado esperado

O chadbb deve transmitir:

### Para o organizador
> “Tenho controle de tudo sem esforço.”

### Para o convidado
> “Esse evento foi preparado com carinho.”

A interface final deve parecer:

- profissional;
- contemporânea;
- afetiva;
- organizada;
- confiável;
- leve;
- acessível;
- memorável.

Sem perder a simplicidade do produto.

---

# 29. Norte final

> **Uma ferramenta de organização calma e eficiente para quem cria o chá, e uma experiência bonita, afetiva e memorável para quem é convidado.**

Esse princípio deve orientar todas as decisões visuais da refatoração.
