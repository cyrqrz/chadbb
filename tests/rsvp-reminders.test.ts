import { describe, expect, it, vi } from 'vitest'
import { createReminderHandler } from '../supabase/functions/rsvp-reminders/worker'
const secret = 'test-only-secret-'.repeat(3)
const job = { id: 'job-1', lease: 'lease-1', recipient: 'guest@example.test', title: 'Evento fictício', confirmation_due_at: '2035-01-01T12:00:00Z' }
function setup({ active = true, status = 200, failAck = false } = {}) {
  const rpc = vi.fn(async (name: string) => ({ ok: !(failAck && name === 'rsvp_reminder_complete'), data:
    name === 'rsvp_reminders_claim' ? { jobs: [job], expired: 2 } : name === 'rsvp_reminder_check' ? active ? job : null : true }))
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status }))
  return { rpc, transport, handler: createReminderHandler({ secret, apiKey: 'fake-key', from: 'test@example.test', rpc, transport }) }
}
const request = () => new Request('http://local.test', { method: 'POST', headers: { 'x-rsvp-secret': secret } })
describe('lembretes de presença', () => {
  it('recusa método/segredo antes de consultar fila ou enviar', async () => {
    const { handler, rpc, transport } = setup()
    expect((await handler(new Request('http://local.test'))).status).toBe(405)
    expect((await handler(new Request('http://local.test', { method: 'POST' }))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled()
  })
  it('envia texto sem link secreto e usa chave idempotente estável', async () => {
    const { handler, rpc, transport } = setup()
    const result = await handler(request())
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0, rejected: 0, expired: 2 })
    const [url, args] = transport.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(new Headers(args?.headers).get('Idempotency-Key')).toBe('rsvp-reminder/job-1')
    const body = JSON.parse(String(args?.body))
    expect(body.to).toEqual(['guest@example.test'])
    expect(body.text).toContain('três dias'); expect(body.text).toContain('convite original')
    expect(body.text).toContain('responda até 01/01, 09:00 (horário de Brasília)')
    expect(body.html).toBeUndefined()
    expect(rpc).toHaveBeenLastCalledWith('rsvp_reminder_complete', { p_id: job.id, p_lease: job.lease, p_sent: true })
  })
  it('confirmação/revogação após claim impede envio na revalidação', async () => {
    const { handler, transport } = setup({ active: false })
    expect(await (await handler(request())).json()).toMatchObject({ sent: 0, skipped: 1 })
    expect(transport).not.toHaveBeenCalled()
  })
  it('falha do provedor não registra envio nem expõe dados privados', async () => {
    const { handler, rpc } = setup({ status: 429 })
    const result = await handler(request())
    expect(result.status).toBe(503)
    expect(await result.text()).not.toMatch(/guest@|Evento fictício|fake-key/)
    expect(rpc).toHaveBeenLastCalledWith('rsvp_reminder_complete', { p_id: job.id, p_lease: job.lease, p_sent: false })
  })
  it('aceite seguido de falha no registro repete o mesmo conteúdo/chave', async () => {
    const { handler, transport } = setup({ failAck: true })
    expect((await handler(request())).status).toBe(503)
    expect((await handler(request())).status).toBe(503)
    expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[1][1]?.body)
    expect(transport.mock.calls[0][1]?.headers).toEqual(transport.mock.calls[1][1]?.headers)
  })
  it('destinatário recusado (422) encerra a tentativa sem marcar envio', async () => {
    const { handler, rpc } = setup({ status: 422 })
    const result = await handler(request())
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ sent: 0, failed: 0, rejected: 1 })
    expect(rpc).toHaveBeenLastCalledWith('rsvp_reminder_reject', { p_id: job.id, p_lease: job.lease })
  })
})
