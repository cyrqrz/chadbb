// Guest credentials are checked by SQL; the service key stays inside this function.
const allowed = (Deno.env.get('GUEST_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173').split(',')
const base = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const known = new Set(['GUEST_SESSION_INVALID', 'EVENT_CLOSED', 'ITEM_NOT_FOUND', 'REQUEST_ID_REQUIRED', 'INVALID_ACTION',
  'RESPONSE_VERSION_CONFLICT', 'RESERVATION_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INSUFFICIENT_QUANTITY',
  'RESERVATION_NOT_FOUND', 'INVALID_RESERVATION_STATE', 'INVALID_GIFT_QUANTITY', 'RSVP_INVALID_RESPONSE', 'ATTENDING_ABOVE_CAPACITY',
  'PURCHASE_ALREADY_DECLARED'])
class Unavailable extends Error {}
async function rpc(name: string, body: unknown) {
  let response: Response
  try {
    response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { throw new Unavailable() }
  const text = await response.text()
  let data: { message?: string; code?: string } | null
  try { data = text ? JSON.parse(text) : null } catch { throw new Unavailable() }
  return { ok: response.ok, data }
}
// O primeiro valor de X-Forwarded-For vem do cliente; confiar só no que o gateway acrescenta.
function clientAddress(request: Request) {
  const edge = request.headers.get('cf-connecting-ip')?.trim()
  if (edge) return edge
  const chain = (request.headers.get('x-forwarded-for') ?? '').split(',').map(part => part.trim()).filter(Boolean)
  return chain.at(-1) ?? 'local'
}
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
  let body
  try {
    const reader = request.body?.getReader()
    if (!reader) return reply(400, { error: 'INVALID_PAYLOAD' })
    let text = ''; let size = 0; const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 16384) { await reader.cancel(); return reply(413, { error: 'INVALID_PAYLOAD' }) }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    body = JSON.parse(text)
  } catch { return reply(400, { error: 'INVALID_PAYLOAD' }) }
  if (!body || typeof body.action !== 'string' || !['exchange', 'read', 'rsvp', 'reserve', 'cancel', 'purchase', 'swap'].includes(body.action)) return reply(400, { error: 'INVALID_ACTION' })
  const token = body.action === 'exchange' ? body.token : request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return reply(401, { error: 'GUEST_SESSION_INVALID' })
  try {
    // A cota global só é consumida por pedidos que passaram nas cotas de origem e credencial.
    // No IP or token is persisted in cleartext.
    for (const bucket of [`ip:${clientAddress(request)}`, `token:${token}`, 'global']) {
      const rate = await rpc('check_guest_rate', { p_key: bucket })
      if (!rate.ok) return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' })
      if (rate.data !== true) return reply(429, { error: 'RATE_LIMITED' })
    }
    const result = await rpc('guest_action', { p_token: token, p_action: body.action, p_payload: body.payload ?? {} })
    if (result.ok) return reply(200, result.data)
    const message = result.data?.message ?? ''
    if (known.has(message)) return reply(message === 'GUEST_SESSION_INVALID' ? 401 : 409, { error: message })
    // Dados malformados (classes 22 e 23) são erro do pedido; o resto é falha do servidor e permite repetir.
    if (/^2[23]/.test(result.data?.code ?? '')) return reply(400, { error: 'INVALID_PAYLOAD' })
    return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' })
  } catch { return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) }
})
