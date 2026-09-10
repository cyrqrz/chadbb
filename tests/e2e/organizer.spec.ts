import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { EventRecord } from '../../src/features/events/model'

// Testes de comportamento da UI. Transporte Auth/PostgREST é simulado aqui;
// autorização e bloqueios são verificados separadamente no PostgreSQL real.
const userId = '00000000-0000-4000-8000-000000000001'
const eventId = '10000000-0000-4000-8000-000000000001'
function session() {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'organizer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp, role: 'authenticated', aud: 'authenticated' })).toString('base64url')}.fake-signature`
  return { access_token: token, refresh_token: 'fake-refresh-token', expires_in: 3600, expires_at: exp, token_type: 'bearer', user }
}
async function backend(page: Page, signedIn = false) {
  let record: EventRecord | null = null
  let conflict = false
  const calls: string[] = []
  if (signedIn) await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    calls.push(path)
    if (path.startsWith('/rest/v1/rpc/')) expect(request.headers().accept).toBe('application/vnd.pgrst.object+json')
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() ?? {} : {}
    let json: unknown = {}
    let status = 200
    const headers: Record<string, string> = {}
    if (path === '/auth/v1/token') json = session()
    else if (path === '/auth/v1/user') json = session().user
    else if (path === '/rest/v1/rpc/create_event') {
      record = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'draft', title: body.p_title,
        public_description: '', private_address: '', private_instructions: '', starts_at: null, cover_path: null, version: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
      json = record
    } else if (path === '/rest/v1/events') {
      json = record ? [record] : []
      headers['content-range'] = record ? '0-0/1' : '*/0'
    } else if (path === '/rest/v1/rpc/save_event' && record) {
      if (conflict) { json = { message: 'VERSION_CONFLICT', code: 'P0001' }; status = 400 }
      else {
        record = { ...record, title: body.p_title, public_description: body.p_public_description, starts_at: body.p_starts_at,
          private_address: body.p_private_address, private_instructions: body.p_private_instructions, cover_path: body.p_cover_path, version: record.version + 1 }
        json = record
      }
    } else if (path === '/rest/v1/rpc/transition_event' && record) { record = { ...record, status: body.p_status, version: record.version + 1 }; json = record }
    else if (path.startsWith('/storage/v1/object/')) json = { Key: path.split('/object/')[1] }
    else if (!['/auth/v1/otp', '/auth/v1/logout'].includes(path)) { status = 500; json = { message: 'Unexpected test request' } }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json), headers })
  })
  return { calls, conflict: () => { conflict = true }, getRecord: () => record }
}

test('página inicial, navegação por teclado e proteção das rotas', async ({ page }) => {
  await backend(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mais carinho')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused()
  await page.goto('/eventos')
  await expect(page).toHaveURL(/\/entrar$/)
  await expect(page.getByLabel('Seu e-mail')).toBeVisible()
  await page.goto('/rota-inexistente')
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
})

test('acesso por e-mail e retorno inválido sem credencial na URL', async ({ page }) => {
  const mock = await backend(page)
  await page.goto('/entrar')
  await page.getByLabel('Seu e-mail').fill('organizer@example.test')
  await page.getByRole('button', { name: 'Receber link de acesso' }).click()
  await expect(page.getByRole('status')).toContainText('Confira sua caixa')
  expect(mock.calls).toContain('/auth/v1/otp')
  await page.goto('/auth/callback?error=access_denied&error_description=secret-test')
  await expect(page.getByRole('heading', { name: 'Não foi possível entrar' })).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/callback$/)
  await expect(page.locator('body')).not.toContainText('secret-test')
})

test('retorno de login troca código uma vez, limpa URL e permite sair', async ({ page }) => {
  const mock = await backend(page)
  await page.addInitScript(() => localStorage.setItem('sb-e2e-auth-token-code-verifier', JSON.stringify('fake-verifier')))
  await page.goto('/auth/callback?code=fake-auth-code')
  await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
  expect(mock.calls.filter(path => path === '/auth/v1/token')).toHaveLength(1)
  await expect(page).toHaveURL(/\/eventos$/)
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Entre para organizar' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sb-e2e-auth-token'))).toBeNull()
})

async function createInBrowser(page: Page) {
  await page.goto('/eventos')
  await page.getByRole('button', { name: 'Criar evento' }).click()
  await page.getByLabel('Nome do evento').fill('Chá de bebê da Lia')
  await page.getByRole('button', { name: 'Criar rascunho' }).click()
  await expect(page.getByRole('heading', { name: 'Detalhes do evento' })).toBeVisible()
}

test('cria, edita, publica e encerra evento; layout cabe no celular', async ({ page }) => {
  const mock = await backend(page, true)
  await createInBrowser(page)
  await page.getByRole('button', { name: 'Publicar evento' }).click()
  await expect(page.getByRole('alert')).toContainText('data futura')
  await page.getByLabel('Data e horário').fill('2035-09-10T14:30')
  await page.getByLabel('Endereço privado').fill('Rua fictícia, 123')
  await page.getByLabel('Descrição pública').fill('Vamos celebrar juntos.')
  await expect(page.getByRole('button', { name: 'Publicar evento' })).toBeDisabled()
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  await page.getByRole('button', { name: 'Publicar evento' }).click()
  await expect(page.getByRole('status')).toHaveText('Evento publicado.')
  expect(mock.getRecord()?.private_address).toBe('Rua fictícia, 123')
  await page.getByRole('button', { name: 'Encerrar evento', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.getByRole('status')).toHaveText('Evento encerrado.')
  await expect(page.getByLabel('Nome do evento')).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/event-${test.info().project.name}.png`, fullPage: true })
})

test('conflito conserva alterações locais e explica recuperação', async ({ page }) => {
  const mock = await backend(page, true)
  await createInBrowser(page)
  mock.conflict()
  await page.getByLabel('Nome do evento').fill('Minha alteração local')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('alert')).toContainText('outra aba')
  await expect(page.getByLabel('Nome do evento')).toHaveValue('Minha alteração local')
  page.once('dialog', dialog => void dialog.accept())
  await page.getByRole('button', { name: 'Recarregar dados' }).click()
  await expect(page.getByLabel('Nome do evento')).toHaveValue('Chá de bebê da Lia')
})

test('upload exige autorização pública e arquivo permitido', async ({ page }) => {
  const mock = await backend(page, true)
  await createInBrowser(page)
  await page.getByLabel('Imagem de capa (opcional)').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('fake-test-image') })
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('alert')).toContainText('Autorize')
  expect(mock.calls.some(path => path.includes('/storage/'))).toBe(false)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  expect(mock.getRecord()?.cover_path).toMatch(new RegExp(`^${userId}/${eventId}/.+\\.png$`))
})

test('retorno usa o verificador do fluxo correto entre abas', async ({ page }) => {
  const mock = await backend(page)
  const flowId = 'a'.repeat(32)
  await page.addInitScript(id => {
    localStorage.setItem(`sb-e2e-auth-token-flow-${id}-code-verifier`, JSON.stringify('correct-flow-verifier'))
    localStorage.setItem('sb-e2e-auth-token-code-verifier', JSON.stringify('other-tab-verifier'))
  }, flowId)
  let verifier: string | undefined
  page.on('request', request => {
    if (request.url().includes('/auth/v1/token')) verifier = request.postDataJSON().code_verifier
  })
  await page.goto(`/auth/callback?code=fake-auth-code&sb_flow_id=${flowId}`)
  await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
  expect(mock.calls.filter(path => path === '/auth/v1/token')).toHaveLength(1)
  expect(verifier).toBe('correct-flow-verifier')
  await expect(page).toHaveURL(/\/eventos$/)
})

test('sessão expirada retorna ao acesso sem carregar eventos privados', async ({ page }) => {
  const mock = await backend(page)
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify({ ...value, expires_at: 1 })), session())
  await page.route('https://e2e.supabase.co/auth/v1/token**', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'refresh_token_not_found', message: 'Refresh Token Not Found' }) }))
  await page.goto('/eventos')
  await expect(page).toHaveURL(/\/entrar$/)
  await expect(page.getByLabel('Seu e-mail')).toBeVisible()
  expect(mock.calls).not.toContain('/rest/v1/events')
})
