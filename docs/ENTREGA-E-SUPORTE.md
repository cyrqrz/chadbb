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
   chave de servidor fica somente no backend. O build Workers órfão foi
   desconectado em 23/09; Pages e CI passaram no PR #23 e na `main`.
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

### Roteiro da restauração com dados reais (T-B6)

Pronto para executar assim que o conteúdo real estiver cadastrado, com a capa.
A ferramenta já existe e já passou com o pacote vazio (15/09, ~40 s); falta a
prova com dados de usuário e **objetos do Storage**, cujo laço de cópia ainda
não rodou com nenhum objeto.

1. **Captura.** Esperar o backup diário seguinte ao cadastro (04:23 de
   Brasília) e conferir no GitHub Actions que ele passou. Rodar
   `npm run backup:remote` na hora exige aprovação (regra 1 do `AGENTS.md`).
2. **Download** do arquivo mais recente do R2, com as variáveis de
   `~/.config/chadbb/r2.env` carregadas sem exibir (`set -a; . arquivo; set +a`):
   `aws s3 ls s3://$R2_BUCKET/ --endpoint-url $R2_ENDPOINT --region auto` e
   `aws s3 cp s3://$R2_BUCKET/<arquivo> /tmp/ --endpoint-url $R2_ENDPOINT --region auto`.
3. **Restauração** em Supabase local descartável, com Docker ligado e o chaveiro
   em `~/.config/chadbb/backup-gnupg`:
   `npm run test:recovery:archive -- /tmp/<arquivo>`. Ao final ele imprime as
   contagens restauradas, `storageObjects` e os tempos.
4. **Conferência** antes de apagar o destino: `storageObjects` ≥ 1 e a capa
   com o mesmo SHA-256; contagens de eventos, itens, convites e reservas iguais
   às do painel no momento da captura.
5. **RTO.** Cronometrar do passo 2 ao fim do passo 4. O script mede só a
   restauração local; somar o tempo de reconfigurar o que o backup não leva
   (Auth/SMTP, segredos da Edge, Vault) para comparar com a meta de 2 h.
6. **Registro** em `docs/reviews/`: horário da captura, SHA-256 do cifrado,
   contagens, objetos, tempos e o que ficou fora. Nenhum dado pessoal no registro.

## Ensaio com a família

Roteiro para o irmão e um convidado, sem ajuda técnica, no celular de cada um.
Quem conduz só observa e anota onde a pessoa hesitou; não explica a tela.
Cada item marcado sem ajuda conta; item com ajuda vira ajuste a avaliar.

**Convidado** (link recebido pelo WhatsApp, aberto no navegador do próprio WhatsApp):

- [ ] Abrir o link e entender de quem é o chá, quando e onde.
- [ ] Responder “Vai participar” com o número de pessoas e confirmar.
- [ ] Escolher fraldas de um tamanho com mais de um pacote.
- [ ] Escolher fraldas de outro tamanho.
- [ ] Trocar o tamanho de uma das escolhas.
- [ ] Adicionar um mimo com quantidade.
- [ ] Marcar “Já comprei” em uma escolha.
- [ ] Cancelar uma escolha.
- [ ] Sair do WhatsApp, voltar ao convite e encontrar tudo como deixou.
- [ ] Com o modo avião ligado, tentar escolher algo e ver o aviso de conexão;
      desligar e conferir que nada foi reservado em dobro.
- [ ] Reabrir o link pelo WhatsApp e continuar.
- [ ] Aumentar o texto do celular e conferir que nada corta.

**Organizador** (o irmão, no painel):

- [ ] Achar a resposta e as escolhas do convidado no painel.
- [ ] Conferir os totais de pessoas e de pacotes por tamanho.
- [ ] Ver o mimo e a compra informada separados das reservas.

O ensaio automatizado já cobre 320 px com texto a 200%, desktop e celular,
jornadas só com teclado, axe, falha de resposta depois do commit e concorrência
de banco. Ficam para o ensaio real: o navegador interno do WhatsApp, o celular
real e o leitor de tela.

## Instruções curtas para o organizador

Na ordem em que as coisas acontecem. Os nomes entre aspas são os botões da tela.

1. **Entrar.** Informe o e-mail, toque em “Receber código de acesso” e digite
   no site o código de 8 dígitos que chegar.
2. **Criar o evento.** Em “Seus eventos”, dê o nome e toque em “Criar evento”.
3. **Dados do evento.** Preencha início às 12h e término (sempre horário de
   Brasília), endereço privado e instruções aos convidados. Escreva nas
   instruções o prazo de confirmação (**18/10**): o site não encerra as
   respostas sozinho. A capa é opcional e só entra com imagem autorizada.
   Toque em “Salvar alterações”.
4. **Conferir e publicar.** “Ver prévia” mostra o convite como o convidado vê.
   Estando certo, “Publicar evento”. Convites só podem ser criados depois disso.
5. **Lista de presentes.** Em “Presentes”, “Comece com a lista pronta do chá”
   inclui os quatro tamanhos de fralda e mimos sugeridos. Ajuste antes a
   quantidade de pacotes de cada tamanho (os números vêm só como sugestão);
   mimos não têm limite.
6. **Convites.** Em “Convidados”, “Convidar alguém”: um convite por pessoa ou
   família, com o limite de pessoas. Toque em “Copiar convite” e envie pelo
   WhatsApp, **um por vez**. O link só aparece nessa hora: se perder, use
   “Reemitir link” (o antigo para de funcionar; respostas e escolhas ficam).
   Não publique lista de links ou nomes.
7. **Etapas.** A barra no rodapé mostra o que falta; “Concluí…” marca a etapa.
8. **Acompanhar.** O painel se atualiza sozinho. Uma edição de convite feita
   com a tela antiga pode conflitar com uma resposta recém-chegada: se o site
   avisar, confira o painel antes de salvar de novo.

Situações comuns:

- **Link compartilhado com quem não devia:** “Revogar acesso” ou “Reemitir link”.
- **Convidado não sabe se a reserva foi:** se a conexão caiu no meio, o próprio
  convite oferece “Verificar tentativa anterior”; ao reabrir o link, a escolha
  aparece no cartão se tiver sido feita. Falha de conexão não é cancelamento.
- **“Compra informada”** é só uma declaração do convidado; o site não recebe
  pagamento nem confere a compra. Depois dela a quantidade não muda: para
  corrigir, o convidado cancela e escolhe de novo.
- **Encerrar o evento** bloqueia novas respostas e reservas e **não tem volta**.
  Use só depois do chá.
- **Mudou a data?** Edite em “Dados do evento”; a validade dos convites
  acompanha sozinha (novo início + 7 dias).

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
apenas no ambiente autorizado, fora do repositório. O registro original de
projeto vazio é histórico: Auth/SMTP e login foram validados em 16/09, e
R2/R3 e T-B7 foram publicados em 22/09. Evidências em
`reviews/2026-09-22-t-b7.md` e `reviews/2026-09-23-t-b6.md`.
Suporte técnico, do envio dos
convites ao dia do evento: Leonardo Martins (solicitante).
