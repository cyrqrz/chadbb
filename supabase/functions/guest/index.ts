// Credenciais somente em corpo/cabeçalho; nenhuma URL, log ou resposta de erro as inclui.
const originList = (Deno.env.get('GUEST_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim())
const endpoint = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const hex = (bytes: Uint8Array) => [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${endpoint}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message ?? 'UNAVAILABLE')
  return data
}
async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('INVALID_REQUEST')
  let size = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 4096) { await reader.cancel(); throw new Error('INVALID_REQUEST') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}
Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Origin' }
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (!originList.includes(origin)) return reply({ error: 'ORIGIN_DENIED' }, 403)
  headers['Access-Control-Allow-Origin'] = origin
  headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type'
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply({ error: 'INVALID_REQUEST' }, 405)
  try {
    // O limite global permanece eficaz mesmo se o proxy não normalizar o IP.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) throw new Error('INVALID_REQUEST')
    const body = await readBody(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_REQUEST')
    const credential = body.action === 'exchange' ? body.token : request.headers.get('authorization')?.replace(/^Bearer /, '')
    const validCredential = typeof credential === 'string' && /^[a-f0-9]{64}$/.test(credential)
    const credentialHash = await digest(validCredential ? credential : 'invalid')
    if (!await rpc('allow_guest_request', { p_ip_hash: await digest(ip), p_credential_hash: credentialHash })) return reply({ error: 'RATE_LIMITED' }, 429)
    if (!validCredential) return reply({ error: 'GUEST_SESSION_INVALID' }, 401)
    if (body.action === 'exchange') {
      if (Object.keys(body).some(name => !['action', 'token'].includes(name))) throw new Error('INVALID_REQUEST')
      const session = hex(crypto.getRandomValues(new Uint8Array(32)))
      const expires_at = await rpc('exchange_guest_invitation', { p_token_hash: credentialHash, p_session_hash: await digest(session) })
      return reply({ session, expires_at })
    }
    if (body.action === 'read') {
      if (Object.keys(body).length !== 1) throw new Error('INVALID_REQUEST')
      return reply(await rpc('get_guest_invitation', { p_session_hash: credentialHash }))
    }
    if (body.action === 'rsvp') {
      if (Object.keys(body).some(name => !['action', 'person_id', 'response', 'version'].includes(name)) ||
        typeof body.person_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.person_id) ||
        !['yes', 'no', 'maybe'].includes(body.response) || !Number.isInteger(body.version) || body.version < 1) throw new Error('INVALID_REQUEST')
      return reply(await rpc('set_guest_rsvp', { p_session_hash: credentialHash, p_person_id: body.person_id, p_response: body.response, p_version: body.version }))
    }
    throw new Error('INVALID_REQUEST')
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : 'UNAVAILABLE'
    const statuses: Record<string, number> = { GUEST_SESSION_INVALID: 401, EVENT_NOT_PUBLISHED: 403, PERSON_NOT_FOUND: 403, RSVP_VERSION_CONFLICT: 409, RSVP_CLOSED: 409, INVALID_RSVP: 400, INVALID_REQUEST: 400 }
    return reply({ error: statuses[code] ? code : 'UNAVAILABLE' }, statuses[code] ?? 503)
  }
})
