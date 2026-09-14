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
5. Conferir execução do job `guest-data-retention` e disponibilidade das páginas.
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

O job técnico elimina pedidos antigos após 90 dias e sessões expiradas. Isso não
exclui, sozinho, nomes dos convites, respostas, reservas, evento ou imagens.
Antes da entrega, definir com o responsável a execução da exclusão de dados pessoais
90 dias após o evento, o tratamento dos objetos Storage e o prazo de retenção das
cópias de backup. Não declarar exclusão concluída enquanto cópias recuperáveis
permanecerem fora do procedimento acordado.

## Pendências para liberar o envio dos convites

- Projeto e credenciais de operação disponíveis no ambiente autorizado.
- Ambiente do evento configurado e testado, inclusive e-mail.
- Backup/restauração executados e metas de recuperação registradas.
- Procedimento de exclusão definido (suporte técnico já definido: Leonardo Martins (solicitante)).
- Conteúdo cadastrado e aprovado pelo irmão.
- Ensaio no WhatsApp e no celular real aprovado pela família.

Projeto remoto criado em 2026-09-14: **chadbb-cha**, ref `fcykqrlnofmdtmewlejr`,
organização `chadbb` (`zfzzahtvvtmuogmatolo`), região **São Paulo (`sa-east-1`)**,
exclusivo do chá e separado de desenvolvimento e preview. A senha do banco fica
apenas na máquina do titular, fora do repositório. Nenhuma migration, função ou
configuração de Auth foi aplicada ainda. Suporte técnico, do envio dos
convites ao dia do evento: Leonardo Martins (solicitante).
