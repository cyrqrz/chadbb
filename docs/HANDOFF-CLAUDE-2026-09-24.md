# Retomada — 24/09/2026 (para continuar no PC pessoal)

Branch de trabalho: `clone-main`. Começar com `git pull` e ler este arquivo.

## Atualização em 30/09/2026 — Codex

Esta seção atualiza o estado histórico abaixo.

- PR #31 mergeado em 24/09; `main` e `clone-main` alinhadas em `6718b06`.
- Titular confirmou domínio `chadbb.online` como **Verified** no Resend.
- Cron `rsvp-reminders` conferido diretamente no banco: ativo, a cada 15
  minutos; execuções de 11:00, 11:15 e 11:30 UTC de 30/09 com `succeeded`.
- Smoke remoto autorizado pelo titular: convite fictício com “Talvez” e
  destinatário de teste `delivered@resend.dev`. Edge publicada retornou 401 sem
  segredo e, com segredo, 200 com `claimed=1`, `sent=1`, `failed=0` e
  `rejected=0`. Banco registrou aceite às 11:38:27 UTC e prazo de três dias.
  Segunda chamada enviou zero mensagens, sem alterar aceite ou tentativas.
  Vencimento simulado apenas nesse convite converteu a resposta para `no` e
  removeu o contato. Organizador, evento, convite e fila fictícios removidos;
  contagens finais dos IDs criados iguais a zero.
- Limite do smoke: destinatário de teste não comprova caixa postal humana.
  Consulta ao histórico do Resend com a chave local retornou 401; a credencial
  usada pela Edge funcionou. Não houve rotação de segredos.
- Backups: captura de 27/09 falhou na etapa `dump roles`, antes da publicação
  no R2. Log não informa a causa específica (diagnóstico detalhado desativado).
  Execuções de 28 e 29/09 passaram, incluindo publicação/verificação no R2.
  Saúde da produção passou em 30/09 às 11:43 UTC. A sequência não foi contínua;
  resta acompanhar recorrência e realizar restauração com conteúdo real.
  Evidências: [falha de 27/09](https://github.com/cyrqrz/chadbb/actions/runs/36321378918),
  [backup de 29/09](https://github.com/cyrqrz/chadbb/actions/runs/36580559658),
  [saúde de 30/09](https://github.com/cyrqrz/chadbb/actions/runs/36710295039).
- Titular informou que o evento ainda contém dados de teste. Cadastro do
  conteúdo real, restauração com dados/Storage reais e ensaio familiar seguem
  pendentes. Avisos de painel implementados localmente em 30/09, aguardando
  publicação (ver quadro de tarefas). Entrevista de produto continua aberta.

## Em produção (chadbb-cha, domínio chadbb.online)

- Migrations até `20260924020000_rsvp_reminders_fixes.sql` aplicadas (29/29 iguais).
- Edge `guest` e `rsvp-reminders` publicadas. Segredos da Edge configurados:
  `RSVP_CRON_SECRET`, `RSVP_RESEND_API_KEY`, `RSVP_EMAIL_FROM`
  (`chadbb <lembretes@chadbb.online>`). Vault: `rsvp_cron_secret`.
- Cron `rsvp-reminders` ativo (`*/15 * * * *`). Teste: sem segredo 401; com
  segredo 200 e contagens zeradas; envio de teste do remetente para
  `delivered@resend.dev` aceito (200).
- Front de `main` = commit do PR #30 (lista pronta ajustável).

## Pendente

1. **PR `clone-main` → `main`** com as correções de tela do commit `62b8cc8`
   (aviso de Talvez só para quem não respondeu, CSS de Quando/Onde, contraste do
   "!"). Checagem local: 511 e2e, banco 92/92, API 27/27, 68 unitários. Depois do
   merge, alinhar `clone-main` com `main` (fast-forward) e deixar só as duas branches.
2. **Primeira execução do cron:** conferir `cron.job_run_details` do job
   `rsvp-reminders` (só status, sem conteúdo) depois de alguns ciclos.
3. **DNS:** DKIM e DMARC de chadbb.online publicados; SPF/MX em `send.chadbb.online`
   não encontrados. O envio de teste foi aceito; confirmar no painel do Resend que
   o domínio está "Verified".
4. **Texto das instruções do evento real:** não escrever "confirme até 18/10";
   o Talvez fecha 10 dias antes e dá 3 dias após o lembrete.
5. **Entrevista de produto** (`/grill-produto`, em `.claude/skills/`): em aberto
   se só chá de bebê, catálogo curado vs. painel admin, co-organizador e
   sustentabilidade. A lista de fraldas já é ajustável por evento.
6. **T-B6:** restauração com dados e Storage reais e medição do RTO (depende do
   conteúdo real).
7. Sugestões da revisão ainda não feitas: painel mostrar "Não poderá ir
   (automático)" e contagem de lembretes pendentes/presos, sem e-mail.

## Segredos (nunca no Git)

Ficam em `~/.config/chadbb/` desta máquina, chmod 600. Novo hoje:
`rsvp-cron-secret`. Para o PC pessoal, copiar a pasta por meio seguro (ver
`TROCA-DE-MAQUINA.md`). O vínculo `supabase link` fica em `supabase/.temp/`
(ignorado); no PC novo refazer com `npx supabase link --project-ref
fcykqrlnofmdtmewlejr` usando a senha do banco guardada, sem imprimi-la.
