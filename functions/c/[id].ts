// Link do convite com prévia do evento: `/c/<id-do-evento>#token`. O token fica depois do
// `#` e nunca chega aqui; o id do evento é público. A função entrega o mesmo convite.html
// do link antigo (`/convite`), trocando só as meta tags pela projeção pública do evento
// (`public_event_preview`: só publicado; título, descrição, dia e horário e arte). Qualquer
// falha devolve o convite com a prévia genérica: o convidado nunca fica sem a página.
import { withEventPreview } from '../../src/lib/eventPreview'
import type { PublicPreview } from '../../src/lib/eventPreview'

type Env = { ASSETS: { fetch: (input: Request | string) => Promise<Response> }; VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }
type Context = { request: Request; env: Env; params: { id?: string | string[] } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function readPreview(env: Env, id: string): Promise<PublicPreview | null> {
  const base = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!base || !key) return null
  try {
    const response = await fetch(`${base}/rest/v1/rpc/public_event_preview`, {
      method: 'POST', signal: AbortSignal.timeout(2500),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event_id: id }),
    })
    if (!response.ok) return null
    const rows = await response.json() as PublicPreview[]
    return rows[0] ?? null
  } catch { return null }
}

export async function onRequestGet({ request, env, params }: Context) {
  const page = await env.ASSETS.fetch(new URL('/convite', request.url).toString())
  const id = Array.isArray(params.id) ? params.id[0] : params.id ?? ''
  const preview = uuid.test(id) ? await readPreview(env, id) : null
  const html = await page.text()
  const headers = new Headers(page.headers)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  // Curto: a arte muda quando o organizador salva; o WhatsApp guarda a própria cópia.
  headers.set('Cache-Control', 'public, max-age=300')
  headers.delete('Content-Length'); headers.delete('ETag')
  return new Response(preview ? withEventPreview(html, preview, env.VITE_SUPABASE_URL!) : html, { status: 200, headers })
}
