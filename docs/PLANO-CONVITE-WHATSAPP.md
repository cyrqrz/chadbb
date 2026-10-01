# Plano — convite com a cara do evento no WhatsApp (01/10/2026)

Pedido do titular: refatorar o visual do convite que chega no WhatsApp, com as
características do evento. Também: a URL do site (home) não pode sair com prévia
de convite — só o convite deve sair assim. **Nada implementado ainda.**

## Restrição que manda em tudo

O WhatsApp monta a prévia só com o HTML que o servidor entrega (não roda JS).
O link do convite é `/convite#token`, e o fragmento (`#…`) **nunca chega ao
servidor** — é o que protege o token. Logo:

- Com o link atual, a prévia não sabe de qual evento é: todo convite sai igual.
- Para ter a cara do evento, o caminho precisa de um identificador **público**
  do evento (ex.: `/c/<id-do-evento>#token`), lido por uma Pages Function.
- Só entra na prévia o que já é público por decisão do titular: **título,
  descrição pública e capa** ("Visível na prévia pública" em Dados do evento).
  Data e endereço são "só para convidados". O **nome do convidado nunca** entra
  na prévia (o servidor não conhece o token; vazaria se o link fosse repassado).

## Requisitos do WhatsApp

- `og:image` 1200×630 (1,91:1), JPEG ou PNG, **até 300 KB** (acima disso a
  imagem não aparece); tags dentro dos primeiros 300 KB do HTML.
- O WhatsApp guarda a prévia em cache por URL: a imagem por evento precisa da
  versão do evento na URL para atualizar quando a capa mudar.
- Fontes: Meta (developers.facebook.com/documentation/business-messaging/whatsapp/link-previews),
  chatarmin.com/en/blog/whats-app-image-size-guide.

## Boas práticas de convite por link (pesquisa)

Hierarquia (nome do evento > data > detalhes; no máximo duas fontes),
personalização dentro do convite (já existe a saudação com o nome), uma ação
principal de resposta em um toque, animação sutil sem pesar (ex.: "abertura" na
primeira tela, respeitando movimento reduzido), testar em vários aparelhos.

## Fases e gates

**Fase 1 — antes do congelamento de 05/10 (só front, baixo risco)**
- **G1 — separar as prévias:** `index.html` com prévia de produto ("Organize seu
  chá de bebê", imagem própria `og-site.png`) e `convite.html` (entrada extra no
  build do Vite) com a prévia de convite. Os dois carregam o mesmo app; o Pages
  entrega `convite.html` em `/convite` (conferir se precisa de linha em
  `_redirects` antes do `/* /index.html 200`). Evidência: testes das `meta` e
  `curl` na URL de preview do PR mostrando cada HTML.
- **G2 — imagem genérica do convite redesenhada:** vinho/creme, motivos do tema,
  "Você recebeu um convite para um chá de bebê", < 300 KB. Evidência: tamanho e
  captura no WhatsApp real.

**Fase 2 — prévia por evento (back + front)**
- **G3 — contrato** em `CONTRATOS-TRANSACIONAIS.md`: leitura pública
  `public_event_preview(event_id)` só de evento **publicado**, só título,
  descrição e capa; novo formato de link `/c/<id>#token`; links antigos seguem
  com a prévia genérica. Evidência: testes de banco (rascunho, encerrado e
  campos privados não saem).
- **G4 — Pages Function `/c/:id`:** HTML com `og:title`, `og:description` e
  `og:image` do evento; o token nunca chega à função. Evidência: `curl` por
  evento e ausência de token em logs.
- **G5 — imagem por evento:** PNG 1200×630 gerado na borda (`@cf-wasm/og` ou
  `workers-og`: HTML/CSS → PNG, sem navegador) com capa, título em Fraunces e
  motivos; cache do Cloudflare; versão do evento na URL; fallback genérico.
  Atenção: resvg em Workers exige WASM pré-compilado; capa pode ter até 5 MB —
  medir o PNG final (< 300 KB). Evidência: tamanho, tempo e WhatsApp real.
- **G6 — primeira tela do convite:** capa em destaque, título, saudação com o
  nome, "abertura" animada opcional. Evidência: e2e, axe, 320 px, movimento
  reduzido.

**Depois de 01/11:** tema por evento (paleta + motivo: ursinhos, nuvens,
flores…) escolhido pelo organizador e aplicado no convite e na imagem.

## Decisões abertas (titular)

1. **Prazo:** os convites da Liz saem até 08/10, depois do congelamento de 05/10.
   A fase 2 mexe em back, Pages Function e formato do link: fica para depois do
   chá da Liz (a Liz recebe a prévia genérica redesenhada da fase 1), ou abre-se
   uma exceção ao congelamento?
2. **Data na prévia:** manter só título/descrição/capa, ou aceitar mostrar o
   **dia** do evento (sem endereço nem horário)? Hoje a data é "só para
   convidados".
