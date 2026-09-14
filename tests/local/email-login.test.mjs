import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// Sem traces, screenshots ou logs de URLs que contenham credenciais.
// Usa somente Supabase e Mailpit locais; não envia e-mails externos.
test('login por e-mail local: PKCE real, sessão persistente e logout', { timeout: 90000 }, async () => {
  const config = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  function localUrl(value, port) {
    const url = new URL(value)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'serviço precisa ser local')
    assert.equal(url.port, port)
    return url
  }
  const api = localUrl(config.API_URL, '54321')
  localUrl(config.DB_URL, '54322')
  const mail = localUrl(config.INBUCKET_URL ?? config.MAILPIT_URL, '54324')
  assert.match(config.PUBLISHABLE_KEY, /^sb_publishable_/)
  const email = `login-${randomUUID()}@example.test`
  const admin = createClient(api.origin, config.SERVICE_ROLE_KEY ?? config.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  let server, browser, messageId
  let phase = 'inicialização'
  try {
    server = await createServer({
      server: { host: '127.0.0.1', port: 5173, strictPort: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api.origin),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(config.PUBLISHABLE_KEY),
      },
    })
    await server.listen()
    browser = await chromium.launch()
    const page = await browser.newPage()
    phase = 'solicitação do e-mail pela interface'
    await page.goto('http://127.0.0.1:5173/entrar')
    await page.getByLabel('Seu e-mail').fill(email)
    await page.getByRole('button', { name: 'Receber link de acesso' }).click()
    await expect(page.getByRole('status')).toContainText('Confira sua caixa')
    phase = 'entrega no Mailpit local'
    let message
    await expect.poll(async () => {
      const response = await fetch(`${mail.origin}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
      assert.ok(response.ok)
      const result = await response.json()
      message = result.messages?.find(entry => entry.To?.some(recipient => recipient.Address === email))
      return Boolean(message)
    }, { timeout: 15000 }).toBe(true)
    messageId = message.ID
    const response = await fetch(`${mail.origin}/api/v1/message/${encodeURIComponent(messageId)}`)
    assert.ok(response.ok)
    const body = await response.json()
    const links = [...body.HTML.matchAll(/href=["']([^"']+)["']/g)].map(match => match[1].replaceAll('&amp;', '&'))
    const link = links.find(value => {
      try { const url = new URL(value); return url.origin === api.origin && url.pathname === '/auth/v1/verify' } catch { return false }
    })
    assert.ok(link, 'mensagem precisa conter link de verificação local')
    phase = 'troca PKCE e retorno ao painel'
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
    assert.equal(page.url(), 'http://127.0.0.1:5173/eventos')
    phase = 'sessão após recarregar'
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
    phase = 'logout e proteção de rota'
    await page.getByRole('button', { name: 'Sair', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Entre para organizar' })).toBeVisible()
    await page.goto('http://127.0.0.1:5173/eventos')
    await expect(page.getByLabel('Seu e-mail')).toBeVisible()
    assert.equal(page.url(), 'http://127.0.0.1:5173/entrar')
  } catch {
    // Erros Playwright podem incluir o link secreto completo; registrar só a fase.
    throw new Error(`Falha no ensaio de e-mail local: ${phase}`)
  } finally {
    await browser?.close()
    await server?.close()
    const db = new pg.Client({ connectionString: config.DB_URL })
    await db.connect()
    try {
      const result = await db.query('select id from auth.users where email = $1', [email])
      for (const user of result.rows) {
        const removed = await admin.auth.admin.deleteUser(user.id)
        assert.equal(removed.error, null, 'limpeza do usuário fictício')
      }
    } finally { await db.end() }
    if (messageId) {
      const removed = await fetch(`${mail.origin}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [messageId] }) })
      assert.ok(removed.ok, 'limpeza apenas da mensagem fictícia')
    }
  }
})
