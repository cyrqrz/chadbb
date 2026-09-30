# Decisões de produto — 30/09/2026

Entrevista `/grill-produto` com o titular (Claude). Fatos levantados em
`HANDOFF-CLAUDE-2026-09-24.md`, `HANDOFF-CLAUDE-2026-09-30.md`,
`ENTREGA-E-SUPORTE.md`, `PROXIMOS-PASSOS-M6.md`, `RSVP-LEMBRETES.md` e no código.
Este documento decide e registra; não autoriza escrita remota, commit ou deploy.

## Produto

- **Escopo (Q1):** produto de nicho para chás de bebê; a Liz é a primeira
  cliente real. Outros tipos de evento depois.
- **Organizador (Q2):** um administrador por evento. Terceiros (ex.: a mãe)
  acompanham pelo resumo copiado; sem co-organizador nem link de leitura no MVP.
- **Quem cria evento até 01/11 (Q8):** só famílias convidadas pelo titular.
  Cadastro público fechado em produção; reabre depois do evento.
- **Termos e privacidade (Q9):** antes do envio dos convites da Liz: página
  `/privacidade`, aviso no convite e termos na criação do evento.
- **Catálogo (Q10):** curado pelo titular, via migration. Sem painel admin
  enquanto o catálogo mudar menos de uma vez por mês.
- **Custos (Q21):** planos gratuitos até haver família pagante ou limite que
  atrapalhe um evento. Após 01/11, lembrete a cada 45 dias para manter o
  repositório ativo (workflows agendados) e conferir o backup.
- **Cobrança (Q22):** decidida após 01/11; grupo fechado usa de graça e o
  titular anota o que cada família valorizou.

## Prazo de confirmação (Q4, Q13–Q20)

Substitui as menções a 18/10. Nenhuma data fica fixa em código ou documento.

- O organizador escolhe **uma data, "Confirme até"**: 1, 3, 7, 10 ou 14 dias
  antes do evento; padrão 10. O convite exibe a data vinda do servidor.
- O Talvez fecha nessa data; quem está em Talvez recebe o lembrete e tem mais
  3 dias. Com prazo a menos de 3 dias do evento, o Talvez continua **sem
  lembrete e sem pedir e-mail**, vira "Não" no prazo, e o convite avisa isso.
- Depois do prazo, **trava só a resposta de presença**. Presentes seguem
  liberados até o evento. Quem recebeu lembrete responde nos 3 dias dele.
- Convidado atrasado: o organizador **adia o prazo** (permitido até o início
  do evento), o que reabre as respostas para todos. Sem edição de resposta
  pelo organizador no MVP. Convite travado: "O prazo terminou. Fale com
  [organizador] se ainda quiser responder."
- Sem resposta no prazo continua "Sem resposta"; o painel destaca
  "Não responderam no prazo: N".
- Lembretes já enviados mantêm o `confirmation_due_at` original.
- A Liz fica no padrão (10 dias → 22/10). Com a trava, as respostas dela
  passam a fechar em 22/10; hoje nada fecha sozinho.

## Resumo (Q11, Q12, Q23)

- Botão "Copiar resumo" no painel: texto para WhatsApp, com a hora da
  consulta, montado com dados do servidor. Números e nomes de quem vem e de
  quem não vem. Presentes por pessoa só como opção marcada na hora.
- Em 02/11: copiar o resumo com presentes e encerrar o evento da Liz. Os
  dados pessoais são excluídos 30 dias depois, conforme a política vigente.

## Operação (Q5–Q7)

- Cópia cifrada de `~/.config/chadbb/` em um segundo local do titular, com a
  frase-senha separada da chave privada de backup.
- Log detalhado no workflow de backup (sem expor segredos) e reinício da
  contagem de 7 dias seguidos, após a falha de 27/09.
- No ensaio, um familiar responde Talvez com o próprio e-mail. Em 22/10 o
  titular confere o painel e pergunta se o lembrete chegou.

## Tarefas

| Quando | Tarefa | Gate |
|---|---|---|
| até 02/10 | T1 Cópia cifrada dos segredos (titular; Claude escreve o passo a passo) | — |
| até 02/10 | T2 Log detalhado no backup e contagem de 7 dias | commit/push |
| até 02/10 | T3 Fechar o cadastro público em produção; titular cria as contas convidadas | configuração atual mostrada antes; escrita remota |
| até 04/10 | T4 `/privacidade`, aviso no convite e termos do organizador | revisão do texto pelo titular |
| até 04/10 | T5 Convite exibe "Confirme até dd/mm" vindo do servidor | commit/PR |
| até 04/10 | T6 Cadastro real da Liz (titular) e remoção de 18/10 de `AGENTS.md` e `ENTREGA-E-SUPORTE.md` | — |
| 02–04/10 | T7 Ensaio familiar (um Talvez com e-mail real) e leitor de tela | — |
| **até 08/10** | **Envio dos convites da Liz** (Q24) | — |
| após o envio | T8 Restauração com dados reais e medição do RTO (T-B6) | dry-run e aprovação |
| 06–15/10 | T9 Prazo configurável, trava, Talvez sem lembrete em prazo curto, destaque no painel | contrato → testes RED → migration com dry-run → banco antes do front; revisão independente |
| 16–20/10 | T10 "Copiar resumo" com opção de presentes por pessoa | commit/PR |
| 22–25/10 | T11 Acompanhar o primeiro lembrete real | — |
| 02/11 | T12 Copiar resumo com presentes e encerrar o evento da Liz | irreversível: confirmação do titular |
| após 01/11 | T13 Reabrir cadastro, grupo fechado, cobrança, lembrete de 45 dias | — |
