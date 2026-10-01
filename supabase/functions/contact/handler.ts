type Rpc = (name: string, body: Record<string, unknown>) => Promise<{ ok: boolean; data: unknown }>
type Options = { allowed: string[]; apiKey: string; from: string; to: string; rpc: Rpc; transport?: typeof fetch }

// Assuntos do formulário: o rótulo vai no assunto do e-mail para a triagem na caixa de entrada.
export const topics: Record<string, string> = {
  convite: 'Recebi um convite', organizar: 'Organizo um evento', dados: 'Meus dados e privacidade', outro: 'Outro assunto',
}
const limits = { name: 120, email: 254, message: 4000, details: 4000 }
// Sem quebra de linha em nada que vira cabeçalho (assunto, reply_to): evita injeção de cabeçalho.
const singleLine = (value: string) => !/[\r\n]/.test(value)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// O primeiro valor de X-Forwarded-For vem do cliente; confiar só no que o gateway acrescenta (como na Edge guest).
function clientAddress(request: Request) {
  const edge = request.headers.get('cf-connecting-ip')?.trim()
  if (edge) return edge
  const chain = (request.headers.get('x-forwarded-for') ?? '').split(',').map(part => part.trim()).filter(Boolean)
  return chain.at(-1) ?? 'local'
}

async function readBody(request: Request): Promise<unknown | 'TOO_LARGE' | 'INVALID'> {
  const reader = request.body?.getReader()
  if (!reader) return 'INVALID'
  let text = ''; let size = 0; const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    size += value.byteLength
    if (size > 16384) { await reader.cancel(); return 'TOO_LARGE' }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  try { return JSON.parse(text) } catch { return 'INVALID' }
}

// Nada é gravado: a mensagem só é repassada por e-mail ao contato (LGPD). Sem Deno na
// importação: o mesmo handler roda nos testes com cota e transporte simulados.
export function createContactHandler({ allowed, apiKey, from, to, rpc, transport = fetch }: Options) {
  return async (request: Request) => {
    const origin = request.headers.get('origin') ?? ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers })
    if (origin && !allowed.includes(origin)) return reply(403, { error: 'ORIGIN_DENIED' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    if (!request.headers.get('content-type')?.includes('application/json')) return reply(415, { error: 'INVALID_PAYLOAD' })
    const body = await readBody(request)
    if (body === 'TOO_LARGE') return reply(413, { error: 'INVALID_PAYLOAD' })
    if (!body || typeof body !== 'object') return reply(400, { error: 'INVALID_PAYLOAD' })
    const field = (key: string) => { const value = (body as Record<string, unknown>)[key]; return typeof value === 'string' ? value.trim() : '' }
    const form = { name: field('name'), email: field('email'), topic: field('topic'), message: field('message'), details: field('details') }
    // Campo-armadilha: invisível para pessoas, preenchido por robôs. Finge sucesso para não ensinar o robô.
    if (field('website')) return reply(200, { ok: true })
    const invalid = !form.name || form.name.length > limits.name || !singleLine(form.name) ? 'name'
      : form.email.length > limits.email || !singleLine(form.email) || !emailPattern.test(form.email) ? 'email'
      : !(form.topic in topics) ? 'topic'
      : form.message.length < 10 || form.message.length > limits.message ? 'message'
      : form.details.length > limits.details ? 'details' : null
    if (invalid) return reply(400, { error: 'INVALID_FIELD', field: invalid })
    if (!apiKey || !from || !to || !singleLine(from) || !singleLine(to)) return reply(503, { error: 'CONTACT_NOT_CONFIGURED' })
    try {
      // Cota por rede e global, com a mesma função das cotas do convidado (chaves só em hash no banco).
      const rate = await rpc('check_guest_rates', { p_keys: [`contact:${clientAddress(request)}`, 'contact-global'] })
      if (!rate.ok) return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' })
      if (rate.data !== true) return reply(429, { error: 'RATE_LIMITED' })
      const text = [`Assunto: ${topics[form.topic]}`, `Nome: ${form.name}`, `E-mail para resposta: ${form.email}`, '',
        'O que aconteceu:', form.message, '', 'Detalhes:', form.details || '(não informados)', '',
        'Enviado pelo formulário de contato do chadbb. Para responder, use “Responder”: vai para o e-mail acima.'].join('\n')
      const response = await transport('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], reply_to: form.email, subject: `[chadbb] ${topics[form.topic]} · ${form.name}`, text }),
      })
      await response.body?.cancel()
      // Só status no log: nada do conteúdo, nome, e-mail ou IP.
      console.log(JSON.stringify({ contact: response.ok ? 'sent' : 'provider_error', status: response.status }))
      return response.ok ? reply(200, { ok: true }) : reply(503, { error: 'TEMPORARILY_UNAVAILABLE' })
    } catch { return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) }
  }
}
