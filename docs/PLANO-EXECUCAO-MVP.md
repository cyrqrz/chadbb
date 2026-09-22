# Plano de entrega — chá de bebê da família

Revisado em 2026-09-14 por solicitação do idealizador.

Data do chá: **01/11/2026**. Horário: **12h, horário de Brasília**. Título: **Chá de bebê da Liz**.
Confirmação solicitada até **18/10/2026**. Local recebido no convite e mantido
fora do repositório público. Suporte técnico: Leonardo Martins (solicitante). Limites globais: P 6 / M 19 / G 19 / XG 6; sem cota
comercial adicional por convite.

## Objetivo e prioridade

Entregar uma ferramenta pronta para o irmão do solicitante organizar seu chá de
bebê e para os convidados usarem pelo celular, principalmente via WhatsApp.
O sucesso desta entrega é o evento funcionar: convidados entendem o convite,
confirmam presença e escolhem presentes; o organizador acompanha informações
corretas sem precisar atualizar planilhas ou recarregar a página manualmente.

Design profissional, acessibilidade, privacidade e integridade do banco fazem
parte do MVP. A transformação em produto comercial começa após o uso pela família.
Este plano substitui o [plano anterior](PLANO-PRODUTO-HISTORICO.md) no escopo e na
ordem de execução. O ADR continua como base técnica, com o adendo de escopo atual.

## Escopo da primeira entrega

| Entregar para o evento | Deixar para depois do evento |
| --- | --- |
| Acesso do organizador, edição, publicação e encerramento do chá | Cadastro comercial, planos, cobrança e aquisição de clientes |
| Convite compartilhável no WhatsApp e acesso simples sem conta para convidados | Outros tipos de evento e personalização por cliente |
| Confirmação de presença e alteração da resposta | Campanhas, notificações automáticas e automações de marketing |
| Lista com descrição clara, unidade e quantidade desejada | Catálogo de marketplace, importação e sincronização de preços/estoque |
| Reserva, cancelamento e indicação opcional de presente comprado | Compra verificada, checkout, pagamentos e comissões |
| Painel com confirmações, pessoas confirmadas conforme unidade do convite e presentes comprometidos/disponíveis | Analytics de produto, funil comercial e relatórios de afiliados |
| Identidade visual do chá, interface acessível e responsiva | Editor de temas e sistema de identidade visual para vários clientes |
| Hospedagem, backup recuperável e suporte simples para a família | Estrutura operacional para escala e vários clientes |

A lista inicial pode ser preparada com apoio técnico usando o catálogo manual
existente; não exige painel administrativo de produtos. Links de loja e prévia
personalizada por evento são opcionais e não bloqueiam a entrega. O convite terá
uma prévia genérica bem apresentada se a prévia personalizada ficar para depois.
Links opcionais serão HTTPS revisados, sem rastreamento comercial; reservar um
presente não dependerá de acessar uma loja. Não remover as proteções existentes.

## Presença, fraldas e mimos

O fluxo do convidado terá áreas **Presença**, **Fraldas** e **Mimos**. Fraldas têm
limites de pacotes por tamanho: **P: 6, M: 19, G: 19, XG: 6**. Cada convite
pode escolher vários pacotes, respeitando os saldos por tamanho. Mimos são
opcionais, em aba própria, com seleção de itens e quantidade por item, sem alterar
limites de fraldas ou número de pessoas confirmadas.

A [especificação de fraldas e mimos](FRALDAS-E-MIMOS.md) registra os 23 mimos,
a ausência de limite para todos eles e os testes de independência. Os números
originais dos mimos são referências sugeridas, não cotas. Cada unidade de fralda representa um pacote.
Esses requisitos passam a integrar M1–M5 dentro do prazo já planejado.

## Estado de partida em 11/09 (histórico)

Avanço em 14/09: M2–M4 implementados e testes locais/CI aprovados conforme
a [revisão técnica](REVISAO-TECNICA-2026-09-14.md). M5 segue com ensaios de
falha de rede, reabertura e acessibilidade; M6 depende de configuração do
ambiente do evento, recuperação e aceite da família. A tabela abaixo preserva
o diagnóstico inicial, não representa o estado atual.

| Área | Evidência atual | Falta para entregar |
| --- | --- | --- |
| Aplicação e organizador | Implementados login, eventos e capas; lint, tipos, 40 testes unitários e build aprovados | Ensaio de login por e-mail no navegador com backend real; acabamento visual |
| Banco e isolamento | 28 testes PostgreSQL portátil aprovados; versão/relógio impostos por trigger e identidade imutável | Reservas e convites ainda precisam de schema, autorização e testes; pgTAP e API por reexecutar com Docker |
| API e arquivos | 3 testes reais aprovados para organizador e Storage | Testes reais da lista e fluxo completo do convidado |
| Catálogo e lista | Categoria fralda/mimo, tamanho, limite por tamanho e ausência de limite nos mimos no schema, nas funções e no catálogo aplicado por migration | Abas e resumo separado na interface; validar API; conectar comprometimento às reservas |
| Atualização da interface | Contrato implementado: sem cache apresentado como novo, reconsulta ao abrir/focar/reconectar, consulta de segurança de 5 s com recuo e respostas fora de ordem tratadas | Canal autorizado de notificação; medir as metas de p95 e propagação |
| Convites, presença e reservas | Contratos de planejamento existentes | Implementação e ensaio completos |
| Hospedagem e uso externo | Supabase local funcionando | Ambiente do evento, CI remota, acesso pelo celular e recuperação |

Evidências: [validação local](VALIDACAO-LOCAL-2026-09-11.md).
Testes antigos de navegador usaram APIs simuladas; não comprovam a jornada real.

## M1 — Fechar a experiência e o visual

- [x] Registrar data do evento: **01/11/2026**.
- [x] Definir quem prestará suporte: Leonardo Martins (solicitante). Volume confirmado: cerca de 50 convidados. Prazo informado: segunda semana de outubro de 2026, com aproximadamente 20 dias de desenvolvimento; dia exato ainda a confirmar.
- [x] Escopo confirmado: o organizador escolhe individual ou familiar em cada convite.
- [x] Implementar convite individual com uma pessoa e familiar com nome de referência e limite de pessoas definido pelo organizador. RSVP familiar informa quantas vão dentro desse limite; painel distingue convites respondidos de pessoas confirmadas.
- [ ] Reunir título, data/hora, local, instruções, imagem autorizada e lista desejada. Usar dados fictícios durante desenvolvimento.
- [x] Criar uma direção visual única: acolhedora, limpa, com tipografia legível, hierarquia, espaçamentos e cores consistentes. Paleta rosa alinhada ao convite recebido em 14/09, sem construir um editor de temas.
- [x] Aplicar o visual às telas de convite, confirmação, presentes e painel; mostrar estados de vazio, carregamento, sucesso e erro com a mesma qualidade. _(Feito: T-F7, gates G0–G5.6, publicado em 22/09. Estados comuns em `src/components/States.tsx`.)_
- [x] Manter uma ação principal clara por etapa e linguagem simples: “Confirmar presença”, “Escolher presente”, “Cancelar reserva”. Explicar reserva e compra autodeclarada. _(Feito: T-F1. A autodeclaração é explicada em `GuestPage.tsx` e `InvitationsPage.tsx`.)_

Aceite: revisão das telas principais em celular e desktop; nenhuma informação
provisória confundida com informação real; caminho principal compreensível para
o irmão e um convidado sem orientação técnica. O visual será implementado junto
com cada fluxo, sem deixá-lo como acabamento opcional ao final.

## M2 — Concluir organizador e lista com dados atuais

- [x] Testar login por e-mail, callback, logout e sessão expirada com Supabase real.
- [x] Validar criação/edição/publicação do evento e lista pela API real, incluindo tentativa de outro usuário acessar ou alterar os dados. _(Feito: T-B4, smoke remoto aprovado no `chadbb-cha` com limpeza confirmada.)_
- [x] Preparar catálogo com fraldas P/M/G/XG e os 23 mimos da especificação; usar pacotes para fraldas, ausência explícita de limite em todos os mimos, inclusive os originalmente numerados.
- [x] Implementar abas Fraldas e Mimos, quantidades por mimo e resumo separado; adaptar schema/API para categorias e política de limite própria por item.
- [x] Implementar a política de atualização abaixo em eventos, lista e futuros painéis. _(Feito: T-F4, detalhada nas caixas do contrato logo abaixo.)_
- [x] Preservar alterações de formulário ainda não salvas quando chegar uma atualização; detectar conflito de versão e oferecer recarregar/revisar. _(Feito: regra 7 do `AGENTS.md`, valendo em todos os formulários; conflito de versão tratado por `*_VERSION_CONFLICT`.)_

Aceite: o organizador salva, recebe confirmação do banco e vê o resultado
persistido; outra sessão vê a atualização sem precisar de recarga manual.

### Contrato de atualização dos dados

“Atualizado assim que chamado” significa buscar o estado persistido no servidor
em cada consulta explicitamente solicitada. Cache não será apresentado como uma
resposta nova. O banco é a fonte de verdade; a disponibilidade na tela é indicativa
até a transação da reserva confirmar o resultado.

- [x] Ao abrir uma tela, trocar evento, solicitar atualização, recuperar a conexão ou retornar à aba, consultar novamente os dados dinâmicos. Tratar respostas fora de ordem para uma resposta antiga não substituir uma mais recente. _(Feito: `queryClient` com `refetchOnMount`/`WindowFocus`/`Reconnect` em `always`; `AbortSignal` no `guestCall` descarta resposta antiga.)_
- [x] Dados em cache podem aparecer durante a consulta com indicação “Atualizando…”. Em falha, informar que não foi possível atualizar e oferecer tentar novamente; nunca apresentar sucesso falso ou falha como lista vazia. _(Feito: `RefreshStatus` e `SlowRefresh` em `src/components/States.tsx`.)_
- [x] Após salvar, reservar, cancelar ou confirmar presença, aplicar o resultado confirmado pelo servidor e reconsultar as listas e totais afetados. Confirmar salvamento apenas após a transação; se a reconsulta falhar, distinguir “salvo” de “painel ainda não atualizado”. _(Feito: o resultado do servidor substitui o estado e as consultas afetadas são invalidadas; "salvo" vs. "painel ainda não atualizado" fica no `RefreshStatus`.)_
- [ ] Para mudanças feitas por outras pessoas, usar notificação autorizada de alteração para disparar nova consulta. Não transmitir nomes, endereços, tokens ou reservas individuais em canais públicos. A consulta do convidado continua passando pelo servidor autorizado. _(Adiado de propósito: a caixa seguinte define a consulta periódica como a estratégia do MVP enquanto o canal de notificação não existir.)_
- [x] Manter consulta periódica de segurança a cada 5 segundos nas telas dinâmicas visíveis, com pausa em segundo plano e recuo em falhas; reconsultar imediatamente ao reconectar. Se o canal de notificações não estiver pronto, essa consulta será a estratégia inicial do MVP, com o limite comunicado. _(Feito: `live`/`liveInterval` em `src/lib/query.ts` — 5 s, recuo até 60 s em falha, pausa em segundo plano.)_
- [x] Não cachear respostas privadas em CDN nem em service worker; isolar o cache por evento e identidade e limpar dados privados ao sair ou perder autorização. Configurar respostas privadas para não armazenamento HTTP. _(Feito: `cache: no-store` nas chamadas privadas; sem service worker no projeto.)_
- [x] Mostrar perda de conexão e impedir confirmação fictícia. Repetir uma reserva com a mesma chave de idempotência quando o resultado da tentativa anterior for desconhecido. _(Feito: G5.3 com `src/lib/useOnline.ts`; `request_id` e "Verificar tentativa anterior" no `GuestPage.tsx`.)_

Metas de aceite no ambiente do evento: resultado da própria ação aparece assim
que a resposta confirmada chegar; consulta ou mutação com p95 de até 2 segundos
na carga esperada; alterações de outra sessão aparecem em até 2 segundos com
notificação e em até 7 segundos com consulta periódica, em rede normal. Medir e
registrar essas metas com duas sessões e com a carga de 50 convidados ativos, além dos testes coordenados de disputa pela última unidade.
São metas a validar, não garantias de instantaneidade sob falha de rede.

## M3 — Convites e confirmação de presença

- [x] Criar convites, sessões e respostas com tipo individual ou familiar selecionado pelo organizador. Permitir ambos no mesmo evento.
- [x] Validar no banco: individual confirma exatamente uma pessoa; familiar confirma de 1 até o limite do convite; resposta negativa conta zero; “talvez” e ausência de resposta não entram em pessoas confirmadas. Atualizar resposta e quantidade na mesma transação.
- [x] Usar um link por convite e um responsável de referência por família, sem exigir cadastro nominal de cada integrante. Reservas pertencem ao convite e são compartilhadas pela família; alterações concorrentes da resposta devem detectar conflito de versão.
- [x] Impedir redução do limite abaixo da quantidade já confirmada e mudança de tipo incompatível com respostas existentes; orientar ajuste explícito sem descartar dados silenciosamente.
- [x] Emitir, copiar, revogar e reemitir links pelo organizador; compartilhar manualmente no WhatsApp.
- [x] Trocar token do convite por sessão, remover segredo da URL e validar expiração/revogação em toda leitura ou alteração. Guardar somente hashes no banco para credenciais.
- [x] Permitir confirmar, recusar ou deixar “talvez” e alterar a resposta, sem exigir criação de conta do convidado.
- [x] Mostrar apenas dados do evento e da própria resposta/reservas; não expor outros convidados.
- [x] Aplicar limites de abuso, validação de entrada e recuperação compreensível para convite inválido ou sessão expirada.
- [x] Testar acesso cruzado, revogação, expiração, reabertura do link no WhatsApp, convite individual, família, limites e contagem de pessoas ao alterar uma resposta. _(Feito: T-B2, quatro casos novos em `tests/database/events.integration.mjs`.)_

Aceite: um convidado abre o link no celular, responde e vê sua resposta persistida;
o painel do organizador atualiza conforme o contrato de dados. O fluxo de retorno
à página precisa funcionar ou orientar claramente a reabertura do convite.

## M4 — Reservas corretas no banco

- [x] Implementar reservas com quantidades positivas, vínculos obrigatórios e chave de idempotência única por convite.
- [x] Garantir limites P=6, M=19, G=19 e XG=6 separadamente no banco; mimos nunca alteram esses totais. Validar quantidade inteira positiva em todos os mimos, sem teto comercial por convite ou evento; não exibir esgotamento de mimos.
- [x] Implementar troca de tamanho atômica, preservando escolha anterior se o destino não estiver disponível; testar reservas e cancelamentos nas duas categorias.
- [x] Calcular e validar disponibilidade dentro da mesma transação SQL da reserva, com bloqueio evento → item → reserva quando aplicável. Não confiar na quantidade mostrada pelo navegador.
- [x] Integrar `private.committed_quantity` na migration de reservas; nunca assumir zero quando já houver comprometimento.
- [x] Permitir cancelar e indicar “Já comprei”, mantendo quantidade comprometida enquanto reservado/comprado; deixar claro que a compra é informada pelo convidado.
- [x] Impedir escrita direta em reservas e alteração de identidade/evento pelo cliente. Preservar RLS, grants mínimos e funções privilegiadas restritas.
- [x] Integrar encerramento e regras pós-evento do contrato familiar. Conferência
  em 2026-09-16: contrato atualizado e 62/62 testes de Postgres portátil; ações
  novas bloqueadas, compra/cancelamento com convite válido e expiração cobertos.
- [x] Cobrir os cenários abaixo com PostgreSQL real, conexões independentes e API autorizada. Evidências: revisão técnica e continuação M4/M5 no registro de execução.

| Cenário obrigatório | Resultado |
| --- | --- |
| Duas pessoas disputam a última unidade | Exatamente uma reserva; nenhum excesso |
| Clique duplo ou reenvio após timeout | Uma reserva e resultado recuperável para a mesma chave/pedido |
| Mesma chave com item ou quantidade diferente | Conflito, sem segunda reserva |
| Cancelamento repetido | Quantidade liberada uma única vez |
| Redução de quantidade enquanto alguém reserva | Total solicitado nunca abaixo do comprometido |
| Encerramento enquanto alguém reserva | Ordem definida pelos bloqueios; reserva recusada se encerramento prevalecer |
| Acesso a reserva ou convite de outra pessoa | Negado, sem expor dados ou alterar registros |
| Marcar como comprado | Continua consumindo disponibilidade; nenhuma confirmação de pagamento |

Aceite: todas as invariantes passam no banco e na API; testes com duas telas
confirmam atualização, mensagens de conflito e totais coerentes.

## M5 — Acessibilidade e ensaio completo

Estes requisitos acompanham M1–M4; esta etapa confirma o conjunto.

- [x] Navegação completa por teclado, ordem de foco previsível, foco visível e retorno correto após fechar diálogos; nenhuma armadilha de foco. _(Feito: T-F3/G5.1 e G5.4; `ConfirmDialog` devolve o foco ao botão de origem, com teste em `specimens.spec.ts`.)_
- [x] HTML semântico, títulos em ordem, nomes acessíveis, rótulos e instruções associados aos campos; erros identificados por texto e associados ao campo. _(Feito: axe em 7 specs; erro ligado ao campo tem teste próprio em `specimens.spec.ts`.)_
- [x] Contraste alvo de pelo menos 4,5:1 em texto comum e 3:1 em texto grande e componentes essenciais; estado nunca indicado apenas por cor. _(Feito: verificado pelo axe, que roda com as telas paradas.)_
- [x] Texto ampliado a 200% e tela de 320 px sem perda de ações ou rolagem horizontal no fluxo principal. Áreas de toque de pelo menos 44 × 44 px para ações principais. _(Feito: testes de 320 px a 200% nas telas principais; alvos de 44 px conferidos em `gift-list-qa.spec.ts` e `gift-list.spec.ts`.)_
- [x] Leitor de tela anuncia carregamento, erros e confirmações sem repetir todos os dados a cada sincronização. Imagens informativas têm descrição; decorativas são ignoradas. _(Feito: T-F3; regiões vivas sem repetir o conteúdo a cada consulta.)_
- [x] Respeitar preferência por movimento reduzido; não usar animação obrigatória, texto em imagem ou controles dependentes de hover. _(Feito: `prefers-reduced-motion` no `styles.css`; nenhum controle depende de hover — há teste garantindo que a linha realçada não é clicável.)_
- [ ] Testar a jornada real no celular, navegador interno do WhatsApp, desktop e ao voltar de outra aba, incluindo rede lenta, queda de conexão e sessão expirada.
- [ ] Executar verificação automatizada de acessibilidade e inspeção manual com teclado e leitor de tela; corrigir problemas que impeçam concluir a jornada. _(Metade feita: a verificação automatizada roda no `test:e2e` (axe em 7 specs). Falta a inspeção manual com leitor de tela.)_
- [ ] Ensaiar com o irmão e pelo menos um convidado: abrir convite, confirmar presença, escolher/trocar fralda, adicionar vários mimos com quantidades, cancelar escolhas e acompanhar totais separados no painel.

Aceite: tarefas completas sem ajuda técnica; visual consistente, legível e sem
cortes; nenhuma barreira conhecida que impeça uso dos fluxos essenciais.

## M6 — Colocar no ar e entregar ao irmão

- [x] Configurar ambiente do evento separado do desenvolvimento, HTTPS, URLs de Auth e envio de e-mail; validar login e entrega do link nesse ambiente. _(Feito: T-B1, SMTP Resend no Auth do `chadbb-cha`; titular validou login real, persistência, logout e proteção de rota em 16/09.)_
- [x] Executar CI e migrations em banco limpo; fazer implantação e verificação com dados fictícios antes de cadastrar dados da família. _(Feito: `ci.yml` roda `db:reset` com todas as migrations, pgTAP, API, navegador e e-mail; a verificação com dados fictícios foi o smoke da T-B4.)_
- [ ] Configurar backup e ensaiar restauração em ambiente separado. Registrar frequência, perda de dados tolerada e tempo de recuperação junto ao responsável. _(Parcial: backup diário ativo e validado. Falta refazer a restauração com dados e Storage reais e medir o RTO — T-B6.)_
- [x] Disponibilizar registro de erros sem dados privados, verificação de disponibilidade e procedimento simples para recuperar convites e acessos. _(Feito: `health.yml` e `scripts/health`; auditoria só com contagens técnicas (regra 5). Recuperação de convites e acessos em `ENTREGA-E-SUPORTE.md`.)_
- [x] Definir prazo de retenção e procedimento de exclusão de dados e imagens, incluindo tratamento de backups: 30 dias após o término, implementado e implantado no chadbb-cha em 2026-09-15.
- [ ] Concluir ensaio de concorrência, atualização e acessibilidade no ambiente do evento; registrar falhas corrigidas e limites remanescentes.
- [ ] Cadastrar conteúdo real, entregar acesso do organizador e instruções curtas, e liberar o envio dos convites após o ensaio com o irmão.

Aceite final: URL acessível, conteúdo correto, fluxo completo aprovado pelo irmão,
banco protegido e recuperável, dados atualizados conforme as metas verificadas e
um responsável disponível para suporte até o evento. Publicar uma tela bonita ou
passar testes isolados não basta para considerar a entrega concluída.

## Sequência e responsabilidades

Ordem: M1 → M2 → M3 → M4 → M5 → M6. Acessibilidade, visual e atualização de dados
entram na implementação de cada tela. Preparação da hospedagem pode começar antes
da conclusão das reservas para descobrir limitações de ambiente com antecedência.

Engenharia: Codex em colaboração com o solicitante. Conteúdo, prioridades e acesso
às contas: solicitante. Validação prática: irmão como organizador e um convidado.
Volume confirmado: 50 convidados. Prazo solicitado: segunda semana de outubro de
2026, com cerca de 20 dias de desenvolvimento. O prazo é para entregar a ferramenta;
o chá ocorrerá em **1º de novembro de 2026**, conforme informado pelo solicitante.

### Calendário de trabalho

| Período de 2026 | Entrega planejada |
| --- | --- |
| 11–13 de setembro | M1: regras mínimas, direção visual e telas essenciais; iniciar preparação do ambiente remoto |
| 14–17 de setembro | M2: organizador/lista integrados, visual e política de atualização |
| 18–22 de setembro | M3: convites, confirmação e painel de presença |
| 23–27 de setembro | M4: reservas, cancelamento, totais e testes de concorrência |
| 28 de setembro–1º de outubro | M5 e preparação M6: jornada completa, acessibilidade, ensaio com 50 convidados simulados, deploy de teste e restauração |
| 2–4 de outubro | Ensaio com o irmão, correções e entrega candidata pronta para uso |
| Segunda semana de outubro | Margem final de suporte e ajustes; confirmar dia exato de entrega |

O calendário é meta de execução, com revisão ao fim de cada marco. Se houver
atraso, adiar prévia personalizada, links de lojas e enfeites visuais opcionais.
Preservar convite, presença, reservas, painel, acessibilidade e integridade do
banco. Preparar contas e envio de e-mail cedo para não concentrar dependências
externas nos últimos dias. Não adicionar escopo comercial nesses 20 dias.

## Depois do chá de bebê

Registrar dificuldades da família, falhas e melhorias; corrigir os problemas
observados antes de abrir a ferramenta a novos usuários. Só então revisar modelo
comercial, afiliados, métricas, outros eventos, temas e operação para vários clientes.
O backlog histórico é referência, não compromisso da entrega familiar.
