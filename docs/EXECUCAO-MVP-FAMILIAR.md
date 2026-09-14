# Execução do MVP familiar

Início: 2026-09-11. Autorização: planejar e executar o caminho do MVP.
Escopo vigente: fraldas P 6 / M 19 / G 19 / XG 6 pacotes; mimos sem limite;
convites individuais e familiares; presença e painel atualizados.

## Ordem de execução

1. Consolidar alterações existentes e concluir catálogo/lista em duas categorias.
2. Implementar convites, sessão de convidados e presença individual/familiar.
3. Implementar reservas e cancelamentos transacionais, com quantidades independentes.
4. Integrar páginas do convidado e painel, com acessibilidade e atualização periódica.
5. Validar banco, API, navegador e registrar resultados e bloqueios de implantação.

A aplicação será validada localmente com dados fictícios. A entrega externa ainda
exige configuração do ambiente do evento, e-mail e ensaio
com a família. Não considerar a liberação concluída apenas com testes locais.

## Continuação — 2026-09-14

Chá de bebê da Liz em **01/11/2026 às 12h**, horário de Brasília; confirmação
solicitada no convite até **18/10/2026**. Endereço, telefone e instruções foram
extraídos da imagem recebida e preparados em arquivo privado fora da árvore do
projeto, sem publicar a imagem original como capa. Ela contém dados privados e
uma indicação fixa de tamanho que não corresponde à seleção dinâmica do site.
Suporte técnico: Leonardo Martins (solicitante).

Regra esclarecida: os limites P 6 / M 19 / G 19 / XG 6 são globais por tamanho,
para equilibrar os pacotes. Não há cota comercial adicional por convite. Mimos
continuam opcionais conforme as decisões expressas na conversa. A confirmação
até 18/10 está registrada no conteúdo; não existe bloqueio automático por essa
data no schema atual (o encerramento continua sendo ação do organizador).

Avanço M4: testes adicionais comprovam todos os tamanhos no mesmo convite,
esgotamento compartilhado, cancelamento idempotente concorrente, reserva contra
redução de cota e reserva contra encerramento. PostgreSQL portátil: 46 testes.

Avanço M5: abertura de outro convite na mesma aba agora troca a sessão e ignora
resposta anterior atrasada; o fragmento inválido limpa a apresentação anterior.
A promessa fica na montagem da página, sem cache global de credenciais. O link
de pular para o conteúdo continua funcionando. Ensaio de resposta HTTP perdida
após commit confirma recuperação usando a mesma chave, sem duplicação.

Paleta rosa inspirada no convite; ajuste de quebra de texto, espaçamento de
cartões e largura mínima para 320 px com fonte a 200%. Testes automatizados de
teclado e axe nas áreas Presença, Fraldas e Mimos. Essas verificações não substituem
leitor de tela manual, navegador interno do WhatsApp ou aceite do irmão.

Validação local deste avanço: `npm run check` (40 testes unitários), 46 testes
PostgreSQL portátil, seis cenários de navegador real e 16 E2E aprovados.

Próxima etapa M6: seguir o [roteiro de entrega](ENTREGA-E-SUPORTE.md), com ambiente
separado, login real por e-mail, restauração e ensaio com a família. Nenhum dado
real foi cadastrado/publicado e nenhum banco remoto foi alterado neste avanço.

Projeto remoto criado em 2026-09-14: **chadbb-cha**, ref `fcykqrlnofmdtmewlejr`,
organização `chadbb` (`zfzzahtvvtmuogmatolo`), região **São Paulo (`sa-east-1`)**,
exclusivo do chá e separado de desenvolvimento e preview. A senha do banco fica
apenas na máquina do titular, fora do repositório. Nenhuma migration, função ou
configuração de Auth foi aplicada ainda. Suporte técnico, do envio dos
convites ao dia do evento: Leonardo Martins (solicitante).

## Implantação no chadbb-cha — 2026-09-15

Projeto `chadbb-cha` (ref `fcykqrlnofmdtmewlejr`, `sa-east-1`). Cada etapa só foi
executada após aprovação manual (gates G1, G2 e G3). Nenhum valor de segredo foi
exibido nem registrado.

**G1, local:** `npm run check` (40), `test:db:portable` (52), `test:e2e` (16).
Após `db:reset`: pgTAP (50), `test:api` (13, incluindo a Edge Function `retention`),
`test:browser:local` (6) e `test:email:local` (1). Commit `6324e8b` no PR #1, com CI
verde nos jobs `frontend` e `database`.

**G2, remoto:**
- `db push --dry-run`: 19 migrations, sem seeds e sem roles. A lista confere
  arquivo por arquivo com o repositório.
- `db push`: 19/19 aplicadas. O `migration list` remoto é idêntico ao local.
  Nenhum vínculo local foi criado (`--project-ref`, sem `supabase link`).
- Segredos da função: `GUEST_ALLOWED_ORIGINS` (somente `https://chadbb.pages.dev`)
  e `RETENTION_CRON_SECRET`, configurados por env-file temporário já removido.
- Vault: `project_url` e `retention_cron_secret`.
- Funções `guest` e `retention` publicadas: `ACTIVE`, `verify_jwt=false`.
- Cron: somente `personal-data-retention` (`17 6 * * *`); a função
  `cleanup_guest_data` não existe.

**G3, smoke remoto (`npm run test:smoke:remote`): 6/6 aprovados.**
1. `guest`: CORS apenas para `https://chadbb.pages.dev`; origens da branch e de
   terceiros recebem 403; GET recebe 405.
2. Fluxo completo com dados fictícios: organizador, evento com término, lista de
   27 itens, publicação, convite, troca de token (`no-store`, sem `owner_id` e
   `token_hash`), leitura, RSVP, reserva com repetição idempotente, painel e
   cancelamento.
3. Revogação encerra a sessão existente (401).
4. Anon não lê reservas, a auditoria nem as funções de retenção.
5. `retention` sem segredo recebe 401; com segredo recebe 200 e não apaga o evento
   que não venceu.
6. Cron com somente o job de 30 dias.

Conexão ao banco pelo pooler de sessão, com TLS `verify-full` contra a CA oficial
"Supabase Root 2021 CA". A primeira tentativa, sem essa CA, foi recusada na conexão
antes de criar qualquer dado; o banco foi conferido e estava vazio.

Zero sobras, conferido pelo `finally` do smoke e depois por contagem global
independente: usuários, eventos, itens, convites, sessões, reservas, pedidos,
`guest_rate`, auditoria e objetos de Storage estão em 0. Os 27 produtos do
catálogo permanecem, pois vêm da migration.

Pendente para a entrega: apontar o frontend do Pages para o `chadbb-cha`,
configurar o Auth remoto (site URL, callback e SMTP), ensaiar backup e
restauração e fazer o ensaio no WhatsApp.
