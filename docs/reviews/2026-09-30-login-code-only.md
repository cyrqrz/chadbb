# Retomada de 30/09 — fraldas e acesso por código

Base local: `clone-main`, `898ec1f`. Os dois conjuntos de alterações deixados
pelo Claude foram preservados. Nenhum reset ou checkout.

## G1 — Validação local

- Node 22.23.2; Supabase local ativo em `127.0.0.1:54321`, Mailpit em
  `127.0.0.1:54324`; status consultado com saída filtrada, sem chaves.
- Porta 5173 livre antes do ensaio.
- `node --test tests/local/email-code.test.mjs`: **1/1 passou**. Modelo em
  português sem link, código errado recusado, código aceito em cliente
  independente e reutilização recusada.
- `npm run test:email:local`: **1/1 passou**. Código recebido no Mailpit,
  entrada pela interface, sessão após recarregar, logout e proteção de rota.
  Os testes removem os usuários e mensagens fictícios criados.
- Revisão independente `tdd_senior`: sem defeito funcional no diff. Comentários
  dos testes ajustados para registrar o domínio do link como possível causa de
  spam, não como diagnóstico comprovado.
- `npm run check` nesta retomada: **aprovado**, incluindo lint, tipos,
  **8 arquivos / 68 testes** e build de produção. `git diff --check` aprovado.
- Evidências herdadas do Claude, informadas pelo titular: RED dos testes novos;
  e2e de fraldas **44/44**, e2e de login **60/60** e `npm run check` aprovado.
  Esses e2e não foram repetidos nesta retomada.

## G2 — Revisão antes de commit e PR

Separar fraldas (componente e teste QA) de acesso por código (tela, modelo e
testes). O inventário DNS em `ENTREGA-E-SUPORTE.md` registra os nomes que devem
ser preservados, os destinos conhecidos do handoff e os valores ainda a
conferir nos painéis; não houve consulta nem alteração da zona DNS.

G2 autorizado pelo titular nesta retomada. Sincronização com
`git pull --rebase --autostash origin clone-main`: já atualizado; alterações
locais preservadas. Fraldas publicado no commit `d287bc7`,
[PR #38](https://github.com/cyrqrz/chadbb/pull/38), contendo apenas o componente
e o teste QA. Correção textual de Mimos publicada em `0a10a73`, com lint e
diff conferidos. PR #38 mergeado pelo titular; `clone-main` atualizada por
fast-forward para `a4e0d6a`. Login no commit `891b136`; documentação em commit
separado para o PR seguinte, mantendo a separação do PR de presentes.
PR #39 mergeado por autorização explícita do titular, após todos os checks
aprovados. `clone-main` sincronizada por fast-forward com `main` em `a8f182b`.
Check Cloudflare Pages desse commit concluído com sucesso: publicação confirmada.

## G3 — Prévia de modelos do Auth

Executado `node scripts/auth/email-templates.mjs` (somente leitura autorizada
na retomada). Projeto `fcykqrlnofmdtmewlejr`: código de **8 dígitos**, validade
**3600 segundos**. Assuntos dos dois modelos permanecem iguais.

| Campo | Atual | Proposto |
|---|---|---|
| `mailer_templates_magic_link_content` | 1276 caracteres; SHA-256 prefixo `f7a2d46df7f0`; Token e ConfirmationURL | 986 caracteres; SHA-256 prefixo `2377935a3739`; somente Token |
| `mailer_templates_confirmation_content` | 1276 caracteres; SHA-256 prefixo `f7a2d46df7f0`; Token e ConfirmationURL | 986 caracteres; SHA-256 prefixo `2377935a3739`; somente Token |

Resultado inicial: **“Prévia: nada foi alterado.”** Após a abertura do PR #39,
o titular autorizou explicitamente o G3. Duas tentativas do comando abaixo
foram recusadas pela API com **HTTP 544**. A releitura após cada tentativa
confirmou os modelos antigos (prefixo SHA-256 `f7a2d46df7f0`, com Token e
ConfirmationURL); nenhum dos dois conteúdos havia sido atualizado. O Supabase
documenta [HTTP 544 como timeout do gateway](https://supabase.com/docs/guides/troubleshooting/http-status-codes).
A causa interna desse timeout não foi determinada.

Após o pedido do titular para resolver a falha, nova tentativa no mesmo endpoint,
com o mesmo PATCH dos dois conteúdos aprovados, recebeu **HTTP 200**. Releitura
independente com `node scripts/auth/email-templates.mjs`: **"Nada a alterar"**,
ambos os modelos com 986 caracteres, SHA-256 prefixo `2377935a3739`, somente
`{{ .Token }}`. Assuntos preservados; código de 8 dígitos e validade de 3600 s.
**G3 concluído.** Não foi necessário alterar o script. Comando de aplicação:

```sh
CHADBB_AUTH_REF=fcykqrlnofmdtmewlejr node scripts/auth/email-templates.mjs --apply
```

O titular testou no Hotmail após aplicar: mensagem ainda no lixo eletrônico.
Cabeçalhos fornecidos por ele: SPF, DKIM (incluindo `chadbb.online`), DMARC e
CompAuth aprovados; SCL 5. Não se reproduzem aqui identificadores da mensagem
ou dados pessoais. A autenticação passou, mas a causa específica da classificação
como spam não foi determinada; reputação do domínio permanece hipótese.

O titular decidiu manter a orientação para conferir o lixo eletrônico após
solicitar o código, já implementada e coberta por teste no PR #39:
"Confira a caixa de entrada e o lixo eletrônico (spam); pode levar alguns minutos."
Nenhuma alteração adicional de DNS ou de filtro da conta foi executada.
