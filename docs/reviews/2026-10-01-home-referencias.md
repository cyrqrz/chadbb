# Home e rodapé a partir das referências — 01/10/2026

O titular trouxe quatro capturas de um site concorrente do mesmo tema (FAQ com
rodapé, tipos de chá e depoimentos, benefícios, três etapas) para usar como base.
Escopo aprovado: rodapé com links úteis, perguntas frequentes, três etapas
repaginadas e benefícios. Só front; sem mudança de dados.

## Fora do escopo, por decisão ou por princípio

- Redes sociais: o chadbb não tem.
- Tipos de chá: para depois (titular).
- Depoimentos: não há depoimentos reais; não se inventa.
- Vídeo, selos de terceiros e "receba em dinheiro": o chadbb não tem nem
  movimenta dinheiro.

## O que entrou

- **Etapas:** cartões de 17/09 (pedido do titular: peso próprio e elevação no
  hover) com número numa nuvem e seta curva entre eles (só lado a lado). O número
  é decorativo; o título leva "Etapa N:" só para o leitor de tela. Segundo
  convite à ação com outro nome ("Organizar meu chá") para não repetir o nome do
  primeiro.
- **Benefícios:** faixa rosada com seis cartões e ícones de traço, só com o que o
  produto faz hoje. No celular o cartão fica deitado para a faixa não virar uma
  coluna comprida.
- **Perguntas frequentes:** `<details>`/`<summary>` nativos (teclado e leitor de
  tela sem JavaScript). "Quanto custa?" responde "gratuito nesta fase", decisão
  do titular coerente com a Q22. Respostas conferidas com as regras atuais
  (prévia pública, reserva, prazo, retenção de 30 dias).
- **Rodapé:** marca e frase, "Links úteis" (início, como funciona, perguntas
  frequentes, entrar ou seus eventos, política, termos, contato), "Recebeu um
  convite?" e barra vinho com © e "Política de Privacidade" (7,45:1).
  Os links `/#como-funciona` e `/#duvidas` rolam até o título e o focam.
- **Convite:** rodapé compacto, só a barra, com a política em nova aba. O convite
  guarda a sessão só na memória da página; qualquer outro link do rodapé faria o
  convidado perder o convite.

## Testes

- `guest.spec.ts`: perguntas pelo teclado, seis benefícios, 320 px a 200% com
  axe e perguntas abertas, rodapé compacto no convite; testes dos passos
  restritos à seção das etapas e número "1/2/3" decorativo.
- `privacy.spec.ts`: links úteis, barra, sem redes sociais, âncoras da home e
  dos termos.
- Suíte e2e completa: ver o commit.

## Correções após publicar (01/10)

- **Link de privacidade "não fazia nada" no celular:** o roteador não rolava ao
  trocar de página, e a política abria já rolada até o rodapé (parecido com o da
  home). Antes não aparecia porque o link abria em nova aba. Agora o `Layout` leva
  ao topo a cada navegação nova; com âncora, a página rola até a seção; "voltar"
  do navegador mantém a posição. Teste em `privacy.spec.ts` (falhou antes da
  correção).
- **Perguntas frequentes com resposta apagada:** a resposta usava o cinza
  secundário. Agora: resposta na cor do texto (15,41:1), pergunta aberta com
  cabeçalho rosado e divisor (8,07:1), seta num círculo que vira vinho ao abrir.
- **Topo sem rolagem animada:** o `scrollTo(0, 0)` herdava o
  `scroll-behavior: smooth` do CSS; sem "reduzir movimento", a página nova
  aparecia no rodapé e subia animada por ~0,8 s (medido: 2633 → 0 px). Agora o
  salto usa `behavior: 'instant'`. Os e2e rodam com movimento reduzido e não
  pegavam; o teste novo usa `reducedMotion: 'no-preference'` e falhou antes da
  correção.
