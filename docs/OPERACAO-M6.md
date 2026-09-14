# Preparação operacional M6 — 2026-09-14

PR #1 integrado à main no commit `5353aa7`. Próxima entrega exige frontend,
login remoto, recuperação e aceite da família antes dos dados reais.

## Ambiente do evento

Auth remoto do projeto `chadbb-cha` atualizado pela Management API e conferido
por nova leitura:

- Site URL: `https://chadbb.pages.dev`.
- Callback permitido: `https://chadbb.pages.dev/auth/callback`.
- SMTP: ainda não configurado.

O Pages responde HTTP 200, mas a tela de entrada informa conexão não configurada.
As variáveis públicas foram preparadas fora do Git em
`~/.config/chadbb/pages-production.env`. No projeto Pages `chadbb`, ambiente
Production, configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
com os valores desse arquivo e executar novo build da main. Não usar chave
service_role/secret no frontend. O callback do Auth já corresponde a essa URL.

A sessão web do titular na Cloudflare não fornece credenciais para o CLI desta
máquina. Aplicação dessas variáveis permanece pendente de acesso autorizado ou
configuração pelo titular no painel.

## E-mail

O titular tem conta Resend, mas somente o endereço `chadbb.pages.dev`.
Recomendação: plano gratuito Resend, com domínio próprio verificado para o
remetente. O site pode continuar no endereço Pages. O domínio de teste
`resend.dev` só permite envio para o e-mail da conta Resend e não valida a entrega
ao organizador em outro endereço.

Após definir o domínio, verificar os registros DNS no Resend e configurar o
SMTP no Auth. Credenciais ficam fora do Git e da conversa. Validar entrega real,
PKCE no mesmo navegador, persistência, logout e rotas protegidas. Configurar
SMTP por si só não comprova entrega nem login.

Referências oficiais: [Resend com Supabase](https://resend.com/docs/send-with-supabase-smtp),
[domínio verificado](https://resend.com/docs/dashboard/domains/introduction) e
[limite do domínio de teste](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Metas de recuperação

Proposta aceita pelo titular nesta sessão:

- Backup diário.
- Perda máxima de 24 horas (RPO).
- Recuperação em até 2 horas (RTO).

Consulta à API do projeto retornou zero backups disponíveis e PITR desativado.
Ainda é necessário implementar agendamento, destino protegido fora da máquina,
retenção e alertas de falha. Essas metas não estão garantidas por haver um
roteiro ou um ensaio local.

O ensaio local usa origem sem dados de usuários, destino Supabase descartável em
portas separadas, dumps de roles/schema/dados e cópia separada da capa. Os
arquivos temporários contêm credenciais de convidados fictícios e são apagados
no encerramento. Não utiliza o projeto remoto nem cadastra dados reais.

Referências: [backup/restauração pela CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
e [limitações dos backups de Storage](https://supabase.com/docs/guides/platform/backups).

## Resultado do ensaio local

`npm run test:recovery:local` aprovado em 2026-09-14. Tempo medido até concluir
as verificações: 43,125 s, incluindo preparação do destino; importação e
validação: 0,664 s. A limpeza ocorre depois dessa medição. É um conjunto mínimo
local, não uma estimativa do tempo de recuperação em produção.

Recuperados: um organizador, um evento, 27 itens, dois convites, duas sessões,
duas reservas (uma cancelada), cinco pedidos e uma capa. Verificados:

- Login no Auth do destino com a senha da conta recuperada.
- Painel e versões idênticos ao backup.
- Download da capa restaurada com SHA-256 idêntico ao original.
- Troca de convite por sessão, cancelamento e nova reserva via RPC SQL.
- Histórico completo das 20 migrations e job de retenção.
- Permissões de todas as funções públicas/privadas para anon, authenticated e
  service_role; grants e flags de RLS de todas as tabelas públicas/privadas.
- Acesso anon a reservas e à execução da retenção negado.

O ensaio identificou dois cuidados obrigatórios: o cron precisa de cópia
explícita; os grants automáticos de um Supabase novo precisam ser neutralizados
antes de criar os objetos do dump, para não acrescentar acessos ausentes na
origem. O procedimento agora cobre esses casos e preserva também o histórico de
migrations separadamente. Não copia Vault nem publica funções no destino.

Origem limpa ao final: zero nas nove contagens de dados verificadas, e cotas
locais idênticas ao estado anterior. Containers e volumes do destino e arquivos
temporários de backup removidos. O banco remoto não recebeu dados deste ensaio.

Continuam pendentes: restauração a partir de backup do ambiente hospedado,
redeploy/configuração das Edge Functions no destino de recuperação, teste por
HTTP delas, entrega de e-mail real, backup diário protegido fora da máquina e
validação das metas RPO/RTO. O comando local requer a stack Supabase de
desenvolvimento ativa, sem usuários/eventos/arquivos e sem tráfego concorrente;
usa portas 55321–55329 para o destino, além de 8183 reservado na configuração.
