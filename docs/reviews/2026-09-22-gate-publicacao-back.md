# Gate de publicação — R2/R3 e T-B7

22/09/2026. Commits autorizados pelo titular: R2/R3 `0437b79` e T-B7
`8a0ab00`, na `clone-main`. Sem push nesta sessão.

## G1 — código e validação portátil

- R2/R3: identidade de mimos na inclusão e serialização das mutações da lista.
- T-B7: resumo, saldos e identificadores adicionais nas projeções do servidor.
- PostgreSQL portátil: 78/78; `npm run check`: lint, tipos, 51 unitários e build.
- Revisões independentes do `tdd_senior` concluídas, sem achados remanescentes.
- Detalhes: `2026-09-22-r2-r3.md` e `2026-09-22-t-b7.md` nesta pasta.

## G2 — stack Supabase local

A integração Docker/Ubuntu-24.04 já estava configurada, mas o Docker Desktop
estava parado. Aplicativo iniciado; Kong e Vector locais reiniciados.
Banco existente preservado, sem reset. `migration up --local` aplicou só:

- `20260922000000_list_identity_and_lock_order.sql`
- `20260922010000_dashboard_server_summary.sql`

`npm run db:test`: **8 arquivos / 153 testes, PASS**. API e navegador em validação.
A indisponibilidade de Docker registrada nos relatórios anteriores foi resolvida
nesta sessão; esses registros descrevem a evidência disponível quando escritos.

## G3 — dry-run remoto

Executado:

```sh
npx supabase db push --dry-run --skip-vault --project-ref fcykqrlnofmdtmewlejr
```

Saída: `dryRun: true`, `upToDate: false`, somente as duas migrations acima;
`seeds: []`, `roles: []`. Nenhuma migration aplicada; Vault explicitamente
ignorado. Sem `link`, `--linked` ou `--db-url`.

## G4 — aplicação pendente de aprovação

Após aprovação específica do titular, comando proposto:

```sh
npx supabase db push --skip-vault --project-ref fcykqrlnofmdtmewlejr
```

Conferir novamente o dry-run se surgirem migrations novas. Depois da aplicação,
comparar histórico remoto/local por leitura. Não é necessário deploy de Edge:
os novos campos vêm das funções SQL existentes. Smoke com escrita remota é um
gate separado. Claude deve retirar os fallbacks do front só depois da publicação
do banco. Não há autorização para aplicar contida neste documento.
