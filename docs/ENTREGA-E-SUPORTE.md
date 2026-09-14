# Entrega e suporte do chá

Evento: 01/11/2026 às 12h (Brasília). Confirmação solicitada até 18/10/2026.
Regras: limites globais P 6 / M 19 / G 19 / XG 6; vários pacotes por convite;
mimos opcionais. O contato impresso no convite não identifica, por si só, quem
assumirá o suporte técnico.

## Preparação do ambiente

1. Identificar o projeto Supabase que atenderá ao evento e manter desenvolvimento
   separado. Conferir o histórico: banco vazio ou schema `mvp-familiar` aceita a
   sequência do PR #1; schema alternativo da `main` exige migração específica.
2. Usar Cloudflare Pages para o frontend. Configurar URL Supabase e chave pública;
   chave de servidor fica somente no backend. O build Workers separado já
   apresentava falha antes do PR e não substitui a validação do Pages.
3. Configurar no Auth a URL do site e o callback HTTPS `/auth/callback`, envio de
   e-mail e remetente. Validar solicitação, recebimento, PKCE no mesmo navegador,
   persistência, logout e proteção de rotas nesse ambiente.
4. Publicar a função `guest` e definir `GUEST_ALLOWED_ORIGINS` com a origem HTTPS
   exata. Testar origem permitida e proibida, revogação e sessão expirada.
5. Conferir o job `personal-data-retention` (único agendado) e a disponibilidade das páginas.
   Uma resposta OPTIONS não comprova banco, Auth ou RSVP; usar um evento fictício
   para testar a jornada completa antes de cadastrar conteúdo real.

## Backup e restauração

Antes de dados reais, registrar com o responsável a frequência de backup, a perda
de dados tolerada e o tempo de recuperação aceitável. Confirmar o que a conta do
Supabase efetivamente oferece; não presumir backup automático ou recuperação
ponto a ponto sem verificar o projeto contratado.

Ensaiar em projeto separado com dados fictícios:

1. Criar evento, dois convites, respostas, reservas, cancelamento e uma capa.
2. Registrar versões, contagens e saldos esperados, sem guardar tokens em logs.
3. Gerar backup de schema/dados e cópia dos objetos Storage conforme o mecanismo
   disponível. Backup do banco não substitui cópia dos arquivos das capas.
4. Restaurar no destino isolado. Manter o frontend e envio de e-mail isolados;
   não apontar o domínio usado pelos convidados para o destino de ensaio.
5. Conferir RLS/grants, funções, migrations, job de retenção, capas, login, convites,
   respostas, reservas e saldos. Validar também um cancelamento e nova reserva.
6. Registrar duração, perda observada, arquivos usados e resultado. Só marcar
   restauração concluída após executar esse fluxo; roteiro escrito não é evidência.

## Ensaio com a família

O irmão e um convidado devem completar sem ajuda técnica: abrir link pelo WhatsApp,
confirmar presença, reservar mais de um tamanho, adicionar mimo, trocar tamanho,
informar compra, cancelar e verificar os totais no painel. Testar também voltar
à aba, perder conexão, reabrir o link e aumentar o texto no celular real.

O ensaio automatizado já cobre 320 px/texto a 200%, desktop/celular, teclado, axe,
falha de resposta após commit e concorrência de banco. Ainda faltam o navegador
interno do WhatsApp, leitor de tela manual e o ambiente remoto.

## Instruções curtas para o organizador

- Entre pelo link enviado ao seu e-mail no mesmo navegador em que o solicitou.
- Confira título, data às 12h, endereço e instruções antes de publicar.
- Prepare a lista e confira os quatro limites por tamanho.
- Crie um convite por pessoa ou família; o limite de pessoas controla apenas RSVP.
- Copie e envie cada link manualmente. Não publique lista de links ou nomes.
- Para corrigir nome/tipo/limite, edite o convite. Uma edição antiga pode conflitar
  com uma resposta recém-enviada; revise o painel antes de salvar novamente.
- Se um link foi perdido ou compartilhado indevidamente, reemita ou revogue.
  Respostas e presentes ficam preservados, e a sessão anterior deixa de funcionar.
- Se uma tentativa ficou sem resultado, use “Verificar tentativa anterior”. Não
  interprete falha de conexão como cancelamento da reserva.
- “Já comprei” é uma declaração do convidado, sem confirmação de pagamento.
- Encerrar impede novas reservas e respostas; não há reabertura pela interface.
  A data 18/10 consta nas instruções do convite, sem encerramento automático.

## Retenção e exclusão

Decisão fechada em 2026-09-14 pelo solicitante.

### Política

- Dados pessoais dos convidados ficam por até **30 dias após o término do evento**
  (`events.ends_at`). Depois, **hard delete** de convites (nomes), respostas,
  reservas, sessões e pedidos.
- Do evento, também são apagados endereço, instruções privadas e os arquivos do
  Storage **exclusivos** dele. Ficam ID, título, datas e status. A conta do
  organizador nunca é apagada, e um arquivo referenciado por outro evento é preservado.
- O prazo é calculado apenas por `private.retention_due_at(ends_at)`: 30 dias de
  calendário no fuso `America/Sao_Paulo`. Evento sem término nunca vence, e a
  publicação exige término. Na interface, início e término são sempre digitados e
  exibidos no horário de Brasília.
- A auditoria (`private.retention_audit`) guarda só `event_id`, data, status e
  contagens de convites, pedidos, reservas, sessões e arquivos removidos. Nenhum
  nome, identificador de convite, payload, endereço ou caminho de arquivo.
- Estatísticas só podem permanecer anonimizadas e sem permitir reidentificação.
  Hoje nenhuma estatística é mantida além dessas contagens técnicas.
- Evento expurgado não aceita edição, novos convites nem nova lista (`EVENT_PURGED`).

### Agendamento e execução

1. `pg_cron` executa o job `personal-data-retention` diariamente às **06:17 UTC**
   (03:17 em Brasília). É o único job de retenção; o antigo de 90 dias foi removido.
2. O job chama `private.invoke_retention()`, que lê `project_url` e
   `retention_cron_secret` do Vault e faz `POST` para a Edge Function `retention`.
   Sem esses segredos no Vault, o job não faz nada.
3. A função valida o header `x-retention-secret` contra `RETENTION_CRON_SECRET`.
   Para cada evento vencido, remove primeiro os arquivos exclusivos e depois executa
   o expurgo do banco, numa transação. A marca `personal_data_purged_at` é gravada por
   último, só depois de todas as exclusões.
4. Execução manual pelo suporte: `POST` para `/functions/v1/retention` com o header
   lido de `~/.config/chadbb/retention-cron-secret`, sem exibir o valor.

### Recuperação

- **Falha no Storage:** grava `storage_failed`, não toca no banco e tenta de novo na
  próxima execução.
- **Storage apagado e depois falha no banco:** grava `db_failed` e a marca continua
  nula. Na execução seguinte, a listagem vazia é tratada como estado válido e o
  expurgo do banco é concluído com zero arquivos removidos, sem depender dos arquivos.
- Repetir a execução é seguro: evento já expurgado não é reprocessado.

### Pedido do titular (LGPD)

1. O suporte (Leonardo Martins) confirma a identidade do solicitante com o organizador.
2. Localiza o convite e executa `select private.erase_invitation('<id>')` numa conexão
   administrativa. A função apaga convite, respostas, reservas, sessões e pedidos
   daquele convite, libera as quantidades e registra `invitation_erased` na auditoria.
3. Registra a data do atendimento, sem copiar os dados apagados.

### Obrigação legal de conservação

Se houver obrigação legal específica, antes do expurgo exportar só os dados
estritamente necessários para essa finalidade, em local controlado e com prazo
próprio, e registrar a base legal. O restante segue a política acima.

### Backups

Cópias de backup do Supabase podem conter dados apagados até expirarem pelo ciclo do
plano contratado. Não declarar exclusão total antes disso, e não restaurar backup
antigo sem reaplicar o expurgo.

## Pendências para liberar o envio dos convites

- Projeto e credenciais de operação disponíveis no ambiente autorizado.
- Ambiente do evento configurado e testado, inclusive e-mail.
- Backup/restauração executados e metas de recuperação registradas.
- ~~Procedimento de exclusão definido~~: política de 30 dias fechada em 2026-09-14 e implantada no `chadbb-cha` em 2026-09-15.
- Conteúdo cadastrado e aprovado pelo irmão.
- Ensaio no WhatsApp e no celular real aprovado pela família.

Projeto remoto criado em 2026-09-14: **chadbb-cha**, ref `fcykqrlnofmdtmewlejr`,
organização `chadbb` (`zfzzahtvvtmuogmatolo`), região **São Paulo (`sa-east-1`)**,
exclusivo do chá e separado de desenvolvimento e preview. A senha do banco fica
apenas na máquina do titular, fora do repositório. Nenhuma migration, função ou
configuração de Auth foi aplicada ainda. Suporte técnico, do envio dos
convites ao dia do evento: Leonardo Martins (solicitante).
