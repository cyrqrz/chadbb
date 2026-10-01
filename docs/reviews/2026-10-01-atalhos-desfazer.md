# Atalhos nos cards de evento e desfazer exclusão — 01/10/2026

Pedido do titular: atalhos de editar e excluir nos cards de "Seus eventos" e um
"Desfazer" para exclusão por engano. Só front; sem mudança de RPC, Edge ou
migration (o contrato do `delete-event` segue igual).

## Decisões do titular

- **Desfazer agora, só no front:** janela de 10 s (`UNDO_MS`). O card some na
  hora; o pedido ao `delete-event` só sai no fim do prazo. Desfazer no prazo não
  chega ao servidor. A lixeira de 7 dias (E1, T9) continua planejada; quando
  existir, o mesmo aviso passa a restaurar da lixeira.
- **Confirmação só para encerrado:** rascunho exclui direto (ainda sem
  convidados); encerrado confirma no card ("Sim, excluir"), porque apaga
  respostas e reservas.

## Comportamento

- Atalhos abaixo do divisor, fora do link do card: "Editar dados" em rascunho e
  publicado (encerrado não edita); "Excluir" em rascunho e encerrado (o servidor
  recusa publicado). O card publicado deixou de ser um link único e passou à
  mesma anatomia dos outros.
- Aviso com o foco: "Evento “X” excluído." + "Desfazer" + contagem visual.
  A contagem pausa com o ponteiro sobre o aviso ou o foco no botão (WCAG
  2.2.1) e não é anunciada a cada segundo.
- Desfazer devolve o card e o foco ao link dele.
- Fim do prazo: sucesso mantém o aviso; `EVENT_NOT_FOUND` diz "já tinha sido
  excluído em outra aba"; outra recusa devolve o card com alerta explicando.
- Segunda exclusão no prazo: a primeira segue na hora para o servidor.
- Sair da tela pela navegação envia na hora. **Fechar a aba no prazo não
  exclui** (o lado seguro, escolhido pelo titular).
- Clique duplo: depois de excluir, a lista ignora cliques por 600 ms e o
  "Desfazer" ignora clique de ponteiro imediato. Sem isso, o segundo clique
  cairia no card que sobe para o lugar (excluindo ou abrindo outro evento).

## Validação

- `npm run check`: lint, tipos, 68 testes e build.
- `panel.spec.ts` "eventos: excluir evento": 13 cenários × desktop/mobile,
  26/26, com relógio controlado (`page.clock`): atalhos por estado, desfazer
  sem chamada ao servidor, pausa com foco, envio no prazo com a versão, saída da
  tela, recusa, outra aba, paginação, clique duplo, 320 px a 200% e axe.
- Suíte e2e completa: ver o commit.
