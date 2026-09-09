# ADR 001 Arquitetura do MVP de eventos e listas de presentes

| Campo | Valor |
| --- | --- |
| Data | 2026-09-09 |
| Status | Proposto como base para implementação |
| Escopo | Aplicação web de eventos, convidados e presentes; piloto de chá de bebê |
| Origem | Consolidação da sessão de definição de produto, stack e segurança |
| Caminho sugerido no repositório | `docs/adr/001-arquitetura-mvp.md` |

## Contexto

O produto permitirá criar eventos, convidar pessoas, confirmar presença e organizar listas de presentes. O primeiro piloto será o chá de bebê do irmão do parceiro de negócios do idealizador. O acesso ocorrerá principalmente pelo celular, a partir de um convite compartilhado no WhatsApp.

O aplicativo será gratuito para usuários. A hipótese de receita é receber comissões por compras qualificadas atribuídas a links de afiliados de Mercado Livre, Amazon e Shopee. Tráfego e cliques são etapas do funil, e não receita garantida. A elegibilidade desse uso precisa ser validada individualmente com cada programa.

As prioridades são baixo custo inicial, facilidade de manutenção, rapidez para validar o produto e possibilidade de crescimento sem reescrever o núcleo. A proposta inicial considerava Vite, React e Tailwind na Cloudflare Pages, com backend Python e Postgres. Este ADR registra a recomendação de começar com Supabase, sem uma API Python separada.

O status proposto não representa aprovação formal da equipe. Os detalhes complementares abaixo são padrões recomendados para tornar a implementação concreta; pendências de negócio estão explicitadas ao final.

## Decisão

Adotar uma aplicação React com Vite e TypeScript, hospedada na Cloudflare Pages, usando Postgres, Auth, Storage e Edge Functions do Supabase. O organizador acessará operações simples pela API do Supabase com Row Level Security (RLS). As ações dos convidados passarão por funções de servidor. Operações que alteram disponibilidade de presentes serão executadas por funções transacionais no Postgres.

| Camada | Tecnologia | Responsabilidade |
| --- | --- | --- |
| Interface | React, Vite, TypeScript e Tailwind | Experiência responsiva de organizadores e convidados |
| Navegação | React Router | Rotas da aplicação |
| Estado remoto | TanStack Query | Consultas, mutações e invalidação de dados |
| Hospedagem | Cloudflare Pages | Arquivos estáticos e entrega do frontend |
| Identidade do organizador | Supabase Auth | Login e sessão autenticada |
| Dados | Postgres no Supabase | Persistência, integridade, RLS e transações |
| Entrada dos convidados | Supabase Edge Functions | Validar convite/sessão, limitar abuso e chamar operações autorizadas |
| Arquivos | Supabase Storage | Imagens do evento com políticas de acesso |
| Prévia do convite | Pequena rota em Pages Functions | HTML com metadados públicos para compartilhamento |

Workers Static Assets é uma alternativa de hospedagem, mas não será um segundo deploy obrigatório. Python/FastAPI poderá ser introduzido se integrações ou processamento justificarem uma API própria. A escolha de Vite decorre da simplicidade do MVP; Next.js pode ser hospedado fora da Vercel e não é descartado por uma suposta incapacidade de escalar.

## Escopo do primeiro ciclo

1. Organizador entra, cria e publica um evento.
2. Organizador monta a lista a partir de produtos cadastrados manualmente e define quantidades.
3. Organizador cria convites e compartilha seus links.
4. Convidado visualiza o evento, confirma presença e reserva presentes.
5. Convidado abre a loja parceira e pode declarar que já comprou.
6. Organizador acompanha confirmações, reservas e quantidades disponíveis.
7. Produto registra cliques e permite comparar o funil com relatórios dos parceiros.

Ficam fora desse ciclo: checkout próprio, processamento de pagamentos, aplicativo nativo, busca automática nas três lojas, sincronização de preço e estoque, microserviços, filas dedicadas, comprovação automática de compra e notificações automáticas. Chá de bebê será um tipo de evento, sem implementar fluxos adicionais de outros tipos agora.

## Modelo de dados

| Entidade | Campos e vínculos principais | Regras |
| --- | --- | --- |
| `events` | `id`, `owner_id`, `type`, `status`, data e configurações | Um proprietário no MVP; rascunho, publicado ou encerrado |
| `products` | Plataforma, referência externa, título e URL afiliada | Catálogo curado; escrita restrita à administração |
| `event_items` | `event_id`, `product_id`, `quantity_requested` | Quantidade positiva; não reduzir abaixo do total comprometido |
| `invitations` | `event_id`, identificação mínima, hash do token, expiração e revogação | Convite vinculado a exatamente um evento |
| `guest_sessions` | `invitation_id`, hash da credencial e expiração | Sessão curta e revogável; sem credencial em texto puro no banco |
| `rsvps` | `invitation_id`, resposta e atualização | Uma resposta atual por convite |
| `reservations` | Item, convite, quantidade, estado e chave de idempotência | Quantidade positiva; item e convite pertencem ao mesmo evento |
| `affiliate_clicks` | Evento, item, plataforma e instante | Clique não altera estado da reserva nem comprova compra |

Chaves estrangeiras, restrições e índices serão criados em migrations SQL versionadas. IDs imprevisíveis ajudam a reduzir enumeração, mas não substituem autorização. Endereço privado e dados pessoais não devem fazer parte da representação pública do evento.

Estados iniciais da reserva: `reserved`, `purchase_declared` e `cancelled`. Os dois primeiros consomem quantidade; o último libera disponibilidade. A declaração de compra não será exibida como compra verificada pela plataforma. Para o piloto, reservas persistem até cancelamento; expiração automática fica para uma decisão posterior.

## Acesso e limites de confiança

O navegador é uma origem não confiável. Campos ocultos, validações visuais e IDs enviados pelo frontend não concedem permissão. As regras precisam continuar funcionando quando a API é chamada manualmente.

| Ator e operação | Entrada | Autorização |
| --- | --- | --- |
| Organizador lê e edita seu evento | API do Supabase | Sessão Auth e RLS vinculada a `owner_id` |
| Organizador consulta convidados e reservas | API do Supabase | RLS verificando propriedade do evento |
| Organizador altera quantidade comprometida ou estado com regras | Função transacional | Identidade autenticada e verificação de proprietário |
| Visitante consulta página compartilhável | Função de servidor | Evento publicado e projeção explícita de campos permitidos |
| Convidado confirma presença ou reserva | Edge Function e função SQL | Convite/sessão válido, escopo do evento e regras da operação |
| Convidado cancela uma reserva | Mesmo caminho | Reserva vinculada ao convite autenticado |
| Administrador mantém produtos | Operação administrativa restrita | Credenciais de servidor e acesso administrativo explícito |

Habilitar RLS em todas as tabelas expostas pela API, com negação por padrão. Políticas devem proteger leitura, exclusão e os valores de inserção/atualização, incluindo impedir troca indevida de proprietário ou evento. Dados de sessão e tokens ficam em área não exposta a clientes.

Convidados não recebem leitura direta das tabelas de convidados, sessões ou reservas. Consultas públicas retornam somente campos selecionados. Escritas diretas em reservas são proibidas para clientes, inclusive organizadores; alterações passam pelas operações que preservam as invariantes.

## Convites e sessões dos convidados

Haverá uma página compartilhável com conteúdo público mínimo e convites individuais para RSVP e reserva. Um link individual é uma credencial de acesso: quem o possui pode agir no escopo daquele convite. Isso não comprova identidade e não impede encaminhamento.

Gerar tokens com aleatoriedade criptográfica, armazenar apenas seus hashes e permitir expiração e revogação. A entrada do convite troca o token por uma sessão de curta duração; a revogação do convite invalida suas sessões. A função resolve a identidade do convidado pela sessão, nunca por um `guest_id` aceito livremente do cliente.

Como padrão inicial, transportar o token no fragmento do link, enviá-lo ao servidor por POST e removê-lo da barra de endereço após a troca. Manter a credencial da sessão em memória e enviá-la em cabeçalho de autorização; recarregar a página pode exigir reabrir o convite. Não registrar tokens em logs nem permitir que analytics capturem a URL antes da limpeza. Se a equipe optar por cookies para persistência, deverá implementar proteção contra CSRF, atributos seguros e regras de origem antes de habilitá-los.

A página usada para prévia do WhatsApp não deve depender do segredo do convite nem divulgar endereço privado ou dados dos convidados. Necessidade de identidade comprovada exigirá revisão desta decisão e autenticação adicional.

## Transações e concorrência

Uma transação garante consistência; autorização determina se o ator pode executar a ação. Ambas são obrigatórias. Criar um registro simples pode usar uma única instrução SQL. Uma sequência de chamadas HTTP independentes não constitui uma transação.

Reservar deve ser uma única chamada a uma função SQL, com os seguintes passos na mesma transação:

1. Resolver e verificar sessão, convite e vínculo com o evento no caminho confiável.
2. Adquirir bloqueio compartilhado da linha do evento e confirmar que está publicado. O encerramento usa bloqueio incompatível para não disputar com novas reservas.
3. Bloquear a linha do item com `SELECT … FOR UPDATE`.
4. Verificar se a chave de idempotência já foi utilizada pelo convite. Repetição do mesmo pedido retorna o resultado anterior; payload diferente retorna conflito.
5. Somar reservas em estados que consomem disponibilidade e validar a quantidade solicitada.
6. Inserir a reserva e confirmar a transação; qualquer falha desfaz a operação.

Uma restrição única sobre convite e chave de idempotência protege também repetições concorrentes. Se houver conflito de unicidade, a operação deve recuperar o resultado já registrado em vez de criar outra reserva.

Reserva, cancelamento, declaração de compra e alteração da quantidade desejada devem seguir a mesma ordem de bloqueios: evento, item e reserva quando aplicável. Alterações que não respeitem esse protocolo ficam proibidas. Adotar o isolamento padrão com leituras de disponibilidade após o bloqueio e cobrir o comportamento em testes concorrentes.

Invariantes obrigatórias:

- Soma das quantidades comprometidas nunca supera a quantidade desejada.
- Item e convite de uma reserva pertencem ao mesmo evento.
- Um convidado só modifica suas próprias reservas.
- Eventos encerrados não aceitam novas reservas.
- Clique em loja nunca altera disponibilidade nem confirma compra.

Funções SQL usam `SECURITY INVOKER` quando possível. Funções privilegiadas exigem permissões mínimas, `search_path` fixo e nomes de objetos qualificados. Revogar execução pública por padrão. Uma função exclusiva de servidor não pode ser executável por `anon` ou `authenticated`.

Se a Edge Function usar chave secreta ou `service_role`, não depender de RLS como proteção daquela chamada: essas credenciais podem ignorá-la. A função de servidor verifica acesso e a operação SQL verifica os vínculos e invariantes. Nenhuma credencial privilegiada chega ao frontend.

## Segurança operacional

- Validar tipos, tamanhos, quantidades e estados no servidor, além das restrições do banco.
- Aplicar limitação de tentativas por IP e convite em autenticação e mutações, com contadores compartilhados ou mecanismo gerenciado; memória de uma única instância não basta.
- Configurar origens permitidas; CORS é uma medida complementar, não autenticação.
- Tratar conteúdo de usuário como texto; não aceitar HTML arbitrário e configurar política de segurança de conteúdo.
- Aceitar links HTTPS de destinos aprovados. Não criar redirecionador aberto nem buscar URLs arbitrárias no servidor.
- Restringir uploads por proprietário, tamanho e tipos permitidos. Separar imagens publicáveis de arquivos privados.
- Excluir tokens, contatos e endereços de logs e analytics. Registrar falhas e ações relevantes com identificadores técnicos mínimos.
- Separar desenvolvimento de produção e manter segredos fora do código. Nunca apontar testes destrutivos para o banco do piloto.
- Definir rotina de backup e testar restauração antes de receber dados reais; não presumir que o plano gratuito fornece a recuperação necessária.
- Definir prazo de retenção e fluxo de exclusão dos dados de convidados antes do piloto.

## Afiliados e validação do negócio

Começar com catálogo manual e links gerados pelos mecanismos oficiais aprovados de cada parceiro. Não presumir que um parâmetro arbitrário converte qualquer URL em link de afiliado. Não copiar imagens ou sincronizar preços sem confirmar as condições aplicáveis.

Registrar cliques sem bloquear a navegação para a loja em caso de falha do analytics. Usar o link oficial diretamente no piloto; redirecionamentos próprios e identificadores adicionais dependem de validação das regras do parceiro. Não transmitir identificadores pessoais dos convidados às lojas.

Indicadores iniciais: eventos publicados, convites acessados, confirmações, reservas, cliques por plataforma e comissão confirmada. Atribuição de receita por evento só será apresentada se os relatórios e mecanismos permitidos pelo parceiro a sustentarem. Caso contrário, mostrar receita agregada e explicitar a limitação.

O piloto familiar valida fluxo e usabilidade. A hipótese de receita exige outros eventos e verificação das regras de compras elegíveis, inclusive eventuais restrições envolvendo pessoas próximas.

## Eventos de domínio e tarefas futuras

O registro de um chá de bebê em `events` é distinto de um evento técnico como `gift_reserved`. Não adotar broker ou arquitetura orientada a eventos no MVP. A operação confirma a transação e devolve o resultado à interface.

Quando notificações forem necessárias, gravar uma tarefa em uma tabela outbox na mesma transação da alteração de negócio. Um processador separado executará o envio com retentativas e idempotência. Falha no envio não desfaz uma reserva confirmada.

## Alternativas consideradas

| Alternativa | Benefício | Motivo para não adotar agora |
| --- | --- | --- |
| FastAPI, SQLAlchemy, Alembic e Postgres | Backend explícito e portável; adequado se Python for a especialidade da equipe | Mais um serviço, deploy e camada de integração para manter |
| Hono em Workers com Postgres | TypeScript em todas as camadas e execução por uso | Exige integrar autenticação e acesso ao banco; Supabase concentra necessidades do piloto |
| Next.js | Renderização no servidor e framework integrado | Necessidade inicial limitada; Vite atende com uma rota pequena para prévias |
| Postgres acessível apenas por API própria | Centraliza autorização na API | Custo de implementação adicional; RLS atende operações simples do organizador |

Se Python for claramente a linguagem de maior produtividade da equipe, reconsiderar FastAPI antes de implementar a camada de servidor. A API pode rodar em contêiner no Render com banco separado e próximo geograficamente. O plano gratuito do Render dorme por inatividade e não é a escolha recomendada para os convites reais.

## Custos e evolução

O objetivo é começar perto de zero dentro das cotas gratuitas, não garantir operação gratuita permanente. Domínio, envio de e-mail, recuperação de dados e crescimento podem gerar custos.

Na consulta feita durante a sessão, Supabase Free incluía 500 MB de banco, 1 GB de arquivos e 5 GB de saída, com pausa após uma semana de inatividade; Pro começava em US$ 25 por mês. Workers Free oferecia 100 mil requisições dinâmicas por dia com limite de CPU; o plano pago começava em US$ 5 por mês, sujeito a uso adicional. São referências de planejamento, não orçamento contratado, e precisam ser rechecadas na implantação.

Monitorar uso de banco, saída de dados, latência, erros e contenção em reservas. Escolher a região das funções e do banco de forma a minimizar latência. Usar índices e paginação antes de ampliar a arquitetura. Aplicar cache somente a conteúdo público compatível com eventual defasagem; disponibilidade exibida é indicativa e a transação decide se a reserva pode ser feita.

Reavaliar a arquitetura quando houver integrações ou tarefas além dos limites das funções, necessidade de identidade mais forte, custos medidos incompatíveis com a receita ou contenção relevante. Postgres e migrations SQL reduzem o esforço de migração, mas Auth, Storage e Edge Functions criam dependências reais do Supabase.

## Consequências

Reduzimos infraestrutura própria e mantemos integridade perto dos dados. Em contrapartida, as regras ficam distribuídas entre RLS, SQL e funções de servidor, exigindo organização e testes de autorização. Convites sem login reduzem fricção, mas concedem acesso ao portador do link. O catálogo manual acelera a validação, com trabalho operacional e possível desatualização. Planos gratuitos impõem limites de disponibilidade e recuperação que precisam ser aceitos conscientemente antes do piloto.

## Sequência de implementação e critérios de aceite

1. Criar projeto, ambientes, migrations e configuração de segredos.
2. Implementar Auth do organizador, eventos, RLS e testes entre dois proprietários.
3. Implementar catálogo curado, itens e operações transacionais de quantidade.
4. Implementar convites, sessão, revogação e RSVP.
5. Implementar reserva, cancelamento e declaração de compra com idempotência.
6. Implementar página móvel, prévia do WhatsApp e saída para lojas.
7. Habilitar métricas mínimas, limites de abuso, backup e restauração; executar o piloto.

Antes do piloto, verificar:

- Organizador A não lê nem modifica dados do organizador B por chamadas diretas à API.
- Convidado A não acessa dados pessoais nem cancela reservas do convidado B.
- Token inválido, expirado ou revogado não autoriza ações; sessões de convite revogado deixam de funcionar.
- Duas reservas simultâneas da última unidade produzem exatamente um sucesso.
- Repetição do pedido não duplica reserva; repetição com payload diferente retorna conflito.
- Cancelamento libera quantidade uma única vez; edição concorrente não torna disponibilidade negativa.
- Encerramento concorrente com reserva respeita a ordem transacional definida.
- Chaves privilegiadas, tokens e dados privados não aparecem no bundle, prévias ou logs.
- Fluxo completo funciona no celular, inclusive abertura da loja; clique não se transforma em compra confirmada na interface.
- Restauração de dados foi demonstrada em ambiente separado.

## Pendências que não impedem iniciar a base técnica

| Pendência | Quando resolver |
| --- | --- |
| Confirmar elegibilidade do produto, links, imagens, preços e rastreamento em cada programa | Antes de habilitar o respectivo parceiro publicamente |
| Definir quais campos do evento são públicos e o conteúdo das prévias | Antes de compartilhar convites reais |
| Confirmar unidade do convite: pessoa ou grupo familiar | Antes de concluir RSVP e contagem de participantes; padrão técnico inicial é um convite por pessoa |
| Definir limites por convite, prazo de sessão e retenção dos dados | Antes do piloto; manter configuráveis |
| Definir recuperação de acesso e cancelamento após encerramento | Antes do piloto; até lá, encerramento bloqueia novas reservas e exceções exigem ação do organizador |
| Confirmar orçamento e necessidades de backup/disponibilidade | Antes de receber dados reais |

## Referências

Referências consultadas na sessão que originou este ADR. A documentação dos serviços permanece a fonte para condições vigentes.

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase orientações para funções SQL](https://supabase.com/docs/guides/ai-tools/ai-prompts/database-functions)
- [PostgreSQL bloqueios explícitos](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Supabase preços](https://supabase.com/pricing)
- [Cloudflare Workers preços](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare migração de Pages para Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Render limites do plano gratuito](https://render.com/docs/free)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Amazon Brasil políticas de associados](https://associados.amazon.com.br/help/operating/policies)
