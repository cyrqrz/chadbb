# Validação local no PC pessoal — 2026-09-11

Supabase iniciado com Docker Desktop integrado ao Ubuntu/WSL. As quatro
migrations foram aplicadas em banco novo e o seed local foi executado.
Não foi necessário resetar um banco existente.

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Lint, TypeScript, 36 testes unitários e build aprovados |
| `npm run test:db:portable` | 19 testes aprovados, incluindo catálogo, lista e concorrência |
| `npm run db:test` | 21 testes pgTAP aprovados no Supabase local |
| `npm run test:api` | 3 testes aprovados com Auth, PostgREST e Storage reais |

Os testes de API criaram usuários fictícios com login por senha, verificaram
isolamento entre proprietários, criação/edição/publicação/encerramento de evento
e acesso a arquivos, incluindo rejeição por tipo e tamanho. A rotina de limpeza
dos testes foi executada. O Supabase foi mantido em execução para desenvolvimento.

A sessão WSL antiga não tinha o grupo `docker` carregado. Uma nova sessão passou
a reconhecer a associação já existente, sem alterar permissões do socket.
Foi necessário selecionar o Node Linux 22.23.2 no PATH dessa sessão para evitar
o npm do Windows. Após pgTAP, o encadeamento encontrou `uv_cwd`; executar o teste
de API em nova sessão com diretório explícito resolveu o problema.

Esta evidência complementa os registros anteriores. Ainda faltam ensaio do login
por link de e-mail/PKCE no navegador com backend real, testes de API do catálogo
e da lista, CI remota e preview. Playwright não foi reexecutado nesta validação.
O aceite completo da etapa 2 e a liberação do piloto permanecem pendentes.
