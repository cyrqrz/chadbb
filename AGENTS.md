# Contexto para agentes (Claude e Codex)

Leia este arquivo antes de qualquer tarefa. Ele vale para os dois agentes.

## Projeto

MVP para o chá de bebê da Liz: **01/11/2026, 12h (Brasília)**, cerca de 50
convidados. A confirmação de presença vai até **18/10/2026**. As prioridades são
uso simples no celular, design profissional, acessibilidade e dados confiáveis.
Suporte técnico: o próprio usuário. Ele escreve em português; responda em português.

- Stack: React + Vite + Tailwind + TanStack Query no front; Supabase (Postgres,
  Auth, Storage, Edge Functions) no back; Cloudflare Pages para hospedagem
  (`https://chadbb.pages.dev`). Arquitetura: `docs/ADR-001-arquitetura-mvp-eventos-presentes.md`.
- Ponto de retomada: `docs/TROCA-DE-MAQUINA.md` (mais recente) e
  `docs/PROXIMOS-PASSOS-M6.md`. `docs/OPERACAO-M6.md` tem o histórico.
- SMTP Resend e login real validados em 2026-09-16. Próximo gate do back:
  medição remota T-B5; ver `docs/PLANO-DESEMPENHO-T-B5.md`.

## Início de sessão do Codex

Ao abrir uma sessão nova neste clone, sem outra tarefa pedida, o Codex lê
`docs/TROCA-DE-MAQUINA.md` (seção de retomada mais recente) e
`docs/TAREFAS-AGENTES.md`, resume em poucas linhas onde parou e propõe o próximo
passo. Nada destrutivo ou remoto roda sem aprovação (ver Regras obrigatórias).

## Divisão de trabalho

**Desde 2026-09-21 existem só duas branches: `main` e `clone-main`.** As antigas
`claude/front` e `codex/back` foram unificadas na `clone-main` e apagadas.

**Desde 2026-09-22, também não há mais clone por agente.** Os dois trabalham
na mesma pasta de trabalho (a que este `AGENTS.md` está, hoje
`/mnt/c/Users/leonardo.martins/chadbb`), sempre na `clone-main`. As entradas
antigas neste documento e no quadro citando `~/projetos/chadbb-claude` e
`~/projetos/chadbb-codex` são históricas; não valem mais. Nenhum dos dois
altera a pasta `~/projetos/chadbb`, que fica na `main` e é só do usuário.

| Agente | Responsável por |
|---|---|
| **Claude** | Front: `src/`, `public/`, `index.html`, estilos, acessibilidade, testes de navegador (`tests/browser`, e2e) |
| **Codex** | Back e tarefas mais difíceis: `supabase/` (migrations, functions, testes pgTAP), `functions/`, `scripts/`, `.github/workflows/`, testes de banco/API |

- A divisão por **área de arquivo continua valendo**, e agora é a única coisa que
  separa os dois: um agente não altera arquivos da área do outro. Se o front
  precisar mudar um contrato (RPC, tabela, payload de função), registre o pedido
  em `docs/TAREFAS-AGENTES.md`. O contrato vigente fica em
  `docs/CONTRATOS-TRANSACIONAIS.md`.
- **Com uma branch só, os dois escrevem no mesmo lugar.** Antes de começar,
  `git pull` na `clone-main`; antes de commitar, `git pull --rebase`. Commits
  pequenos e por área reduzem o atrito. Um trabalho longo que mexa em muita coisa
  merece uma branch temporária a partir da `clone-main`, avisada no quadro.
- A integração com a `main` é feita por PR de `clone-main` → `main`; quem faz o
  merge é o usuário.
- Os agentes não se veem em tempo real. A comunicação entre eles passa por
  commits e por `docs/TAREFAS-AGENTES.md`.

## Apoio de qualidade — `tdd_senior`

Por solicitação do usuário em 2026-09-16, o Codex conta com um subagente
especialista sênior em TDD e testes, definido em `.codex/agents/tdd-senior.toml`.
Ele apoia o Codex neste clone; não é um terceiro dono de branch nem substitui
a divisão com o Claude. Herda o modelo e as permissões da sessão principal.

- Delegue a ele uma subtarefa independente de revisão/testes em mudanças de
  regras de negócio, permissões, concorrência, retenção ou runners remotos.
- Em funcionalidade nova ou bug, prefira teste que falha antes da correção,
  seguido da implementação mínima e regressão. Em código existente, faça revisão
  e testes de regressão sem apresentar isso como TDD retroativo.
- O padrão é revisão sem edição; escrita somente em arquivos de testes
  explicitamente atribuídos da área do Codex. Achados de front vão ao quadro
  do Claude. Coordenar uso de Docker, portas e dados; não disputar a mesma stack.
- Alterações triviais de texto/estilo não exigem esse agente. Acione um agente
  por subtarefa útil, evitando duplicação da suíte ou testes sem valor.
- O Codex principal integra o parecer e conserva os gates. O especialista não
  autoriza escrita remota, reset, commit, push ou deploy.

Formato do perfil: [documentação oficial de subagentes](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Ambiente compartilhado

- Os dois clones usam o mesmo Docker. **O Supabase local (`npm run db:start`)
  roda só no clone do Codex.** O front usa essa stack pelo `.env.local`
  (`127.0.0.1:54321`).
- Vite na porta 5173. Os testes de navegador e de e-mail exigem essa porta
  livre; pare o `npm run dev` do outro clone antes de rodá-los.
- Node 22 (`.nvmrc`). Use `npm ci`, sem misturar com o npm do Windows.

## Comandos

```sh
npm run dev      # front local
npm run check    # lint + typecheck + testes + build: rodar antes de todo PR
npm run test:e2e # Playwright com backend simulado (não precisa de Docker)
```

Os demais comandos (`db:*`, `test:api`, `test:browser:local` etc.) estão no
`README.md`.

## Regras obrigatórias

1. **Aprovação manual antes de qualquer passo destrutivo ou remoto.** Pare e
   mostre o diff ou a saída de dry-run antes de: `db:reset` local, `db push`,
   `secrets set`, Vault, `functions deploy`, smoke tests remotos,
   `backup:remote` e qualquer escrita no projeto `chadbb-cha`
   (ref `fcykqrlnofmdtmewlejr`). Commit e push só depois de o usuário revisar o diff.
2. **Nunca usar `supabase link`, `--linked` ou `--db-url`** contra produção nos scripts.
3. **Segredos** ficam em `~/.config/chadbb/` (chmod 600), fora do Git. Nunca
   exiba em saída, log, diff ou docs: senha do banco, service_role/secret key,
   `RETENTION_CRON_SECRET`, conteúdo do Vault, `r2.env`. Leia sem `echo`.
4. No front, só as variáveis públicas `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca uma chave secreta.
5. **LGPD:** a auditoria guarda só contagens técnicas. Nenhuma pessoa ou evento
   real em testes; os testes criam e removem dados fictícios.
6. **Regra de negócio com uma única fonte** (ex.: `private.retention_due_at`).
   O front não recalcula prazos.
7. **Dados sempre atualizados:** as telas reconsultam o servidor. Nunca apresente
   cache como dado novo, e nunca sobrescreva o que o usuário está digitando.
8. Planos devem nomear os gates (G1, G2...) e trazer evidências antes de cada aprovação.
