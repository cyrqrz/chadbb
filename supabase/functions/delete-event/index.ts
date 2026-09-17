// Exclusão de evento pelo organizador. A RPC roda com o JWT do próprio organizador
// (dono, estado e versão são conferidos no banco); a chave de servidor só remove os
// arquivos da pasta registrada. Se o Storage falhar, a retention diária repete.
import { cleanDeletedEvents, serviceApi } from '../_shared/storage.ts'

const allowed = (Deno.env.get('GUEST_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173').split(',')
const base = Deno.env.get('SUPABASE_URL')!
const api = serviceApi(base, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const statusOf: Record<string, number> = { AUTH_REQUIRED: 401, EVENT_NOT_FOUND: 404, EVENT_VERSION_CONFLICT: 409, EVENT_NOT_DELETABLE: 409 }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers })
  if (origin && !allowed.includes(origin)) return reply(403, { error: 'ORIGIN_DENIED' })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
  if (!request.headers.get('content-type')?.includes('application/json')) return reply(415, { error: 'INVALID_PAYLOAD' })
  const jwt = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!jwt) return reply(401, { error: 'AUTH_REQUIRED' })
  let body
  try {
    const text = await request.text()
    if (text.length > 1024) return reply(413, { error: 'INVALID_PAYLOAD' })
    body = JSON.parse(text)
  } catch { return reply(400, { error: 'INVALID_PAYLOAD' }) }
  if (!body || typeof body.event_id !== 'string' || !uuid.test(body.event_id) || !Number.isInteger(body.version)) {
    return reply(400, { error: 'INVALID_PAYLOAD' })
  }
  let deleted
  try {
    const response = await fetch(`${base}/rest/v1/rpc/delete_event`, { method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? request.headers.get('apikey') ?? '', Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event_id: body.event_id, p_version: body.version }) })
    const data = await response.json().catch(() => null)
    if (response.status === 401) return reply(401, { error: 'AUTH_REQUIRED' })
    if (!response.ok) {
      const code = typeof data?.message === 'string' && data.message in statusOf ? data.message : null
      return code ? reply(statusOf[code], { error: code }) : reply(503, { error: 'TEMPORARILY_UNAVAILABLE' })
    }
    deleted = data
  } catch { return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) }
  // O evento já foi excluído: falha do Storage não muda a resposta, só o estado da limpeza.
  let cleanup = 'pending'
  try { if ((await cleanDeletedEvents(api, body.event_id)).cleaned === 1) cleanup = 'done' } catch { /* retention repete */ }
  return reply(200, { ...deleted, storage_cleanup: cleanup })
})
