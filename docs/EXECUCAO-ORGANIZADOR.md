# Execução do organizador — 2026-09-09

Segunda entrega do plano. Engenharia: Codex, a partir da autorização para continuar
implementação e testes. O MVP completo e o piloto não estão liberados.

## Implementado

- Login por link de e-mail via Supabase Auth com PKCE, limpeza do callback,
  seleção do fluxo correto entre abas, logout e proteção das rotas.
- Listagem paginada, criação de rascunho, edição de dados públicos/privados,
  publicação com título/data futura e encerramento definitivo.
- Controle otimista por versão: edições concorrentes não sobrescrevem dados;
  a interface preserva o formulário local e oferece recarregar a versão salva.
- `events`, índices, RLS de leitura do proprietário e proibição de escrita direta.
  Escritas por RPC verificam `auth.uid()` e usam `search_path` fixo.
- Encerramento com `FOR UPDATE`, incompatível com o `FOR SHARE` previsto nas
  futuras reservas. Não há implementação de reservas nesta entrega.
- Buckets separados para imagens públicas e privadas, políticas por proprietário
  e evento, limite 5 MB, JPEG/PNG/WebP e proibição de substituição por upsert.
- Upload de capa com consentimento explícito sobre acesso público por link.
- Testes unitários, PostgreSQL portátil, navegador, pgTAP e API Supabase; CI ampliada.

P2.1, P2.3 e P2.4 estão implementados e verificados nas camadas disponíveis.
P2.2 e P2.5 têm implementação pronta, mas dependem de ensaio Auth/Storage real.
P2.6 tem testes SQL aprovados e testes de API preparados, ainda não executados.
Por isso, o aceite integrado da etapa 2 permanece aberto.

## Evidências nesta sessão

| Verificação | Resultado | Alcance |
| --- | --- | --- |
| Lint, TypeScript e build | Aprovados | Frontend e configuração |
| Vitest | 21 aprovados | Configuração, datas, publicação, arquivos e mensagens de erro |
| PostgreSQL 17 temporário | 9 aprovados | Migrations limpas, RLS, RPCs, isolamento, imagens e bloqueios reais |
| Playwright Chromium | 16 aprovados | 8 cenários em desktop e celular, com respostas de API simuladas |
| Inspeção visual | Realizada na captura móvel | Campos, navegação e ausência de rolagem horizontal no cenário testado |
| Supabase completo / pgTAP / API | Não executados | Docker indisponível no WSL |
| CI remota, preview e e-mail real | Não executados | Dependem de ambiente/contas |

Os 9 testes PostgreSQL cobrem privilégios padrão, leitura entre dois proprietários,
escritas diretas e troca indevida de dono, RPCs com ator/ID adulterados, validação de
publicação, transições, edição concorrente, encerramento aguardando bloqueio
compartilhado e políticas de arquivos. A infraestrutura Auth/Storage é representada
por um schema mínimo de teste: **não comprova o funcionamento dos serviços Supabase**.
O teste de bloqueio usa conexão independente e timeout; não simula reservas já prontas.

Os testes de navegador cobrem página inicial, teclado, rotas protegidas, acesso,
callback inválido, troca única de código, logout, fluxo de evento, conflito entre
abas, consentimento de imagem, PKCE entre abas e sessão expirada. Não enviam e-mails.
Capturas são geradas em `test-results/`, ignorado pelo Git.

## Ambiente e reprodução

Node Linux usado em `/tmp/chadbb-node/current/bin`. Para este WSL sem dependências
Chromium instaladas, bibliotecas foram extraídas em `/tmp/chadbb-browser-libs/root`
e passadas ao processo por `LD_LIBRARY_PATH`; o sistema não foi alterado.
Esses diretórios temporários não são dependências do projeto. Em ambiente normal,
seguir o README (`npx playwright install --with-deps chromium`).

```sh
npm run check
npm run test:db:portable
npm run test:e2e
```

Com Docker disponível, executar também `db:start`, `db:reset`, `db:test` e `test:api`.
Os testes de API consultam somente a configuração local do CLI e recusam host/porta
externos. São necessários para validar a forma das respostas RPC, Auth, Storage
real e os limites aplicados ao conteúdo enviado.

## Limites e próximo bloco

- Testar Supabase completo antes de considerar a etapa 2 aceita.
- Configurar URLs Auth, e-mail e preview em ambientes remotos separados.
- Capas são públicas após o upload, conforme autorização explícita. Remover a capa
  do evento remove a referência; limpeza de objetos não usados e retenção precisam
  ser concluídas antes do piloto.
- Catálogo, lista, convites, RSVP, reservas, prévia pública, métricas e operação
  continuam pendentes. O próximo bloco de implementação é catálogo e lista (etapa 3).

Referências: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[políticas de Storage](https://supabase.com/docs/guides/storage/security/access-control),
[bloqueios PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html).
