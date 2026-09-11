# Edge Function guest

Implementada e validada na stack local; publicação remota ainda pendente.

`supabase functions serve guest` inicia a função local. `verify_jwt = false`
permite a credencial opaca própria do convidado; a função valida sessão no banco
em cada consulta/mutação. O convidado não faz login no Supabase Auth.

- `exchange`: POST JSON `{ "action": "exchange", "token": "..." }` emite sessão de 2 horas.
- `read`: POST JSON `{ "action": "read" }` com `Authorization: Bearer <sessão>`.
- `rsvp`: POST com `action`, `person_id`, `response` (`yes`, `no`, `maybe`) e `version`.

Token e sessão são aleatórios, armazenados no banco somente como hashes.
Resposta só pode mudar antes do início; evento iniciado/encerrado é somente leitura.
Revogação invalida link e sessões existentes. Respostas incluem `Cache-Control: no-store`.

`GUEST_ALLOWED_ORIGINS` aceita origens separadas por vírgula. O padrão local é
`http://localhost:5173,http://127.0.0.1:5173`; configurar a origem real ao publicar.
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são exclusivos do runtime servidor.
Nunca colocar a chave administrativa em variáveis `VITE_*`.

Limites compartilhados por minuto: 300 globais, 60 por IP e 20 por hash de
credencial. O proxy precisa normalizar `x-forwarded-for` para o limite de IP ser
confiável; o limite global independe disso. Payload máximo: 4096 bytes.

Teste com `npm run test:invites:local`, com função ativa e porta 5173 livre.
O ensaio não grava traces, screenshots ou links secretos e limpa os dados fictícios.
