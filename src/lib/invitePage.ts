// Página do link do convite nas Pages Functions: entrega o mesmo convite.html, trocando só as meta
// tags pela projeção pública pedida (do evento em /c/:id, do convite em /c/:id/:preview). O token
// fica depois do `#` e nunca chega aqui. Qualquer falha devolve o convite com a prévia genérica:
// o convidado nunca fica sem a página.
import { withEventPreview } from './eventPreview'
import type { PublicPreview } from './eventPreview'

export type InviteEnv = { ASSETS: { fetch: (input: Request | string) => Promise<Response> }; VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

async function readPreview(env: InviteEnv, rpc: string, body: Record<string, string>): Promise<PublicPreview | null> {
  const base = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!base || !key) return null
  try {
    const response = await fetch(`${base}/rest/v1/rpc/${rpc}`, {
      method: 'POST', signal: AbortSignal.timeout(2500),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) return null
    const rows = await response.json() as PublicPreview[]
    return rows[0] ?? null
  } catch { return null }
}

// `query` é null quando os ids do caminho não são válidos: nem consulta o banco.
export async function invitePage(request: Request, env: InviteEnv, query: { rpc: string; body: Record<string, string> } | null) {
  const page = await env.ASSETS.fetch(new URL('/convite', request.url).toString())
  const preview = query ? await readPreview(env, query.rpc, query.body) : null
  const html = await page.text()
  const headers = new Headers(page.headers)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  // Curto: a arte muda quando o organizador salva; o WhatsApp guarda a própria cópia.
  headers.set('Cache-Control', 'public, max-age=300')
  headers.delete('Content-Length'); headers.delete('ETag')
  return new Response(preview ? withEventPreview(html, preview, env.VITE_SUPABASE_URL!) : html, { status: 200, headers })
}
