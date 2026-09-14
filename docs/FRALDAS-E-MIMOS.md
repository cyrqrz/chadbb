# Fraldas e mimos do chá

Requisitos recebidos em 2026-09-11 e esclarecidos em 2026-09-14. Implementação
e testes registrados na revisão técnica. Complementa o [plano do MVP](PLANO-EXECUCAO-MVP.md).

## Experiência do convidado

Três áreas claras: **Presença**, **Fraldas** e **Mimos**. O convidado confirma
presença individual/familiar, escolhe o tamanho da fralda que pretende levar e,
se desejar, escolhe mimos. A aba Mimos é opcional e não condiciona a confirmação
de presença nem a escolha de fraldas.

Em Mimos, permitir selecionar mais de um item e informar quantidade inteira
positiva para cada um, inclusive mais de uma unidade do mesmo item. Mostrar um
resumo separado de presença, fraldas e mimos, com ações para revisar ou cancelar
as escolhas. Quantidade de pessoas não multiplica automaticamente os presentes.
As escolhas pertencem ao convite, inclusive quando ele representa uma família.

## Limites de fraldas confirmados

| Tamanho | Limite total de pacotes do evento |
| --- | ---: |
| P | 6 |
| M | 19 |
| G | 19 |
| XG | 6 |
| Total | 50 |

Unidade confirmada pelo solicitante: **pacotes**. Cada unidade reservada
corresponde a um pacote, independentemente de quantas fraldas ele contém.
Não converter esses limites em número de fraldas dentro de pacotes. A soma 50
é capacidade de presentes, não número obrigatório de convites ou confirmações.

Mostrar tamanho, limite, quantidade comprometida e quantidade disponível.
Impedir nova confirmação quando esgotado e atualizar as outras sessões conforme
o contrato de atualização do plano. Cancelamento libera apenas a quantidade do
tamanho correspondente. Se houver troca de tamanho, validar o destino e trocar
na mesma transação; se ele estiver esgotado, preservar a escolha anterior.

O convite pode escolher vários pacotes de fraldas, inclusive em convite familiar,
sempre respeitando o saldo de cada tamanho. Regra registrada a partir da resposta
“varios cotes”, interpretada como “vários pacotes”. Não multiplicar pelo RSVP.
Permitir informar a quantidade desejada por tamanho; o servidor valida o saldo.
Confirmado em 2026-09-14: esses limites são globais por tamanho, para equilibrar
os pacotes do evento; não existe cota comercial adicional por convite.
O teto técnico de 1000 por reserva é proteção de entrada, não rateio entre convidados.

## Lista de mimos recebida

Decisão revisada pelo solicitante: **todos os mimos ficam sem limite de quantidade**,
tanto por convite quanto no total do evento. Os números da lista original são
mantidos abaixo apenas como referência sugerida, sem bloquear escolhas. Esta regra
substitui a interpretação anterior de limites totais para itens numerados.
Quantidades são unidades do item descrito: um kit é uma unidade do kit.

| Mimo | Referência original (não é limite) |
| --- | ---: |
| Toalha com capuz | Não informada |
| Aspirador nasal bebê | 1 |
| Toalha fralda | Não informada |
| Fraldas de boca | Não informada |
| Kit de escova e pente | 1 |
| Cortador de unhas para bebê | 1 |
| Kit de cuidados para banho | Não informada |
| Mamadeira Anti Cólica | 2 |
| Body manga curta | Não informada |
| Body manga longa | Não informada |
| Macacão | Não informada |
| Conjunto pagão | Não informada |
| Luvas e meias | 1 |
| Casaquinho | Não informada |
| Babadores | Não informada |
| Manta | Não informada |
| Cobertor | Não informada |
| Cueiro | Não informada |
| Naninha | Não informada |
| Almofada de amamentação | 1 |
| Ninho redutor | 1 |
| Babá eletrônica | 1 |
| Mordedor | 1 |

O convidado pode informar duas ou mais unidades de qualquer mimo, inclusive
aspirador nasal, mamadeiras e itens originalmente marcados com 1. Outras pessoas
podem escolher o mesmo mimo. Exibir a quantidade já prometida como informação,
sem estado “esgotado” ou saldo disponível para mimos.
Validar inteiro positivo e capacidade numérica suportada, sem impor o antigo teto
genérico de 10 como regra comercial. Proteções técnicas de entrada não representam
cotas de presentes e devem ser documentadas na implementação.

## Separação no banco e no painel

- Classificar itens explicitamente como fralda ou mimo; não inferir categoria pelo
  nome. “Toalha fralda” e “Fraldas de boca” são mimos.
- Para fraldas, validar tamanho permitido e manter um limite independente por
  evento/tamanho. Mimos têm controle próprio, sem debitar P, M, G ou XG.
- Calcular comprometimento por item/categoria, somando quantidades das reservas
  ativas e compras informadas. Não somar número de reservas como quantidade.
- Modelar ausência de limite explicitamente, para todos os mimos; não usar
  zero nem número artificialmente alto para representar estoque sem limite.
  O schema atual exige quantidade positiva: será necessária migration compatível,
  com validação no servidor, contratos de API e interface ajustados em conjunto.
- Manter transações, idempotência, controle de versão e autorização pelo convite.
  Alteração de categoria/tamanho de item com reservas não poderá transferir saldos
  silenciosamente. Ordenar bloqueios de múltiplos itens por identificador estável
  para troca de tamanho, sem inverter a ordem evento → itens → reservas.
- RSVP e presentes são registros separados. Mudança de presença não apagará ou
  multiplicará escolhas silenciosamente; apresentar revisão explícita ao convidado.
- Painel: total de pessoas confirmadas; fraldas comprometidas/disponíveis por
  tamanho; mimos e respectivas quantidades, com quem se comprometeu visível apenas
  ao organizador. Para mimos, mostrar quantidade prometida, sem saldo fictício.

## Testes obrigatórios

| Ação | Resultado esperado |
| --- | --- |
| Reservar 1 pacote M | M reduz de 19 para 18; outros tamanhos não mudam |
| Informar 3 toalhas com capuz | Mimos registra 3; todos os saldos de fraldas permanecem iguais |
| Escolher toalha fralda ou fraldas de boca | Registra quantidade somente no próprio mimo, nunca nos tamanhos de fralda |
| Duas pessoas disputam a último pacote P | Uma confirmação, sem ultrapassar 6 |
| Trocar M por G esgotado | Erro compreensível; escolha M anterior permanece |
| Cancelar mimo ou alterar sua quantidade | Nenhum efeito nos limites de fraldas ou na presença |
| Confirmar família com várias pessoas | Atualiza pessoas; não multiplica presentes automaticamente |
| Reenviar confirmação após timeout | Não duplica quantidade de fraldas nem de mimos |
| Alterar escolha em outra sessão | Painel e abas atualizam pelo contrato de dados |
| Informar 2 aspiradores ou 3 mamadeiras | Aceita apesar dos números da lista original; registra quantidades sem alterar fraldas |
| Outra pessoa escolhe um mimo já escolhido | Aceita e soma quantidades prometidas; não marca mimo como esgotado |

Validar estes cenários no banco e na API reais e a separação visual em celular,
com teclado e leitor de tela. Abas devem ter nomes, estado selecionado e navegação
acessíveis; mudanças de quantidade não devem deslocar o foco ou apagar edição em curso.
