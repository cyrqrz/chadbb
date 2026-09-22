import { createClient } from '@supabase/supabase-js'
import { readPublicConfig } from './config'

export const backend = readPublicConfig(import.meta.env)
// `db.retry: false`: o postgrest-js repete GET em 503/520 por conta própria (3
// tentativas, 1 s + 2 s + 4 s) sem avisar a interface. Com a repetição do
// TanStack por cima, um 503 deixava a lista ~15,7 s em "Carregando a lista…",
// contra ~2 s num 500 — e o esqueleto tornava a espera ainda mais enganosa. A
// repetição visível fica no TanStack (`retry` e o recuo de `liveInterval`).
export const supabase = backend.status === 'ready'
  ? createClient(backend.config.url, backend.config.key, { auth: { flowType: 'pkce', detectSessionInUrl: false }, db: { retry: false } })
  : null
