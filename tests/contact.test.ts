import { describe, expect, it, vi } from 'vitest'
import { createContactHandler } from '../supabase/functions/contact/handler'

const origin = 'https://chadbb.online'
const valid = { name: 'Pessoa Fictícia', email: 'pessoa@example.test', topic: 'convite', message: 'O link do convite abre uma página em branco.', details: 'Celular Android, ontem à noite.', website: '' }
function setup({ rate = true, status = 200, rateOk = true } = {}) {
  const rpc = vi.fn(async () => ({ ok: rateOk, data: rate }))
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status }))
  const handler = createContactHandler({ allowed: [origin], apiKey: 'fake-key', from: 'chadbb <nao-responda@example.test>', to: 'contato@example.test', rpc, transport })
  return { rpc, transport, handler }
}
const send = (handler: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  handler(new Request('http://local.test', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...headers }, body: JSON.stringify(body) }))

describe('formulário de contato', () => {
  it('recusa origem desconhecida, método e payload sem consultar cota nem enviar', async () => {
    const { handler, rpc, transport } = setup()
    expect((await send(handler, valid, { origin: 'https://golpe.example' })).status).toBe(403)
    expect((await handler(new Request('http://local.test', { method: 'GET', headers: { origin } }))).status).toBe(405)
    expect((await handler(new Request('http://local.test', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' }))).status).toBe(400)
    expect((await send(handler, { ...valid, message: 'x'.repeat(16_385) })).status).toBe(413)
    expect(rpc).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled()
  })
  it('valida os campos e devolve qual está errado', async () => {
    const { handler, transport } = setup()
    for (const [field, value] of [['name', ' '], ['email', 'sem-arroba'], ['email', 'a@b.c\r\nBcc: x@y.z'], ['topic', 'spam'], ['message', 'curta'], ['message', 'x'.repeat(4001)], ['details', 'x'.repeat(4001)]] as const) {
      const response = await send(handler, { ...valid, [field]: value })
      expect(response.status, `${field}=${value.slice(0, 20)}`).toBe(400)
      expect(await response.json()).toEqual({ error: 'INVALID_FIELD', field })
    }
    expect(transport).not.toHaveBeenCalled()
  })
  it('campo-armadilha preenchido finge sucesso e não envia', async () => {
    const { handler, rpc, transport } = setup()
    const response = await send(handler, { ...valid, website: 'http://spam.example' })
    expect(response.status).toBe(200)
    expect(rpc).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled()
  })
  it('cota por rede e global antes do envio; recusa vira 429', async () => {
    const { handler, rpc, transport } = setup({ rate: false })
    expect((await send(handler, valid)).status).toBe(429)
    expect(rpc).toHaveBeenCalledWith('check_guest_rates', { p_keys: ['contact:203.0.113.9', 'contact-global'] })
    expect(transport).not.toHaveBeenCalled()
    expect((await send(setup({ rateOk: false }).handler, valid)).status).toBe(503)
  })
  it('envia para o contato com resposta para quem escreveu, sem HTML', async () => {
    const { handler, transport } = setup()
    const response = await send(handler, valid)
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    const [url, args] = transport.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(String(args?.body))
    expect(body.to).toEqual(['contato@example.test'])
    expect(body.reply_to).toBe('pessoa@example.test')
    expect(body.subject).toBe('[chadbb] Recebi um convite · Pessoa Fictícia')
    expect(body.html).toBeUndefined()
    expect(body.text).toContain('O link do convite abre uma página em branco.')
    expect(body.text).toContain('Celular Android, ontem à noite.')
    expect(body.text).toContain('pessoa@example.test')
  })
  it('falha do provedor ou configuração ausente não diz que enviou', async () => {
    expect((await send(setup({ status: 500 }).handler, valid)).status).toBe(503)
    const rpc = vi.fn(); const transport = vi.fn<typeof fetch>()
    const handler = createContactHandler({ allowed: [origin], apiKey: '', from: '', to: '', rpc, transport })
    expect((await send(handler, valid)).status).toBe(503)
    expect(transport).not.toHaveBeenCalled()
  })
})
