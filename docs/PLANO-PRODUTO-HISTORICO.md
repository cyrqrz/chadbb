> Documento histórico, substituído em 2026-09-11 pelo [plano do MVP familiar](PLANO-EXECUCAO-MVP.md). As tarefas comerciais não são requisitos da primeira entrega. Identificadores P0–P7 em registros antigos referem-se a este documento.

# Plano de execução do MVP do chadbb

Data: 2026-09-09
Base: [ADR 001 — Arquitetura do MVP de eventos e listas de presentes](ADR-001-arquitetura-mvp-eventos-presentes.md)
Status: execução iniciada em 2026-09-09; base e fluxo do organizador implementados; validação integrada ainda pendente.

Acompanhamento: [contrato inicial](CONTRATO-PILOTO.md) e [evidências da base](EXECUCAO-BASE.md). Segunda entrega: [organizador e testes](EXECUCAO-ORGANIZADOR.md). O aceite do piloto permanece pendente.

## Objetivo e ponto de partida

Entregar um piloto de chá de bebê no qual o organizador publica o evento, monta a lista e compartilha convites individuais. Pelo celular, o convidado confirma presença, reserva presentes, acessa a loja e pode declarar a compra. O organizador acompanha confirmações e quantidades comprometidas.

Na elaboração deste plano, o repositório continha somente o ADR. A execução da base começou em 2026-09-09; os itens concluídos estão assinalados abaixo. A sequência usa React, Vite, TypeScript, Tailwind, React Router, TanStack Query, Supabase e Cloudflare Pages conforme o ADR; não pressupõe infraestrutura já criada.

O MVP estará concluído quando o fluxo completo funcionar no ambiente do piloto e os critérios de segurança, concorrência e recuperação deste plano tiverem evidências de aprovação.

## Escopo e organização

Inclui autenticação do organizador, eventos, catálogo manual, itens, convites, sessões de convidados, RSVP, reservas, declaração de compra, prévia pública, links de afiliados e métricas mínimas. Catálogo será mantido inicialmente por operação administrativa restrita, sem exigir um painel administrativo próprio.

Ficam fora: pagamentos, checkout, aplicativo nativo, importação automática de produtos, atualização de preços/estoque, compra verificada, notificações automáticas, outbox, broker, API Python e fluxos específicos de outros tipos de evento.

Cada identificador abaixo pode virar uma tarefa no backlog. Uma etapa só está pronta quando sua entrega e seus critérios de aceite forem atendidos. Produto resolve regras e conteúdo; engenharia implementa e verifica; operação prepara ambiente, recuperação e suporte. Uma mesma pessoa pode assumir mais de um papel, mas os responsáveis devem ser nomeados ao iniciar o trabalho.

## Etapa 0 — Fechar o contrato do piloto

Dependência: nenhuma. Responsáveis: produto e engenharia.

- [x] P0.1 Registrar concordância com a stack proposta ou revisar o ADR antes de implementar uma alternativa.
- [x] P0.2 Descrever a jornada de organizador e convidado, com telas e estados de erro, vazio e carregamento.
- [x] P0.3 Separar campos públicos do evento, campos restritos ao convite e dados exclusivos do organizador. Endereço privado e identificação dos convidados nunca entram na prévia pública.
- [ ] P0.4 Confirmar convite por pessoa ou grupo familiar. Usar uma pessoa por convite como premissa inicial; resolver antes de concluir schema e interface de RSVP.
- [x] P0.5 Abrir registros de decisão para duração da sessão, expiração do convite, limites por convite, recuperação de acesso, ações após encerramento e retenção/exclusão de dados.
- [ ] P0.6 Listar parceiros pretendidos e a validação necessária para links, imagens, preços e rastreamento. Cada parceiro só é habilitado publicamente após validação própria.

Aceite: jornada e classificação de dados registradas; pendências com responsável e marco de resolução. Pendências comerciais não bloqueiam a base técnica.

## Etapa 1 — Preparar projeto e ambientes

Dependência: escolha da stack em P0.1. Responsável: engenharia.

- [x] P1.1 Criar aplicação com React, Vite e TypeScript; configurar Tailwind, Router e Query.
- [x] P1.2 Adotar estrutura inicial: `src/features/` para fluxos, `src/components/` para componentes compartilhados, `src/lib/` para integrações, `supabase/migrations/`, `supabase/functions/`, `functions/` para a prévia no Pages e `tests/` para verificações de integração e ponta a ponta.
- [ ] P1.3 Configurar ambiente local reproduzível e dados fictícios; separar desenvolvimento do projeto de produção. Escolher região considerando banco, funções e público do piloto.
- [x] P1.4 Criar `.env.example` com nomes e instruções, sem valores secretos. Variáveis expostas ao frontend contêm apenas configuração pública e chave de cliente apropriada; credenciais privilegiadas ficam no servidor.
- [ ] P1.5 Configurar lint, checagem de tipos, build e execução dos testes existentes em CI. Validar migrations em banco limpo e impedir testes destrutivos contra produção.
- [ ] P1.6 Preparar deploy de preview no Cloudflare Pages, fallback das rotas da SPA e documentação de execução local.

Aceite: outra pessoa consegue iniciar a aplicação e o banco seguindo o README; CI e preview funcionam; segredos não aparecem no repositório ou bundle.

## Etapa 2 — Organizador, eventos e isolamento de dados

Dependência: etapa 1 e classificação de dados de P0.3. Responsável: engenharia.

- [x] P2.1 Implementar migrations de `events`, proprietário, tipo, campos do evento e estados `draft`, `published` e `closed`, com restrições e índices.
- [ ] P2.2 Implementar login, logout e tratamento de sessão expirada via Supabase Auth; configurar URLs de retorno por ambiente e o mecanismo de acesso escolhido para o piloto.
- [x] P2.3 Criar telas para listar, criar, editar, publicar e encerrar eventos. Validar os campos obrigatórios na publicação.
- [x] P2.4 Ativar RLS e permissões mínimas; proteger inserção e atualização contra troca indevida de proprietário. Usar operações controladas para transições que participam das regras transacionais.
- [ ] P2.5 Implementar upload de imagens com políticas por proprietário, limites de tamanho/tipo e separação entre arquivos públicos e privados.
- [ ] P2.6 Criar testes de API com dois organizadores, cobrindo leitura, inserção, edição e exclusão cruzadas, inclusive adulteração de IDs.

Aceite: o organizador gerencia seu evento; chamadas diretas não acessam nem alteram eventos ou arquivos de outro proprietário; encerramento possui operação compatível com o protocolo de bloqueios do ADR.

## Etapa 3 — Catálogo e lista de presentes

Dependência: etapa 2. Responsável: engenharia; produto prepara catálogo.

- [ ] P3.1 Criar `products` e `event_items` com chaves estrangeiras, quantidades positivas e índices de consulta por evento.
- [ ] P3.2 Disponibilizar procedimento administrativo documentado para cadastrar produtos e links oficiais. Restringir escrita do catálogo à administração.
- [ ] P3.3 Validar URLs HTTPS e destinos aprovados no servidor; não buscar URLs arbitrárias nem criar redirecionamento aberto. Usar apenas conteúdo e imagens autorizados.
- [ ] P3.4 Criar interface para selecionar produtos e definir quantidades no evento; permitir leitura do catálogo necessária a esse fluxo.
- [ ] P3.5 Definir contratos das funções transacionais de reserva, cancelamento, declaração de compra, alteração de quantidade e encerramento: entrada, ator, saída e erros de domínio.
- [ ] P3.6 Preparar alteração de quantidade com bloqueio de evento e item. Concluir e testar a verificação do total comprometido quando `reservations` existir na etapa 5; impedir exclusões ou outras escritas que contornem essa regra.

Aceite: organizador monta a lista com produtos do catálogo; usuário comum não altera produtos; quantidade inválida é rejeitada também fora da interface. A proteção contra redução abaixo do comprometido é aceite obrigatório da etapa 5.

## Etapa 4 — Convites, sessões e RSVP

Dependência: etapa 2, unidade de convite definida e contratos da etapa 3. Responsável: engenharia.

- [ ] P4.1 Criar `invitations`, `guest_sessions` e `rsvps`. Manter hashes e dados de sessão fora da área exposta aos clientes; garantir uma resposta atual por convite.
- [ ] P4.2 Implementar emissão, expiração e revogação de convites em operações autorizadas para o proprietário. Gerar tokens criptográficos e armazenar apenas hashes.
- [ ] P4.3 Implementar troca do token no fragmento por sessão via POST; remover o segredo da URL e manter a credencial de sessão em memória, enviada em cabeçalho de autorização.
- [ ] P4.4 Resolver identidade e evento pela sessão no servidor. Verificar expiração e revogação do convite a cada ação; nunca confiar em identidade livremente enviada pelo cliente.
- [ ] P4.5 Criar Edge Functions para consulta autorizada do evento e atualização do RSVP; retornar apenas dados permitidos e permitir alterar a resposta atual.
- [ ] P4.6 Implementar limitação de tentativas por IP e convite com estado compartilhado, validação de payload e origens permitidas. Reutilizar essa proteção nas mutações da etapa 5.
- [ ] P4.7 Criar telas de convites do organizador e fluxo móvel do convidado, incluindo link inválido, sessão expirada e orientação para reabrir o convite após recarregar a página.
- [ ] P4.8 Testar token inválido, expirado e revogado, sessão expirada, revogação de sessões existentes, acesso entre eventos e ausência de leitura direta de dados privados.

Aceite: convite permite acessar o evento e responder RSVP; revogação bloqueia sessões já emitidas; nenhuma URL, log ou captura de analytics revela a credencial.

## Etapa 5 — Reservas e integridade sob concorrência

Dependência: etapas 3 e 4. Responsável: engenharia.

- [ ] P5.1 Criar `reservations` com quantidade positiva, vínculos, estados `reserved`, `purchase_declared`, `cancelled` e unicidade por convite/chave de idempotência.
- [ ] P5.2 Implementar reserva em uma única função SQL: validar vínculos, bloquear evento em modo compartilhado, confirmar publicação, bloquear item, resolver idempotência, calcular comprometimento e inserir.
- [ ] P5.3 Tratar repetição concorrente da chave: mesmo payload retorna o resultado anterior; payload diferente retorna conflito. Comparar todos os campos relevantes, inclusive item e quantidade, e recuperar o resultado em conflito de unicidade.
- [ ] P5.4 Implementar cancelamento, declaração de compra e alteração de quantidade obedecendo à ordem evento → item → reserva, quando aplicável. `reserved` e `purchase_declared` consomem disponibilidade; `cancelled` libera uma única vez.
- [ ] P5.5 Garantir que encerramento obtenha bloqueio incompatível com novas reservas. Formalizar transições permitidas e as ações autorizadas após encerramento conforme P0.5.
- [ ] P5.6 Proibir escrita direta em reservas, inclusive pelo organizador. Revisar grants, RLS e execução de funções: operações exclusivas do servidor inacessíveis a `anon` e `authenticated`; funções privilegiadas com `search_path` fixo e objetos qualificados.
- [ ] P5.7 Integrar Edge Functions, validação de sessão e interface. Tratar indisponibilidade e conflito com mensagens claras; manter a mesma chave de idempotência nas retentativas do mesmo pedido.
- [ ] P5.8 Cobrir as invariantes com testes reais de banco e chamadas concorrentes, usando conexões independentes e início coordenado. Não depender de mocks para comprovar bloqueios.

Aceite obrigatório:

| Cenário | Resultado esperado |
| --- | --- |
| Dois convidados disputam a última unidade | Exatamente uma reserva bem-sucedida; total comprometido não excede o solicitado |
| Mesma chave e mesmo pedido, inclusive simultâneos | Uma reserva e o mesmo resultado lógico nas respostas |
| Mesma chave com item ou quantidade diferente | Conflito, sem nova reserva |
| Cancelamento repetido ou concorrente | Disponibilidade liberada uma única vez |
| Redução de quantidade concorrente com reserva | Quantidade solicitada nunca fica abaixo do comprometido |
| Encerramento concorrente com reserva | Operações serializadas pelos bloqueios; reserva rejeitada se o encerramento prevalecer |
| Convite de outro evento ou alteração de reserva alheia | Acesso negado sem alteração de dados |
| Declaração de compra | Quantidade continua comprometida e interface informa que é autodeclarada |

## Etapa 6 — Experiência completa, compartilhamento e métricas

Dependência: etapas 4 e 5; parceiros aprovados para habilitar seus links publicamente. Responsáveis: engenharia e produto.

- [ ] P6.1 Concluir a página móvel com detalhes autorizados, RSVP, lista, disponibilidade indicativa, reservas próprias, cancelamento e declaração de compra.
- [ ] P6.2 Concluir painel do organizador com confirmações, reservas e quantidades solicitadas, comprometidas e disponíveis, com paginação onde necessário.
- [ ] P6.3 Implementar rota pequena em Pages Functions com HTML e metadados públicos de evento publicado. A prévia funciona sem o segredo do convite; escape de conteúdo e projeção explícita impedem vazamento de dados.
- [ ] P6.4 Validar navegação e compartilhamento no WhatsApp, inclusive comportamento do fragmento, prévia, retorno da loja e sessão mantida ou expirada.
- [ ] P6.5 Criar `affiliate_clicks` e registro de cliques que não bloqueie a navegação se falhar. Abrir link oficial diretamente, sem identificadores pessoais ou transição de estado da reserva.
- [ ] P6.6 Registrar eventos publicados, convites acessados, RSVP, reservas e cliques por plataforma com identificadores mínimos. Definir deduplicação de acessos para distinguir convites únicos de trocas de sessão repetidas.
- [ ] P6.7 Documentar comparação manual com relatórios dos parceiros: comissão confirmada separada de cliques e declarações; receita por evento apenas se houver atribuição permitida e demonstrável.
- [ ] P6.8 Revisar acessibilidade básica, navegação por teclado, rótulos, contraste e estados de carregamento/erro. Executar fluxo completo em celular e navegador interno do WhatsApp.

Aceite: organizador e convidado completam a jornada; prévia contém somente conteúdo aprovado; falha de métricas não impede abrir a loja; clique nunca aparece como compra confirmada.

## Etapa 7 — Preparação operacional e liberação do piloto

Dependência: etapas anteriores e pendências pré-piloto resolvidas. Responsáveis: engenharia, operação e produto.

- [ ] P7.1 Conferir condições atuais de hospedagem, banco, e-mail e backup; registrar orçamento, cotas, disponibilidade e responsáveis pelas contas. Os valores do ADR são referências a revalidar.
- [ ] P7.2 Configurar produção, domínio, Auth, origens, segredos e políticas de segurança de conteúdo. Inspecionar bundle, logs e prévias para credenciais e dados privados.
- [ ] P7.3 Definir rotina de backup, acesso às cópias, perda de dados tolerável e tempo de recuperação. Restaurar em ambiente separado e registrar evidência antes de cadastrar dados reais.
- [ ] P7.4 Implementar e testar retenção/exclusão de convidados, sessões e dados relacionados; documentar também o tratamento de cópias de backup.
- [ ] P7.5 Monitorar erros, latência, contenção de reservas, consumo de banco/arquivos/saída e limitação de abuso. Definir quem verifica os indicadores durante o evento.
- [ ] P7.6 Documentar suporte para convite perdido, revogação, expiração e ações após encerramento; aplicar limites e prazos definidos em P0.5.
- [ ] P7.7 Preparar roteiro de implantação: migrations compatíveis, deploy de funções e frontend, verificação com dados fictícios e procedimento de recuperação. Reverter frontend não implica desfazer migrations; mudanças de dados exigem correção compatível ou restauração planejada.
- [ ] P7.8 Executar ensaio com dois organizadores e convidados fictícios, cobrindo matriz de autorização, concorrência e jornada móvel. Registrar resultados e corrigir falhas impeditivas.
- [ ] P7.9 Revisar critérios de liberação com o responsável do piloto; cadastrar o evento real e compartilhar convites após aprovação dos critérios.

Aceite: restauração demonstrada, decisões operacionais registradas e nenhum defeito conhecido que permita acesso indevido, exposição de segredos, excesso de reservas ou bloqueio do fluxo principal.

## Dependências e marcos de acompanhamento

| Marco | Entregas | Evidência |
| --- | --- | --- |
| M1 — Base executável | Etapas 0–1 | Ambiente reproduzível, CI e preview |
| M2 — Organizador funcional | Etapas 2–3 | Evento com lista e isolamento entre proprietários |
| M3 — Convite funcional | Etapa 4 | RSVP móvel e revogação testada |
| M4 — Reserva consistente | Etapa 5 | Testes concorrentes e de autorização aprovados |
| M5 — Jornada completa | Etapa 6 | Ensaio de compartilhamento, reserva e saída para loja |
| M6 — Piloto liberado | Etapa 7 | Checklist, restauração e operação aprovados |

O caminho crítico passa por ambiente → autorização → convites e itens → transações → jornada completa → liberação. Após a etapa 2, catálogo e convites podem avançar em paralelo se os contratos estiverem definidos. Validação de parceiros, conteúdo público e regras operacionais podem avançar desde a etapa 0. Limites de abuso entram com as primeiras operações de convidados, antes de exposição pública.

Não há datas ou capacidade de equipe informadas. Estimar esforço e atribuir datas por tarefa ao iniciar M1; revisar a previsão após M3, quando autorização e sessões estiverem demonstradas. Segurança, concorrência e restauração são condições de liberação, não itens opcionais para acomodar prazo.

## Avaliação após o piloto

- [ ] Registrar convites acessados, confirmações, reservas, cliques, erros e solicitações de suporte, com as limitações de medição documentadas.
- [ ] Conversar com organizador e convidados sobre dificuldades de acesso, reserva, abertura de loja e entendimento da declaração de compra.
- [ ] Comparar comissões confirmadas com relatórios permitidos dos parceiros; não usar o evento familiar isolado como comprovação da hipótese de receita.
- [ ] Priorizar correções para o próximo evento. Reavaliar arquitetura somente com evidências de limites, custos, integrações ou necessidade de identidade mais forte, conforme o ADR.

Primeira execução sugerida: concluir P0.1–P0.3 e P1.1–P1.5 para estabelecer a base verificável; manter as demais decisões da etapa 0 em acompanhamento até seus marcos obrigatórios.
