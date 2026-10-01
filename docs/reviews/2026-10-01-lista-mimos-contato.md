# Revisão 01/10 (tarde): lista só de mimos, cards, ícones, contato, exclusão e prévias

Pedidos do titular em 01/10, executados em plano a pedido dele.

## Decisões

- **Fraldas sem lista pronta.** O organizador monta as fraldas do zero, pelo
  catálogo (tamanho e pacotes). Os números sugeridos (6/19/19/6) saíram da tela.
- **Mimos com lista pronta.** Nova RPC `prepare_treat_list` (migration
  `20261001000000`): inclui só os mimos sugeridos que faltam. Escolhida pelo
  titular em vez de várias chamadas pelo front (uma chamada, tudo ou nada).
- **Cards da lista no padrão dos cards de evento.** "Lista do chá", "Fraldas/Mimos
  na lista", "Adicionar mimo próprio" e "Sugestões do catálogo": cabeçalho (título e
  descrição), divisor e atalhos com contorno e ícone. A regra "sem limite" continua
  só com itens na lista e evento aberto.
- **Card de convite no padrão do card de evento:** resposta e selos no topo, o nome
  como título e o tipo do convite como descrição; as ações seguem abaixo do divisor,
  com a disposição já testada (empilhadas no card estreito).
- **Encerrar e excluir no publicado** (item 3 da fila): confirmação no card diz que os
  convites param na hora e que encerrar não tem volta; encerra (`transition_event`) e
  agenda a exclusão com a versão encerrada, com os 10 s de Desfazer (desfazer devolve
  o evento encerrado, e o aviso diz isso). Se encerrar falhar, o card fica e o motivo
  aparece acima da lista.
- **Seleção de vários eventos** (item 4): "Selecionar" troca os atalhos por caixas de
  marcar; a barra mostra quantos, "Marcar todos" e "Excluir selecionados", sempre com
  confirmação (e o aviso de encerrar quando há publicados). Um só aviso e um só
  "Desfazer" para o grupo; no fim do prazo, um pedido por evento, na ordem da tela.
- **Prévias do WhatsApp, fase 1** (item 5): home e demais páginas com prévia de
  produto (`og-site.png`); `/convite` com prévia de convite (`og-convite.png`), por
  `convite.html`. Detalhes e evidência do simulador do Pages em
  [PLANO-CONVITE-WHATSAPP.md](../PLANO-CONVITE-WHATSAPP.md).
- **Ícones nas ações** (decorativos, `aria-hidden`; os nomes acessíveis não mudam):
  editar, excluir, adicionar, reemitir link, revogar, ver como convidado, reabrir
  etapa, enviar.
- **Formulário de contato** na privacidade, pela Edge `contact` (Resend →
  `contato@chadbb.online`, "responder para" no e-mail de quem escreveu). Nada é
  gravado; log só com status. Cota `contact:<ip>` 3/min e `contact-global` 30/min
  (migration `20261001010000`), campo-armadilha e origem permitida. O e-mail direto
  continua como alternativa.

## Evidências

- Banco portátil: 101/101 (teste novo da lista de mimos e da cota, ambos falharam
  antes da migration). pgTAP local: 153/153 com as migrations aplicadas por
  `migration up` (sem reset).
- Unitários: 74/74, com 6 novos do handler de contato (falharam antes do handler).
- Edge `contact` servida localmente com chave falsa: três envios chegam ao provedor
  (recusa → 503), o quarto e o quinto recebem 429, origem estranha recebe 403; o log
  não tem conteúdo nem e-mail.
- Auditoria com axe (WCAG 2.2 AA + boas práticas) em home, privacidade, entrar,
  eventos, painel, convites, presentes e dados, a 390 px: sem violações, nenhum
  controle abaixo de 44 px, nenhum controle sem nome.
- E2E completo nas mudanças até o card de convite: 562 aprovados (1 falha por falta de
  memória da máquina, aprovada ao repetir). Exclusão em lote e encerrar: 36/36 nos
  testes de eventos; prévias: 141/141 em `guest.spec.ts`. E2E completo final (tudo da fila): 571 aprovados e 3 ignorados; as 2
  falhas eram o teste dos selos do card de convite (o tipo virou descrição), ajustado
  e aprovado ao repetir (8/8).

## Gates pendentes (titular)

1. Revisar os diffs e as capturas; commit e push só depois.
2. `db push` no `chadbb-cha` das duas migrations (dry-run antes), **antes** do merge:
   o front publicado chama `prepare_treat_list`.
3. `functions deploy contact` no `chadbb-cha`. Usa `RSVP_RESEND_API_KEY` e
   `RSVP_EMAIL_FROM` já configurados; sem segredo novo, salvo se o titular preferir
   chave própria (`CONTACT_RESEND_API_KEY`).
4. Depois do deploy, um envio de teste pelo titular, conferindo a chegada pelo
   Email Routing (e o lixo eletrônico).
5. Conferir no preview do PR que `/convite` sai com a prévia de convite e a home com a
   de produto; depois, um link real no WhatsApp.
