# Adiantamento da parte dos agentes — 23/09/2026

Pedido do titular: deixar pendente só o que depende dele. Gates G1–G5.

## G1 — `gift-list.spec.ts:142` no `mobile`

Sem reprodução em 123 execuções sob carga (`--workers=8`): 60 do teste de
largura e 63 dos arquivos `gift-list*.spec.ts`. A evidência da falha original
se perdeu; sem ela, o teste não foi alterado. Fica em observação no quadro.

## G2 — Acessibilidade por teclado

Auditoria de ordem de tabulação e indicador de foco em `/eventos`, painel,
convites, presentes, dados do evento e convite do convidado, em desktop e
celular: todo elemento focável tem indicador visível (contorno, sombra ou o
contorno do `.stepper`) e nenhum fica atrás da barra de etapas. O “Pular para
o conteúdo” apareceu no topo em 60/60 carregamentos. Nenhuma barreira.

Testes permanentes só com teclado, com o helper `tests/e2e/keyboard.ts`
(avança com Tab até o alvo e exige foco visível na tela):

- convidado: resposta com número de pessoas, fralda com quantidade, reserva,
  “Já comprei”, cancelamento e mimo;
- organizador: criar, preencher, salvar, publicar e concluir etapa.

60/60 sob carga. Mutação (`tabIndex={-1}` no “Escolher presente”) reprovada.

## G3 — Instruções e roteiro do ensaio

`ENTREGA-E-SUPORTE.md`: instruções do organizador reescritas na ordem de uso,
com os nomes reais dos botões (login por código de 8 dígitos, link do convite
que só aparece na emissão, “Reemitir link”, prazo 18/10 nas instruções).
O ensaio com a família virou roteiro com caixas de marcar.

## G4 — Ensaio no ambiente do evento (parcial)

Já cobertos antes: concorrência e atualização (T-B5), fluxo do convidado,
revogação e acesso cruzado (smoke T-B4).

Feito agora, só leitura em `https://chadbb.pages.dev`: início, entrar, convite
sem código, convite incompleto e 404, em desktop, celular e 320 px. Axe sem
violações; sem estouro de largura, inclusive com texto a 200%; indicador de
foco em todos os elementos. O CSP de produção bloqueia estilo inline
(`style-src 'self'`), o que foi preciso contornar só no navegador de teste.

Falta, e exige escrita no `chadbb-cha` (regra 1): convite e painel publicados
com dados fictícios. Aguardando decisão do titular.

## G5 — Restauração com dados reais

Roteiro de seis passos em `ENTREGA-E-SUPORTE.md` (“Roteiro da restauração com
dados reais”), com os comandos de download do R2 e de `test:recovery:archive`.
Lembrete: o laço de cópia do Storage ainda não rodou com nenhum objeto; a
prova com a capa real é o que fecha a T-B6.
