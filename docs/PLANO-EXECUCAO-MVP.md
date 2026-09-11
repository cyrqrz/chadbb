# Plano de entrega — chá de bebê da família

Revisado em 2026-09-11 por solicitação do idealizador.

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

## Estado real de partida

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

- [ ] Registrar data do evento e quem prestará suporte. Volume confirmado: cerca de 50 convidados. Prazo informado: segunda semana de outubro de 2026, com aproximadamente 20 dias de desenvolvimento; dia exato ainda a confirmar.
- [x] Escopo confirmado: o organizador escolhe individual ou familiar em cada convite.
- [ ] Implementar convite individual com uma pessoa e familiar com nome de referência e limite de pessoas definido pelo organizador. RSVP familiar informa quantas vão dentro desse limite; painel distingue convites respondidos de pessoas confirmadas.
- [ ] Reunir título, data/hora, local, instruções, imagem autorizada e lista desejada. Usar dados fictícios durante desenvolvimento.
- [ ] Criar uma direção visual única: acolhedora, limpa, com tipografia legível, hierarquia, espaçamentos e cores consistentes. Adaptar ao tema escolhido pela família, sem construir um editor de temas.
- [ ] Aplicar o visual às telas de convite, confirmação, presentes e painel; mostrar estados de vazio, carregamento, sucesso e erro com a mesma qualidade.
- [ ] Manter uma ação principal clara por etapa e linguagem simples: “Confirmar presença”, “Escolher presente”, “Cancelar reserva”. Explicar reserva e compra autodeclarada.

Aceite: revisão das telas principais em celular e desktop; nenhuma informação
provisória confundida com informação real; caminho principal compreensível para
o irmão e um convidado sem orientação técnica. O visual será implementado junto
com cada fluxo, sem deixá-lo como acabamento opcional ao final.

## M2 — Concluir organizador e lista com dados atuais

- [ ] Testar login por e-mail, callback, logout e sessão expirada com Supabase real.
- [ ] Validar criação/edição/publicação do evento e lista pela API real, incluindo tentativa de outro usuário acessar ou alterar os dados.
- [ ] Preparar catálogo com fraldas P/M/G/XG e os 23 mimos da especificação; usar pacotes para fraldas, ausência explícita de limite em todos os mimos, inclusive os originalmente numerados.
- [ ] Implementar abas Fraldas e Mimos, quantidades por mimo e resumo separado; adaptar schema/API para categorias e política de limite própria por item.
- [ ] Implementar a política de atualização abaixo em eventos, lista e futuros painéis.
- [ ] Preservar alterações de formulário ainda não salvas quando chegar uma atualização; detectar conflito de versão e oferecer recarregar/revisar.

Aceite: o organizador salva, recebe confirmação do banco e vê o resultado
persistido; outra sessão vê a atualização sem precisar de recarga manual.

### Contrato de atualização dos dados

“Atualizado assim que chamado” significa buscar o estado persistido no servidor
em cada consulta explicitamente solicitada. Cache não será apresentado como uma
resposta nova. O banco é a fonte de verdade; a disponibilidade na tela é indicativa
até a transação da reserva confirmar o resultado.

- [ ] Ao abrir uma tela, trocar evento, solicitar atualização, recuperar a conexão ou retornar à aba, consultar novamente os dados dinâmicos. Tratar respostas fora de ordem para uma resposta antiga não substituir uma mais recente.
- [ ] Dados em cache podem aparecer durante a consulta com indicação “Atualizando…”. Em falha, informar que não foi possível atualizar e oferecer tentar novamente; nunca apresentar sucesso falso ou falha como lista vazia.
- [ ] Após salvar, reservar, cancelar ou confirmar presença, aplicar o resultado confirmado pelo servidor e reconsultar as listas e totais afetados. Confirmar salvamento apenas após a transação; se a reconsulta falhar, distinguir “salvo” de “painel ainda não atualizado”.
- [ ] Para mudanças feitas por outras pessoas, usar notificação autorizada de alteração para disparar nova consulta. Não transmitir nomes, endereços, tokens ou reservas individuais em canais públicos. A consulta do convidado continua passando pelo servidor autorizado.
- [ ] Manter consulta periódica de segurança a cada 5 segundos nas telas dinâmicas visíveis, com pausa em segundo plano e recuo em falhas; reconsultar imediatamente ao reconectar. Se o canal de notificações não estiver pronto, essa consulta será a estratégia inicial do MVP, com o limite comunicado.
- [ ] Não cachear respostas privadas em CDN nem em service worker; isolar o cache por evento e identidade e limpar dados privados ao sair ou perder autorização. Configurar respostas privadas para não armazenamento HTTP.
- [ ] Mostrar perda de conexão e impedir confirmação fictícia. Repetir uma reserva com a mesma chave de idempotência quando o resultado da tentativa anterior for desconhecido.

Metas de aceite no ambiente do evento: resultado da própria ação aparece assim
que a resposta confirmada chegar; consulta ou mutação com p95 de até 2 segundos
na carga esperada; alterações de outra sessão aparecem em até 2 segundos com
notificação e em até 7 segundos com consulta periódica, em rede normal. Medir e
registrar essas metas com duas sessões e com a carga de 50 convidados ativos, além dos testes coordenados de disputa pela última unidade.
São metas a validar, não garantias de instantaneidade sob falha de rede.

## M3 — Convites e confirmação de presença

- [ ] Criar convites, sessões e respostas com tipo individual ou familiar selecionado pelo organizador. Permitir ambos no mesmo evento.
- [ ] Validar no banco: individual confirma exatamente uma pessoa; familiar confirma de 1 até o limite do convite; resposta negativa conta zero; “talvez” e ausência de resposta não entram em pessoas confirmadas. Atualizar resposta e quantidade na mesma transação.
- [ ] Usar um link por convite e um responsável de referência por família, sem exigir cadastro nominal de cada integrante. Reservas pertencem ao convite e são compartilhadas pela família; alterações concorrentes da resposta devem detectar conflito de versão.
- [ ] Impedir redução do limite abaixo da quantidade já confirmada e mudança de tipo incompatível com respostas existentes; orientar ajuste explícito sem descartar dados silenciosamente.
- [ ] Emitir, copiar, revogar e reemitir links pelo organizador; compartilhar manualmente no WhatsApp.
- [ ] Trocar token do convite por sessão, remover segredo da URL e validar expiração/revogação em toda leitura ou alteração. Guardar somente hashes no banco para credenciais.
- [ ] Permitir confirmar, recusar ou deixar “talvez” e alterar a resposta, sem exigir criação de conta do convidado.
- [ ] Mostrar apenas dados do evento e da própria resposta/reservas; não expor outros convidados.
- [ ] Aplicar limites de abuso, validação de entrada e recuperação compreensível para convite inválido ou sessão expirada.
- [ ] Testar acesso cruzado, revogação, expiração, reabertura do link no WhatsApp, convite individual, família, limites e contagem de pessoas ao alterar uma resposta.

Aceite: um convidado abre o link no celular, responde e vê sua resposta persistida;
o painel do organizador atualiza conforme o contrato de dados. O fluxo de retorno
à página precisa funcionar ou orientar claramente a reabertura do convite.

## M4 — Reservas corretas no banco

- [ ] Implementar reservas com quantidades positivas, vínculos obrigatórios e chave de idempotência única por convite.
- [ ] Garantir limites P=6, M=19, G=19 e XG=6 separadamente no banco; mimos nunca alteram esses totais. Validar quantidade inteira positiva em todos os mimos, sem teto comercial por convite ou evento; não exibir esgotamento de mimos.
- [ ] Implementar troca de tamanho atômica, preservando escolha anterior se o destino não estiver disponível; testar reservas e cancelamentos nas duas categorias.
- [ ] Calcular e validar disponibilidade dentro da mesma transação SQL da reserva, com bloqueio evento → item → reserva quando aplicável. Não confiar na quantidade mostrada pelo navegador.
- [ ] Integrar `private.committed_quantity` na migration de reservas; nunca assumir zero quando já houver comprometimento.
- [ ] Permitir cancelar e indicar “Já comprei”, mantendo quantidade comprometida enquanto reservado/comprado; deixar claro que a compra é informada pelo convidado.
- [ ] Impedir escrita direta em reservas e alteração de identidade/evento pelo cliente. Preservar RLS, grants mínimos e funções privilegiadas restritas.
- [ ] Integrar encerramento e regras pós-evento do contrato familiar.
- [ ] Cobrir os cenários abaixo com PostgreSQL real, conexões independentes e API autorizada.

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

- [ ] Navegação completa por teclado, ordem de foco previsível, foco visível e retorno correto após fechar diálogos; nenhuma armadilha de foco.
- [ ] HTML semântico, títulos em ordem, nomes acessíveis, rótulos e instruções associados aos campos; erros identificados por texto e associados ao campo.
- [ ] Contraste alvo de pelo menos 4,5:1 em texto comum e 3:1 em texto grande e componentes essenciais; estado nunca indicado apenas por cor.
- [ ] Texto ampliado a 200% e tela de 320 px sem perda de ações ou rolagem horizontal no fluxo principal. Áreas de toque de pelo menos 44 × 44 px para ações principais.
- [ ] Leitor de tela anuncia carregamento, erros e confirmações sem repetir todos os dados a cada sincronização. Imagens informativas têm descrição; decorativas são ignoradas.
- [ ] Respeitar preferência por movimento reduzido; não usar animação obrigatória, texto em imagem ou controles dependentes de hover.
- [ ] Testar a jornada real no celular, navegador interno do WhatsApp, desktop e ao voltar de outra aba, incluindo rede lenta, queda de conexão e sessão expirada.
- [ ] Executar verificação automatizada de acessibilidade e inspeção manual com teclado e leitor de tela; corrigir problemas que impeçam concluir a jornada.
- [ ] Ensaiar com o irmão e pelo menos um convidado: abrir convite, confirmar presença, escolher/trocar fralda, adicionar vários mimos com quantidades, cancelar escolhas e acompanhar totais separados no painel.

Aceite: tarefas completas sem ajuda técnica; visual consistente, legível e sem
cortes; nenhuma barreira conhecida que impeça uso dos fluxos essenciais.

## M6 — Colocar no ar e entregar ao irmão

- [ ] Configurar ambiente do evento separado do desenvolvimento, HTTPS, URLs de Auth e envio de e-mail; validar login e entrega do link nesse ambiente.
- [ ] Executar CI e migrations em banco limpo; fazer implantação e verificação com dados fictícios antes de cadastrar dados da família.
- [ ] Configurar backup e ensaiar restauração em ambiente separado. Registrar frequência, perda de dados tolerada e tempo de recuperação junto ao responsável.
- [ ] Disponibilizar registro de erros sem dados privados, verificação de disponibilidade e procedimento simples para recuperar convites e acessos.
- [ ] Definir prazo de retenção e procedimento de exclusão de dados e imagens, incluindo tratamento de backups.
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
a data do chá ainda não foi informada e não será inferida desse prazo.

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
