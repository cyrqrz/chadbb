# T-B1 — SMTP Resend e login do organizador

Preparado em 2026-09-16. Configuração remota consultada somente por GET;
SMTP aplicado após aprovação explícita do titular. Projeto exclusivo:
`chadbb-cha` (`fcykqrlnofmdtmewlejr`).

## G1 — Pré-requisitos e conferência, sem escrita

- Usuário decidiu assumir como organizador usando sua própria conta Resend
  (2026-09-16), substituindo a dependência da conta do irmão.
- Chave disponível em `~/.config/chadbb/resend-api-key`, modo 600, ou inserida
  diretamente pelo titular no painel. Nunca colar chave no chat ou no Git.
- Conferir no painel Auth os valores atuais de SMTP, Site URL, redirects e
  template de magic link. Registrar apenas valores públicos; senha omitida.
- Evidência para liberar G2: conta confirmada, chave disponível e comparação
  dos valores atuais com a proposta abaixo. Arquivo da chave conferido: existe,
  não vazio, modo 600; conteúdo não exibido.
- GET da configuração Auth confirmou: campos SMTP nulos e senha não configurada;
  login por e-mail habilitado; Site URL e callback já iguais à proposta;
  template magic link contém `{{ .ConfirmationURL }}`. G1 concluído.

## G2 — Aprovação da alteração remota

Proposta concreta para Authentication > Email > SMTP Settings:

| Campo | Valor proposto |
|---|---|
| Custom SMTP | habilitado |
| Host | `smtp.resend.com` |
| Porta | `465` (TLS) |
| Usuário | `resend` |
| Senha | chave Resend, omitida |
| Sender email | `onboarding@resend.dev` |
| Sender name | `Chá da Liz` |
| Site URL | `https://chadbb.pages.dev` |
| Redirect autorizado | `https://chadbb.pages.dev/auth/callback` |

Preservar redirects existentes; acrescentar somente o callback exato se faltar.
Diff efetivo de G2: preencher os seis campos SMTP (host, porta, usuário, senha,
sender email e sender name), atualmente ausentes. URLs e template já estão
corretos e não precisam de alteração.

G2 concluído em 2026-09-16: titular aprovou a aplicação; PATCH retornou HTTP
200 e GET posterior confirmou host, porta, usuário, remetente e nome.
Senha enviada a partir do arquivo protegido, sem exibição. Site URL, callback
e template de confirmação preservados. Entrega e login ainda não comprovados.
Conferir se o template usa o link de confirmação do Auth; qualquer mudança no
template ou nos limites exige incluir o diff na proposta antes da aprovação.
Não há migration, deploy de função, Vault ou variável de frontend nesta ação.

**Parar antes de salvar.** Após G1, apresentar o diff público efetivo e obter
aprovação explícita do usuário. A proposta acima não é leitura do estado atual.
Depois de salvar, reler os campos públicos e registrar sucesso/erro sem segredo.
Se for necessário reverter, apresentar os valores anteriores e pedir aprovação
antes de nova escrita; não recuperar nem imprimir senha pelo log.

## G3 — Aprovação do login real e aceite

Na primeira tentativa, o titular encontrou configuração pública inválida antes
do envio. Inspeção do bundle `index-D6A6sH9i.js` e GET do Pages confirmaram
`│ ` antes da URL e um espaço antes da publishable key em Production.
Preview estava correto. Após aprovação explícita, as duas variáveis de
Production foram corrigidas e relidas, preservando Preview. Rebuild da mesma
versão da main (`d988a39cfc9b1b155564e03a8923e947d5c4347b`) solicitado:
deploy `9258b769-5838-40cd-b40a-07d0556bfaf3`.
Deploy concluído com sucesso às 11:57:22 UTC. Bundle de produção
`index-DN-er6fl.js` conferido: URL exata e publishable key com formato válido.
Playwright contra `/entrar` confirmou ausência da mensagem de configuração
inválida e presença do campo de e-mail e botão de envio. Nenhum e-mail enviado
pela automação. Login e entrega continuam dependendo da tentativa do titular.

Atualização em 2026-09-16: titular confirmou recebimento do e-mail e login real
bem-sucedido, chegando à tela de criação. Entrega e acesso autenticado comprovados
pelo titular. Persistência após recarregar, logout e proteção da rota após sair
ainda aguardam confirmação; não há diagnóstico confirmado para a primeira
tentativa que retornou à tela de entrada.

G3 concluído em 2026-09-16: após executar o roteiro, o titular confirmou que
funcionou. Validados login real, persistência ao recarregar, logout e retorno à
tela de entrada ao tentar acessar `/eventos` sem sessão. T-B1 concluída.

Depois da evidência de G2, obter autorização para solicitar um magic link ao
organizador (pode criar usuário/sessão no Auth e envia e-mail real).
O titular abre `/entrar`, solicita um link e o abre no mesmo navegador/perfil.
Conferir recebimento, callback sem erro, chegada a `/eventos`, persistência após
recarregar, logout e bloqueio de `/eventos` após sair. Não cadastrar evento de
teste nessa conta. Não registrar endereço pessoal, link, código ou token.

Evidência de conclusão: horário, entrega confirmada pelo organizador e resultado
de cada etapa. Resposta HTTP de envio sozinha não comprova login.

## Fontes e limite do piloto

- [SMTP Resend](https://resend.com/docs/send-with-smtp): host, porta e credenciais.
- [Restrição resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain):
  domínio de testes, entrega somente ao endereço associado à conta Resend.
- [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- [Redirects do Auth](https://supabase.com/docs/guides/auth/redirect-urls).

O piloto mantém a decisão registrada em `PROXIMOS-PASSOS-M6.md`: apenas um
organizador recebe e-mail. Entrega a outros endereços requer domínio verificado.
O callback proposto vem de `src/features/auth/LoginPage.tsx`.

## Trabalho local durante a espera — T-B2

Completar a cobertura M3 no Postgres descartável de `test:db:portable`, com
dados fictícios, sem reset da stack compartilhada e sem acesso remoto.
Revisar isolamento entre convites/eventos, revogação, expiração, reabertura e
contagem ao mudar RSVP. Registrar resultados em `TAREFAS-AGENTES.md`.
