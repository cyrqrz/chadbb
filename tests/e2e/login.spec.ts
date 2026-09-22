import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { session } from './session'

// Entrada com o código de 8 dígitos do e-mail (pedido do back, 2026-09-17): o
// link só funciona no navegador do pedido; o código funciona em qualquer um.
type Reply = { status: number; json: unknown }
async function auth(page: Page, replies: { otp?: () => Reply; verify?: () => Reply } = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = []
  await page.route('https://e2e.supabase.co/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON() ?? {}
    calls.push({ path, body })
    let reply: Reply = { status: 500, json: { message: 'Unexpected test request' } }
    if (path === '/auth/v1/otp') reply = replies.otp?.() ?? { status: 200, json: {} }
    else if (path === '/auth/v1/verify') reply = replies.verify?.() ?? { status: 200, json: session() }
    else if (path === '/auth/v1/user') reply = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') reply = { status: 200, json: [] }
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.json), headers: { 'content-range': '*/0' } })
  })
  return calls
}
async function request(page: Page, email = 'organizer@example.test') {
  await page.goto('/entrar')
  await page.getByLabel('Seu e-mail').fill(email)
  await page.getByRole('button', { name: 'Receber código de acesso' }).click()
}
const accessible = async (page: Page) => expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([])

test('depois do pedido, pede o código de 8 dígitos e preserva o e-mail', async ({ page }) => {
  await auth(page)
  await request(page)
  await expect(page.getByRole('status')).toContainText('Enviamos um código e um link para organizer@example.test')
  const code = page.getByLabel('Código de 8 dígitos')
  await expect(code).toBeFocused()
  await expect(code).toHaveAttribute('inputmode', 'numeric')
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  await expect(page.getByLabel('Seu e-mail')).toHaveValue('organizer@example.test')
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await accessible(page)
  await page.screenshot({ path: `test-results/login-codigo-${test.info().project.name}.png`, fullPage: true })
})

test('código certo entra e vai para os eventos', async ({ page }) => {
  const calls = await auth(page)
  await request(page, '  Organizer@Example.test ')
  await page.getByLabel('Código de 8 dígitos').fill('12345678')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/eventos$/)
  await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
  const verify = calls.find(call => call.path === '/auth/v1/verify')!
  expect(verify.body).toMatchObject({ email: 'Organizer@Example.test', token: '12345678', type: 'email' })
})

test('código errado ou expirado pede um novo, sem apagar o que foi digitado', async ({ page }) => {
  await auth(page, { verify: () => ({ status: 403, json: { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' } }) })
  await request(page)
  await page.getByLabel('Código de 8 dígitos').fill('00000000')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Código inválido ou expirado. Peça um novo.')
  await expect(page.getByLabel('Código de 8 dígitos')).toHaveValue('00000000')
  await expect(page.getByLabel('Seu e-mail')).toHaveValue('organizer@example.test')
})

test('código aceita só 8 números', async ({ page }) => {
  const calls = await auth(page)
  await request(page)
  await page.getByLabel('Código de 8 dígitos').fill('1234 56ab')
  await expect(page.getByLabel('Código de 8 dígitos')).toHaveValue('123456')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Digite os 8 números do código.')
  expect(calls.some(call => call.path === '/auth/v1/verify')).toBe(false)
})

test('muitas tentativas de código pedem para esperar', async ({ page }) => {
  await auth(page, { verify: () => ({ status: 429, json: { code: 'over_request_rate_limit', msg: 'Too many requests' } }) })
  await request(page)
  await page.getByLabel('Código de 8 dígitos').fill('12345678')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Muitas tentativas')
  await expect(page.getByRole('alert')).toContainText('Aguarde')
})

test('o botão de pedido fica indisponível por 60 s depois do envio e durante o envio', async ({ page }) => {
  await page.clock.install()
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const calls = await auth(page, { otp: () => ({ status: 200, json: {} }) })
  await page.route('**/auth/v1/otp**', async route => { await hold; await route.fallback() })
  await page.goto('/entrar')
  await page.getByLabel('Seu e-mail').fill('organizer@example.test')
  const send = page.getByRole('button', { name: /código de acesso|Enviando|Pedir outro código/ })
  await send.click()
  await expect(send).toHaveText('Enviando…')
  // Segundo toque durante o envio não gera outro pedido.
  await send.click({ force: true })
  release()
  await expect(send).toHaveText(/Pedir outro código em (60|59|58|57) s/)
  await expect(send).toHaveAttribute('aria-disabled', 'true')
  await send.click({ force: true })
  expect(calls.filter(call => call.path === '/auth/v1/otp')).toHaveLength(1)
  await page.clock.runFor(61_000)
  await expect(send).toHaveText('Pedir outro código')
  await expect(send).not.toHaveAttribute('aria-disabled', 'true')
})

test('limite de envio do servidor diz quanto esperar', async ({ page }) => {
  await auth(page, { otp: () => ({ status: 429, json: { code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 37 seconds.' } }) })
  await request(page)
  await expect(page.getByRole('alert')).toContainText('Aguarde 37 segundos')
  await expect(page.getByRole('button', { name: /Pedir outro código em \d+ s/ })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByLabel('Código de 8 dígitos')).toHaveCount(0)
})

test('limite por hora não promete liberação imediata', async ({ page }) => {
  await auth(page, { otp: () => ({ status: 429, json: { code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' } }) })
  await request(page)
  await expect(page.getByRole('alert')).toContainText('até 1 hora')
})

test('quem já recebeu o código pode digitá-lo sem pedir outro', async ({ page }) => {
  const calls = await auth(page)
  await page.goto('/entrar')
  await page.getByLabel('Seu e-mail').fill('organizer@example.test')
  await page.getByRole('button', { name: 'Já tenho um código' }).click()
  await page.getByLabel('Código de 8 dígitos').fill('12345678')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/eventos$/)
  expect(calls.some(call => call.path === '/auth/v1/otp')).toBe(false)
})

test('“Já tenho um código” sem e-mail pede o e-mail primeiro', async ({ page }) => {
  await auth(page)
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Já tenho um código' }).click()
  await expect(page.getByRole('alert')).toHaveText('Digite o e-mail para o qual o código foi enviado.')
  await expect(page.getByLabel('Seu e-mail')).toBeFocused()
})

test('usar outro e-mail volta ao primeiro passo', async ({ page }) => {
  await auth(page)
  await request(page)
  await page.getByRole('button', { name: 'Usar outro e-mail' }).click()
  await expect(page.getByLabel('Código de 8 dígitos')).toHaveCount(0)
  await expect(page.getByLabel('Seu e-mail')).toBeFocused()
  await expect(page.getByLabel('Seu e-mail')).toBeEditable()
})

test('link aberto em outro navegador explica usar o mesmo navegador ou o código, mesmo com sessão antiga saindo', async ({ page }) => {
  await auth(page)
  // Sessão antiga vencida: o cliente tenta renovar, falha e emite SIGNED_OUT enquanto a troca do código falha.
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify({ ...value, expires_at: 1 })), session())
  await page.route('https://e2e.supabase.co/auth/v1/token**', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'flow_state_not_found', message: 'invalid flow state' }) }))
  await page.goto('/auth/callback?code=fake-auth-code')
  await expect(page.getByRole('heading', { name: 'Não foi possível entrar' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('mesmo navegador')
  await expect(page.getByRole('alert')).toContainText('código de 8 dígitos')
  await expect(page.getByRole('link', { name: 'Entrar com o código' })).toHaveAttribute('href', '/entrar')
})

test('tela de entrada cabe em 320 px com texto a 200%', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await auth(page)
  await request(page)
  await expect(page.getByLabel('Código de 8 dígitos')).toBeVisible()
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
})

test('o topo do site tem um “Entrar para organizar” visível para quem não entrou', async ({ page }) => {
  await auth(page)
  await page.goto('/')
  const enter = page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Entrar para organizar' })
  await expect(enter).toHaveAttribute('href', '/entrar')
  await enter.click()
  await expect(page.getByRole('heading', { name: 'Entre para organizar' })).toBeVisible()
})

test('código colado com espaço ou traço (como vem do e-mail) entra inteiro', async ({ page }) => {
  await auth(page)
  await request(page)
  const code = page.getByLabel('Código de 8 dígitos')
  for (const pasted of ['1234 5678', '1234-5678', ' 12345678 ']) {
    await code.fill('')
    await code.focus()
    // Colar respeita maxlength do navegador: o texto de 9–10 caracteres não pode ser cortado antes da limpeza.
    await page.keyboard.insertText(pasted)
    await expect(code).toHaveValue('12345678')
  }
})

test('erros ficam ligados ao campo e o foco volta para ele', async ({ page }) => {
  await auth(page, { verify: () => ({ status: 403, json: { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' } }) })
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Já tenho um código' }).click()
  const email = page.getByLabel('Seu e-mail')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription(/Digite o e-mail para o qual o código foi enviado/)
  await email.fill('organizer@example.test')
  await page.getByRole('button', { name: 'Já tenho um código' }).click()
  const code = page.getByLabel('Código de 8 dígitos')
  await code.fill('123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(code).toBeFocused()
  await expect(code).toHaveAccessibleDescription(/Digite os 8 números do código/)
  await code.fill('12345678')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(code).toHaveAccessibleDescription(/Código inválido ou expirado/)
  await expect(code).toBeFocused()
})

test('o campo do código já diz para onde o código foi enviado', async ({ page }) => {
  await auth(page)
  await request(page)
  await expect(page.getByLabel('Código de 8 dígitos')).toHaveAccessibleDescription(/Enviamos um código e um link para organizer@example\.test/)
})

test('pedir outro código confirma o novo envio', async ({ page }) => {
  await page.clock.install()
  await auth(page)
  await request(page)
  await expect(page.getByRole('status')).toContainText('Enviamos um código')
  await page.clock.runFor(61_000)
  await page.getByRole('button', { name: 'Pedir outro código', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Enviamos um novo código')
})

test('“Usar outro e-mail” tem área de toque de pelo menos 44 px', async ({ page }) => {
  await auth(page)
  await request(page)
  const box = await page.getByRole('button', { name: 'Usar outro e-mail' }).boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

test('a página inicial fala do código, não só do link', async ({ page }) => {
  await auth(page)
  await page.goto('/')
  await expect(page.getByText('Para organizar, entre com seu e-mail')).toContainText('código')
})

// Pedido do titular em 2026-09-17: o aviso de quem é convidado estava apagado
// (cinza pequeno sob um fio). É a saída de quem não deve entrar: ganha
// superfície própria, texto em tom de leitura e a pergunta em destaque.
test('o aviso de quem é convidado tem destaque, não cinza apagado', async ({ page }) => {
  await auth(page)
  await page.goto('/entrar')
  const note = page.getByText('Não precisa entrar', { exact: false })
  await expect(note).toBeVisible()
  const style = await note.evaluate(el => {
    const s = getComputedStyle(el)
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--color-muted').trim()
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim()
    const paint = (value: string) => { const probe = document.createElement('span'); probe.style.color = value; document.body.append(probe); const out = getComputedStyle(probe).color; probe.remove(); return out }
    return { color: s.color, background: s.backgroundColor, accent: s.borderLeftWidth, muted: paint(muted), ink: paint(ink) }
  })
  // Sai do cinza de texto secundário e passa a ter fundo e faixa de destaque.
  expect(style.color).not.toBe(style.muted)
  expect(style.color).toBe(style.ink)
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(parseFloat(style.accent)).toBeGreaterThanOrEqual(3)
  // A pergunta guia a leitura.
  await expect(note.locator('strong')).toHaveText('É convidado?')
  await accessible(page)
})

test('dois toques em “Entrar” mandam uma verificação só', async ({ page }) => {
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const calls = await auth(page)
  await page.route('**/auth/v1/verify**', async route => { await hold; await route.fallback() })
  await request(page)
  await page.getByLabel('Código de 8 dígitos').fill('12345678')
  await page.getByLabel('Código de 8 dígitos').press('Enter')
  await page.getByLabel('Código de 8 dígitos').press('Enter')
  release()
  await expect(page).toHaveURL(/\/eventos$/)
  expect(calls.filter(call => call.path === '/auth/v1/verify')).toHaveLength(1)
})

// Pedido do back (2026-09-17): quando o Auth não consegue entregar o e-mail,
// `/auth/v1/otp` responde 500 `unexpected_failure`. O texto genérico mandava
// conferir a conexão, que está boa — o problema é o endereço ou o remetente.
test('falha de envio do e-mail não é anunciada como problema de conexão', async ({ page }) => {
  await auth(page, { otp: () => ({ status: 500, json: { code: 'unexpected_failure', error_code: 'unexpected_failure', msg: 'Error sending confirmation email' } }) })
  await request(page)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Não conseguimos enviar o e-mail para este endereço')
  await expect(alert).not.toContainText('conexão')
  // Falha de envio não é limite de tentativas: pedir de novo continua liberado.
  await expect(page.getByRole('button', { name: 'Receber código de acesso' })).toBeEnabled()
  await accessible(page)
})

// Pedido do back (2026-09-17): quem abre uma página protegida sem sessão volta
// para ela depois de entrar, em vez de cair sempre em "Seus eventos".
test.describe('voltar à página pedida depois de entrar', () => {
  const protectedPath = '/eventos/20000000-0000-4000-8000-000000000002/convites'

  test('o código devolve a pessoa à página que ela tinha pedido', async ({ page }) => {
    await auth(page)
    await page.goto(protectedPath)
    await expect(page).toHaveURL(/\/entrar$/)
    await page.getByLabel('Seu e-mail').fill('organizer@example.test')
    await page.getByRole('button', { name: 'Receber código de acesso' }).click()
    await page.getByLabel('Código de 8 dígitos').fill('12345678')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${protectedPath}$`))
  })

  // O link do e-mail pode abrir noutra aba, onde o estado do router não existe:
  // o destino tem de sobreviver por fora dele. Aqui o pedido acontece primeiro,
  // e só depois a sessão aparece, como acontece ao abrir o link recebido.
  test('o link do e-mail também volta, mesmo abrindo o callback do zero', async ({ page }) => {
    await auth(page)
    await page.goto(protectedPath)
    await expect(page).toHaveURL(/\/entrar$/)
    await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
    await page.goto('/auth/callback')
    await expect(page).toHaveURL(new RegExp(`${protectedPath}$`))
  })

  test('sem página pedida, entrar continua indo para os eventos', async ({ page }) => {
    await auth(page)
    await request(page)
    await page.getByLabel('Código de 8 dígitos').fill('12345678')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/eventos$/)
  })

  // Redirecionamento aberto: um destino externo guardado levaria a pessoa, logo
  // depois de entrar, a um site que imita o chadbb.
  test('destino externo guardado à força é ignorado', async ({ page }) => {
    await auth(page)
    await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
    await page.goto('/entrar')
    await page.evaluate(() => localStorage.setItem('chadbb.login.destination',
      JSON.stringify({ path: '//evil.example/eventos', at: Date.now() })))
    await page.goto('/auth/callback')
    await expect(page).toHaveURL(/\/eventos$/)
    expect(new URL(page.url()).host, 'a pessoa não pode sair do site').toBe('127.0.0.1:4173')
    await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
  })
})
