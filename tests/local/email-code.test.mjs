import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { localConfig } from '../support/local.mjs'

// Código do e-mail vale em outro navegador: o cliente que confirma não tem o
// code_verifier do PKCE. Só Supabase e Mailpit locais; um único e-mail enviado
// (limite local de 2 por hora). Nenhum código ou link é impresso.
test('login por código: modelo em português e confirmação em outro navegador', { timeout: 60000 }, async () => {
  const config = localConfig()
  const mail = new URL(config.INBUCKET_URL ?? config.MAILPIT_URL)
  assert.ok(['localhost', '127.0.0.1'].includes(mail.hostname)); assert.equal(mail.port, '54324')
  const opts = { auth: { persistSession: false, autoRefreshToken: false, flowType: 'pkce' } }
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY ?? config.SECRET_KEY, opts)
  const email = `codigo-${randomUUID()}@example.test`
  let userId, messageId
  try {
    // Organizador já existente recebe o modelo magic_link.
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    assert.equal(created.error, null); userId = created.data.user.id
    const requester = createClient(config.API_URL, config.PUBLISHABLE_KEY, opts)
    const sent = await requester.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: 'http://127.0.0.1:5173/auth/callback' } })
    assert.equal(sent.error, null, sent.error?.message)

    let message
    for (let i = 0; i < 30 && !message; i++) {
      const found = await (await fetch(`${mail.origin}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()
      message = found.messages?.find(m => m.To?.some(r => r.Address === email))
      if (!message) await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(message, 'e-mail entregue no Mailpit local'); messageId = message.ID
    const body = await (await fetch(`${mail.origin}/api/v1/message/${encodeURIComponent(messageId)}`)).json()
    assert.equal(body.Subject, 'Seu código de acesso ao chadbb')
    assert.match(body.HTML, /lang="pt-BR"/)
    assert.match(body.HTML, /Digite este código na tela de entrada/)
    assert.match(body.HTML, /no mesmo navegador em que você pediu o acesso/)
    const codes = [...body.HTML.matchAll(/>(\d{8})</g)].map(m => m[1])
    assert.equal(codes.length, 1, 'um código de 8 dígitos em destaque')
    const link = [...body.HTML.matchAll(/href="([^"]+)"/g)].map(m => new URL(m[1].replaceAll('&amp;', '&')))
      .find(url => url.pathname === '/auth/v1/verify')
    assert.ok(link, 'link de acesso continua presente')
    assert.equal(link.searchParams.get('type'), 'magiclink')

    // Outro "navegador": cliente novo, sem armazenamento do pedido.
    const other = () => createClient(config.API_URL, config.PUBLISHABLE_KEY, opts)
    const wrong = await other().auth.verifyOtp({ email, token: codes[0] === '00000000' ? '11111111' : '00000000', type: 'email' })
    assert.ok(wrong.error, 'código errado é recusado'); assert.equal(wrong.data.session, null)
    const confirmed = await other().auth.verifyOtp({ email, token: codes[0], type: 'email' })
    assert.equal(confirmed.error, null, confirmed.error?.message)
    assert.equal(confirmed.data.session?.user.id, userId)
    const reused = await other().auth.verifyOtp({ email, token: codes[0], type: 'email' })
    assert.ok(reused.error, 'código não vale duas vezes')
  } finally {
    if (userId) assert.equal((await admin.auth.admin.deleteUser(userId)).error, null, 'limpeza do usuário fictício')
    if (messageId) {
      const removed = await fetch(`${mail.origin}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [messageId] }) })
      assert.ok(removed.ok, 'limpeza apenas da mensagem fictícia')
    }
  }
})
