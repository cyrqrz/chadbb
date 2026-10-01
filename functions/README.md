# Pages Functions

`c/[id].ts` (desde 01/10/2026): link do convite com a prévia do evento,
`/c/<id-do-evento>#token`. Entrega o mesmo `convite.html` de `/convite`, trocando só as
meta tags pela projeção pública `public_event_preview` (evento publicado: título,
descrição pública, dia e horário e arte). O token fica depois do `#` e nunca chega
aqui. Qualquer falha devolve a prévia genérica. Lê `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` do ambiente do Pages (as mesmas variáveis do build).
Testes em `tests/event-preview.test.ts`.

Não retornar endereço privado, identificação de convidados ou credenciais.
