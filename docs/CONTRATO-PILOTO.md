# Contrato inicial do piloto

Registro: 2026-09-09. Primeira execução do plano, autorizada pelo pedido de execução.

## Stack e responsabilidades

P0.1: seguir React, Vite, TypeScript, Tailwind, React Router, TanStack Query,
Supabase e Cloudflare Pages, conforme ADR 001. Esta execução adota a proposta
para implementação; não representa aprovação comercial nem liberação do piloto.
O ADR existente foi preservado.

Engenharia desta entrega: Codex. Produto e operação: solicitante como ponto de
contato; nomes dos responsáveis pelo piloto ainda precisam ser indicados.
Não há prazo de entrega acordado. Sequência de esforço: base → organizador →
convite → concorrência → jornada → operação. Estimativas e datas dependem de
capacidade da equipe e serão registradas quando informadas, com revisão após M3.

## Jornada e estados (P0.2)

| Tela | Caminho principal | Vazio, carregamento e erro |
| --- | --- | --- |
| Acesso do organizador | Solicitar link por e-mail, abrir retorno, entrar; sair pelo painel | Envio em andamento; orientação para verificar e-mail; link expirado permite novo envio; sessão expirada retorna ao acesso |
| Eventos | Listar os próprios eventos; criar rascunho | Lista carregando; primeiro evento com ação de criar; falha com retentativa |
| Editor | Título, descrição pública, data/hora, local privado e imagem pública; salvar e publicar | Rascunho incompleto pode ser salvo; publicação exige título e data futura; erros junto aos campos; confirmação de encerramento |
| Lista | Selecionar catálogo e quantidades positivas | Catálogo vazio; carregamento; erro de rede; redução abaixo do comprometido informa limite |
| Convites | Nome mínimo, emitir link individual, copiar e revogar | Sem convites; emissão em andamento; link só apresentado na emissão; perda exige revogar e reemitir |
| Convite no celular | Trocar token do fragmento via POST; limpar fragmento; mostrar evento autorizado | Troca em andamento sem analytics; token inválido, expirado ou revogado orienta procurar organizador; recarga orienta reabrir convite |
| RSVP | Sim, não ou talvez; alterar resposta atual | Sem resposta; salvando; falha mantém escolha para retentativa |
| Presentes | Consultar disponibilidade, reservar, cancelar ou declarar compra | Lista vazia; carregamento; última unidade indisponível atualiza lista; retentativa usa a mesma chave; compra identificada como autodeclarada |
| Painel | Confirmações e quantidades solicitadas, comprometidas e disponíveis | Sem respostas/reservas; carregamento; erro recuperável; paginação |
| Prévia pública | Título e descrição pública de evento publicado | Não publicado/inexistente retorna página genérica sem dados privados |

Acesso, listagem e editor de eventos estão implementados na segunda entrega.
Catálogo, convites, RSVP, reservas, painel agregado e prévia seguem como contratos
das próximas etapas. Evidências e limites em EXECUCAO-ORGANIZADOR.md.

## Classificação de dados (P0.3)

| Acesso | Campos permitidos |
| --- | --- |
| Público, somente evento publicado | ID público, título escolhido para divulgação, descrição pública e imagem explicitamente publicada |
| Portador de convite válido | Campos públicos, data/hora, endereço e instruções privadas, catálogo do evento e disponibilidade agregada, sua própria resposta e reservas |
| Organizador proprietário | Seu evento, lista, identificação mínima dos seus convidados, expiração/revogação, respostas e reservas do evento, métricas agregadas |
| Servidor restrito | Hashes de tokens e sessões, contadores de abuso, credenciais administrativas |

Data e endereço não entram na prévia por padrão. Nada de nomes de convidados,
contatos, RSVP ou reservas individuais na projeção pública. Imagens publicáveis
precisam de escolha explícita; arquivos privados ficam em bucket separado.

## Decisões em acompanhamento (P0.4–P0.6)

Estas são propostas, a resolver nos marcos indicados; não são aprovações inferidas.

| Decisão | Proposta inicial | Responsável | Marco |
| --- | --- | --- | --- |
| Unidade do convite | Uma pessoa por convite; sem acompanhantes no RSVP | Produto | Antes de schema de RSVP (etapa 4) |
| Sessão | 2 horas, em memória; reabrir convite após recarga | Produto + engenharia | Etapa 4 |
| Expiração do convite | Até 7 dias após a data do evento; configurável | Produto | Etapa 4 |
| Limites | RSVP individual; até 10 unidades por pedido, limitado ao disponível; limites de abuso distintos | Produto + engenharia | Etapas 4–5 |
| Recuperação | Organizador revoga convite perdido e emite outro | Produto + operação | Etapa 4 |
| Encerramento | Bloquear novas reservas; cancelamento e declaração permitidos por 7 dias com convite válido | Produto | Antes das funções da etapa 5 |
| Retenção | Excluir dados pessoais 90 dias após evento; definir cópias de backup | Produto + operação | Antes de dados reais |
| Região | Preferir São Paulo se disponível na conta, aproximando banco e funções do público | Operação | Antes de criar ambientes remotos |
| Parceiros | Amazon, Mercado Livre e Shopee, todos desabilitados inicialmente | Produto | Antes de links públicos |

Para cada parceiro, registrar aprovação do uso, geração oficial de links,
autorização de imagens, regras de exibição de preços, rastreamento e restrições
sobre compras de pessoas próximas. Engenharia não habilitará parceiros apenas
por existir uma URL cadastrada. Condições comerciais serão consultadas nessa etapa.
