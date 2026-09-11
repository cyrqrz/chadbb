# Contrato do MVP familiar

Revisado em 2026-09-11. Referência vigente: [plano de entrega](PLANO-EXECUCAO-MVP.md).

## Entrega e responsáveis

A primeira entrega atende ao chá de bebê do irmão do solicitante, com cerca de
50 convidados. O solicitante informou aproximadamente 20 dias de desenvolvimento
e necessidade de entrega até a segunda semana de outubro de 2026. O dia exato de
entrega e a data do evento ainda não foram informados. Planejar versão completa
para ensaio até 1º de outubro e usar a margem seguinte para validação e correções.

Engenharia: Codex e solicitante. Conteúdo e contas: solicitante. Aceite de uso:
irmão como organizador, com ensaio de pelo menos um convidado. O responsável pelo
suporte no dia do evento será definido antes da entrega.

Manter React, Vite, TypeScript, Tailwind, Router, TanStack Query, Supabase e
Cloudflare Pages. O núcleo existente será aproveitado. Monetização, afiliados,
analytics comercial, outros tipos de eventos e temas configuráveis ficam para
uma fase posterior. A primeira entrega não depende de aprovação de parceiros.

## Jornada mínima

| Pessoa | O que precisa conseguir fazer |
| --- | --- |
| Organizador | Entrar, editar/publicar o chá, montar lista, emitir/copiar/revogar convites e acompanhar respostas e presentes |
| Convidado | Abrir convite no celular sem criar conta, ver detalhes, responder presença, reservar/cancelar presente e opcionalmente informar compra |
| Organizador após encerramento | Consultar os resultados e executar o procedimento de suporte e exclusão previsto |

Todas as telas terão estados de carregamento, vazio, falha e sucesso; erros terão
retentativa quando aplicável. Dados serão reconsultados ao abrir/solicitar,
retornar à aba e reconectar; mutações atualizarão as consultas afetadas e alterações
de terceiros serão sincronizadas conforme o contrato do plano. Cache e falha de
rede não podem produzir confirmação falsa ou disponibilidade garantida na tela.

## Fraldas e mimos: escopo confirmado

Separar presença, escolha de fraldas por tamanho e aba opcional de mimos.
Limites de pacotes de fraldas: P 6, M 19, G 19 e XG 6. Mimos permitem informar quantidade
por item, inclusive mais de um, sem consumir limites de fraldas. Os 23 itens e
os números recebidos estão na [especificação](FRALDAS-E-MIMOS.md).

Unidade confirmada: pacotes. Todos os mimos ficam sem limite por convite ou
no total do evento; números originais são referências sugeridas, sem bloqueio.
Esta decisão substitui o limite anteriormente confirmado para mimos numerados. Cada convite pode escolher
vários pacotes, respeitando o saldo por tamanho; “varios cotes” foi interpretado
como “vários pacotes”. Não exigir mimo para confirmar presença.

## Qualidade obrigatória

Visual profissional e consistente, priorizando celular; acessibilidade por
teclado e leitor de tela, contraste e tamanhos de toque conforme os critérios do
plano. Transações no banco impedem excesso de reservas, duplicação em retentativas
e acesso cruzado. Validar a jornada com backend real, duas sessões simultâneas e
carga de 50 convidados ativos, registrando latência e atualização entre telas.

## Classificação dos dados

| Acesso | Dados permitidos |
| --- | --- |
| Prévia pública | Conteúdo genérico; se personalizada, apenas título, descrição e capa explicitamente públicos de evento publicado |
| Convite válido | Detalhes autorizados do chá, data/hora, endereço, instruções, lista e disponibilidade agregada, própria resposta e reservas |
| Organizador | Seu evento, lista, convidados, respostas e reservas, totais e gestão dos convites |
| Servidor restrito | Hashes de credenciais/sessões, contadores de abuso e credenciais administrativas |

Nomes de convidados, contatos, endereço e reservas individuais nunca entram na
prévia pública ou em canais públicos de atualização. Coletar apenas informações
necessárias ao chá; imagens públicas exigem escolha explícita.

## Convites: decisão confirmada

O organizador poderá selecionar **individual** ou **familiar** em cada convite,
inclusive misturando os tipos no mesmo evento. Individual representa uma pessoa.
Para família, a implementação proposta usa nome de referência, limite definido
pelo organizador e quantidade confirmada pelo convidado; não exige nomes de todos
os integrantes. Haverá um link e um conjunto de reservas por convite.

O banco validará quantidades e limites. Resposta negativa contabiliza zero;
“talvez” e não respondido ficam separados das pessoas confirmadas. O painel mostra
convites respondidos e total de pessoas confirmadas como medidas distintas.
Alterar uma resposta atualiza a contagem, sem acumular respostas antigas.
O volume previsto de 50 pessoas não determina o número de convites.

## Regras a fechar antes de implementar os respectivos fluxos

As propostas abaixo ainda não são escolhas confirmadas pelo solicitante.

| Decisão | Proposta de trabalho | Quando resolver |
| --- | --- | --- |
| Sessão | Reaproveitar proposta técnica de 2 horas em memória, com reabertura do link após recarga; validar facilidade no WhatsApp | Antes do fluxo de acesso |
| Expiração | Até 7 dias após o evento | Antes de emitir convites reais; data do evento necessária |
| Recuperação | Revogar e reemitir acesso perdido, preservando vínculo com respostas e reservas e invalidando credenciais anteriores | Antes do fluxo de convites |
| Encerramento | Bloquear novas reservas; cancelamento/compra informada por até 7 dias com convite válido | Antes de concluir transações |
| Retenção | Excluir dados pessoais 90 dias após o evento e documentar cópias e imagens | Antes da entrega com dados reais |
| Recuperação do banco | Backup automático e restauração ensaiada; frequência e prazo de recuperação compatíveis com uso da família | Antes da entrega |

A simplificação de escopo não elimina isolamento entre usuários, proteção de
credenciais, integridade das reservas ou recuperação do banco. Critérios de aceite
são os marcos M1–M6 do plano; registros com P0–P7 referem-se ao plano histórico.
