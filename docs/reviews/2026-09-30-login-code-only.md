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
Os merges continuam com o titular.

## G3 — Prévia de modelos do Auth

Executado `node scripts/auth/email-templates.mjs` (somente leitura autorizada
na retomada). Projeto `fcykqrlnofmdtmewlejr`: código de **8 dígitos**, validade
**3600 segundos**. Assuntos dos dois modelos permanecem iguais.

| Campo | Atual | Proposto |
|---|---|---|
| `mailer_templates_magic_link_content` | 1276 caracteres; SHA-256 prefixo `f7a2d46df7f0`; Token e ConfirmationURL | 986 caracteres; SHA-256 prefixo `2377935a3739`; somente Token |
| `mailer_templates_confirmation_content` | 1276 caracteres; SHA-256 prefixo `f7a2d46df7f0`; Token e ConfirmationURL | 986 caracteres; SHA-256 prefixo `2377935a3739`; somente Token |

Resultado: **“Prévia: nada foi alterado.”** Aplicação pendente de aprovação
explícita, após os commits/PRs, na ordem solicitada:

```sh
CHADBB_AUTH_REF=fcykqrlnofmdtmewlejr node scripts/auth/email-templates.mjs --apply
```

Após aplicar, o titular solicita um código no Hotmail e informa a pasta de
entrega. Se continuar no lixo eletrônico, pedir apenas `Authentication-Results`
(SPF/DKIM/DMARC) e `X-MS-Exchange-Organization-SCL`. O Mailpit não comprova
entrega na caixa de entrada externa; reputação do domínio permanece hipótese.
