import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { EventRecord } from '../../src/features/events/model'
import { session, userId } from './session'

// Testes de comportamento da UI. Transporte Auth/PostgREST é simulado aqui;
// autorização e bloqueios são verificados separadamente no PostgreSQL real.
const eventId = '10000000-0000-4000-8000-000000000001'
async function backend(page: Page, signedIn = false) {
  let record: EventRecord | null = null
  let conflict = false
  // Mudança aplicada por "outra aba": o servidor muda, mas esta aba recebe VERSION_CONFLICT.
  const elsewhere = new Set<string>()
  const calls: string[] = []
  if (signedIn) await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    calls.push(path)
    if (path.startsWith('/rest/v1/rpc/') && path !== '/rest/v1/rpc/organizer_invitations') expect(request.headers().accept).toBe('application/vnd.pgrst.object+json')
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() ?? {} : {}
    let json: unknown = {}
    let status = 200
    const headers: Record<string, string> = {}
    if (path === '/auth/v1/token') json = session()
    else if (path === '/auth/v1/user') json = session().user
    else if (path === '/rest/v1/rpc/create_event') {
      record = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'draft', title: body.p_title,
        public_description: '', private_address: '', private_instructions: '', starts_at: null, ends_at: null, personal_data_purged_at: null, guests_done_at: null, gifts_done_at: null, cover_path: null, version: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
      json = record
    } else if (path === '/rest/v1/events') {
      json = record ? [record] : []
      headers['content-range'] = record ? '0-0/1' : '*/0'
    } else if (path === '/rest/v1/rpc/save_event' && record) {
      if (conflict) { json = { message: 'VERSION_CONFLICT', code: 'P0001' }; status = 400 }
      else {
        record = { ...record, title: body.p_title, public_description: body.p_public_description, starts_at: body.p_starts_at, ends_at: body.p_ends_at,
          private_address: body.p_private_address, private_instructions: body.p_private_instructions, cover_path: body.p_cover_path, version: record.version + 1 }
        json = record
      }
    } else if (path === '/rest/v1/rpc/transition_event' && record) { record = { ...record, status: body.p_status, version: record.version + 1 }; json = record }
    else if (path === '/rest/v1/rpc/set_event_step' && record) {
      record = { ...record, [`${body.p_step}_done_at`]: body.p_done ? '2026-01-02T00:00:00Z' : null, version: record.version + 1 }; json = record
    } else if (path === '/rest/v1/rpc/organizer_invitations') json = { invitations: [], items: [], reservations: [] }
    else if (['/rest/v1/event_items', '/rest/v1/products'].includes(path)) { json = []; headers['content-range'] = '*/0' }
    else if (path.startsWith('/storage/v1/object/')) json = { Key: path.split('/object/')[1] }
    else if (!['/auth/v1/otp', '/auth/v1/logout'].includes(path)) { status = 500; json = { message: 'Unexpected test request' } }
    if (elsewhere.delete(path)) { status = 400; json = { message: 'VERSION_CONFLICT', code: 'P0001' } }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json), headers })
  })
  return { calls, conflict: () => { conflict = true }, getRecord: () => record, elsewhere: (rpc: string) => elsewhere.add(`/rest/v1/rpc/${rpc}`),
    seed: (fields: Partial<EventRecord>) => { record = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de bebê da Lia',
      public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z', personal_data_purged_at: null,
      guests_done_at: null, gifts_done_at: null, cover_path: null, version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...fields } } }
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
  await page.getByRole('button', { name: 'Receber código de acesso' }).click()
  await expect(page.getByRole('status')).toContainText('Confira a caixa de entrada')
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
  await page.getByLabel('Nome do evento').fill('Chá de bebê da Lia')
  await page.getByRole('button', { name: 'Criar evento' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/dados$`))
  await expect(page.getByRole('heading', { name: 'Dados do evento' })).toBeVisible()
}

test('cria, edita, publica e encerra evento; layout cabe no celular', async ({ page }) => {
  const mock = await backend(page, true)
  await createInBrowser(page)
  await page.getByRole('button', { name: 'Publicar evento' }).click()
  await expect(page.getByRole('alert')).toContainText('data futura')
  await page.getByLabel('Data e horário').fill('2035-09-10T14:30')
  await page.getByLabel('Término').fill('2035-09-10T18:00')
  await page.getByLabel('Endereço privado').fill('Rua fictícia, 123')
  await page.getByLabel('Descrição pública').fill('Vamos celebrar juntos.')
  await expect(page.getByRole('button', { name: 'Publicar evento' })).toBeDisabled()
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  await page.getByRole('button', { name: 'Publicar evento' }).click()
  await expect(page.getByRole('status')).toContainText('Evento publicado.')
  expect(mock.getRecord()?.private_address).toBe('Rua fictícia, 123')
  // Com a barra de etapas pendentes na tela, o foco não pode ficar escondido atrás dela.
  const closeButton = page.getByRole('button', { name: 'Encerrar evento', exact: true })
  await page.getByLabel('Instruções aos convidados').focus()
  while (!await closeButton.evaluate(el => el === document.activeElement)) await page.keyboard.press('Tab')
  const [button, dock] = await Promise.all([closeButton.boundingBox(), page.locator('.setup-dock-inner').boundingBox()])
  expect(button!.y + button!.height).toBeLessThanOrEqual(dock!.y)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(page.getByRole('status')).toHaveText('Evento encerrado.')
  await expect(page.getByLabel('Nome do evento')).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/event-${test.info().project.name}.png`, fullPage: true })
})

test('fluxo de criação: prévia, publicação e etapas pendentes até o evento ficar pronto', async ({ page }) => {
  const mock = await backend(page, true)
  await page.goto('/eventos')
  // Primeiro uso: o formulário já está aberto no aviso vazio.
  await expect(page.getByRole('heading', { name: 'Seu primeiro encontro começa aqui.' })).toBeVisible()
  await createInBrowser(page)
  await expect(page.getByText('Evento criado.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Áreas do evento' })).toHaveCount(0)
  await page.getByLabel('Data e horário').fill('2035-09-10T14:30')
  await page.getByLabel('Término').fill('2035-09-10T18:00')
  // Com alteração não salva, a prévia espera: sair da tela perderia o que foi digitado.
  await expect(page.getByRole('button', { name: 'Ver prévia' }).first()).toBeDisabled()
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status')).toHaveText('Alterações salvas.')
  await page.getByRole('link', { name: 'Ver prévia' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/previa$`))
  await expect(page.getByRole('link', { name: 'Editar dados' })).toHaveAttribute('href', `/eventos/${eventId}/dados`)
  await page.getByRole('button', { name: 'Publicar evento' }).click()
  const published = page.getByRole('status').filter({ hasText: 'Evento publicado.' })
  await expect(published).toBeFocused()
  expect(mock.getRecord()?.status).toBe('published')
  await expect(page.getByRole('navigation', { name: 'Etapas pendentes' })).toContainText('Faltam 2 etapas')
  await published.getByRole('link', { name: 'Seguir para convidados e presença' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`))
  const dock = page.getByRole('navigation', { name: 'Etapas pendentes' })
  await expect(dock.getByRole('link')).toHaveText(['Convidados', 'Presentes'])
  // A barra fica presa ao rodapé da janela, não ao fim da página (a animação de
  // entrada de `.page` cria um bloco de contenção que prende `position: fixed`).
  const anchored = await dock.evaluate(el => Math.abs(el.getBoundingClientRect().bottom - window.innerHeight) <= 1)
  expect(anchored).toBe(true)
  await page.getByRole('button', { name: 'Concluí convidados e presença' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Etapa concluída.' })).toBeFocused()
  await expect(dock).toContainText('Falta 1 etapa')
  await expect(dock.getByRole('link')).toHaveText(['Presentes'])
  // O fluxo não prende: a lista de eventos avisa a pendência.
  await page.getByRole('link', { name: 'Seus eventos' }).first().click()
  await expect(page.getByText('1 etapa pendente')).toBeVisible()
  await page.getByRole('link', { name: /Chá de bebê da Lia/ }).click()
  await page.getByRole('navigation', { name: 'Etapas pendentes' }).getByRole('link', { name: 'Presentes' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/presentes$`))
  const finish = page.getByRole('button', { name: 'Concluí a lista de presentes' })
  await finish.scrollIntoViewIfNeeded()
  await finish.click()
  await expect(page.getByRole('status').filter({ hasText: 'Tudo pronto!' })).toBeFocused()
  await expect(page.getByRole('navigation', { name: 'Etapas pendentes' })).toHaveCount(0)
  await page.goto(`/eventos/${eventId}/dados`)
  await expect(page.getByRole('navigation', { name: 'Áreas do evento' })).toBeVisible()
  // Reabrir devolve a pendência.
  await page.goto(`/eventos/${eventId}/presentes`)
  await page.getByRole('button', { name: 'Reabrir etapa' }).click()
  await expect(page.getByRole('navigation', { name: 'Etapas pendentes' })).toContainText('Falta 1 etapa')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('prévia: publicação já feita em outra aba mostra o evento publicado, não um erro', async ({ page }) => {
  const mock = await backend(page, true)
  mock.seed({ status: 'draft' })
  await page.goto(`/eventos/${eventId}/previa`)
  mock.elsewhere('transition_event')
  await page.getByRole('button', { name: 'Publicar evento' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Evento publicado.' })).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Seguir para convidados e presença' })).toBeVisible()
})

test('cabeçalho: alteração pendente exige confirmação para sair da edição', async ({ page }) => {
  const mock = await backend(page, true)
  mock.seed({ guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z' })
  await page.goto(`/eventos/${eventId}/dados`)
  await expect(page.getByRole('navigation', { name: 'Áreas do evento' })).toBeVisible()
  await page.getByLabel('Nome do evento').fill('Rascunho não salvo')

  // Cancelar no diálogo: permanece na tela e o rascunho continua intacto.
  page.once('dialog', dialog => void dialog.dismiss())
  await page.getByRole('navigation', { name: 'Áreas do evento' }).getByRole('link', { name: 'Painel' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/dados$`))
  await expect(page.getByLabel('Nome do evento')).toHaveValue('Rascunho não salvo')

  // A prévia do cabeçalho pede a mesma confirmação.
  page.once('dialog', dialog => void dialog.dismiss())
  await page.getByRole('link', { name: 'Ver como o convidado vê' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/dados$`))
  await expect(page.getByLabel('Nome do evento')).toHaveValue('Rascunho não salvo')

  // Confirmar no diálogo: a navegação segue normalmente.
  page.once('dialog', dialog => void dialog.accept())
  await page.getByRole('link', { name: 'Ver como o convidado vê' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/previa$`))
  expect(mock.getRecord()?.title).not.toBe('Rascunho não salvo')
})

test('cabeçalho: sem alteração pendente navega sem pedir confirmação', async ({ page }) => {
  const mock = await backend(page, true)
  mock.seed({ guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z' })
  await page.goto(`/eventos/${eventId}/dados`)
  await page.getByRole('navigation', { name: 'Áreas do evento' }).getByRole('link', { name: 'Painel' }).click()
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`))
})

test('etapa concluída em outra aba: sem erro para tentar de novo', async ({ page }) => {
  const mock = await backend(page, true)
  mock.seed({})
  await page.goto(`/eventos/${eventId}`)
  mock.elsewhere('set_event_step')
  await page.getByRole('button', { name: 'Concluí convidados e presença' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'já tinha sido concluída em outra aba' })).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Etapa concluída: convidados e presença')).toBeVisible()
})

test('barra de etapas: com texto a 200% deixa de flutuar e não cobre a tela', async ({ page }) => {
  const mock = await backend(page, true)
  mock.seed({})
  await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%' }))
  await page.goto(`/eventos/${eventId}/dados`)
  const dock = page.getByRole('navigation', { name: 'Etapas pendentes' })
  await expect(dock).toBeAttached()
  await expect.poll(() => dock.evaluate(el => getComputedStyle(el).position)).toBe('static')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
