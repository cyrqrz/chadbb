import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import type { Dashboard, Invitation } from '../../src/features/guests/api'
import { session, userId } from './session'

// Painel do organizador com backend simulado e dados fictícios.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
function invitation(n: number, fields: Partial<Invitation>): Invitation {
  return { id: `30000000-0000-4000-8000-00000000000${n}`, name: `Convidado fictício ${n}`, kind: 'family', capacity: 4, response: 'pending',
    attending: 0, version: 1, revoked: false, expires_at: '2035-09-17T17:30:00Z', ...fields }
}
const diaper = (n: number, size: 'P' | 'M' | 'G' | 'XG', limit: number, committed: number) =>
  ({ id: `40000000-0000-4000-8000-00000000000${n}`, title: `Fraldas tamanho ${size}`, category: 'fralda' as const, diaper_size: size, limit, committed })
const treat = (n: number, title: string, committed: number) =>
  ({ id: `50000000-0000-4000-8000-00000000000${n}`, title, category: 'mimo' as const, diaper_size: null, limit: null, committed })
const full: Dashboard = {
  invitations: [
    invitation(1, { response: 'yes', attending: 3 }),
    invitation(2, { response: 'no', kind: 'individual', capacity: 1 }),
    invitation(3, { response: 'maybe' }),
    invitation(4, { response: 'yes', attending: 2, revoked: true }),
    invitation(5, {}),
  ],
  items: [diaper(1, 'P', 6, 6), diaper(2, 'M', 19, 4), diaper(3, 'G', 19, 0), diaper(4, 'XG', 6, 1), treat(1, 'Mamadeira fictícia', 2), treat(2, 'Pomada fictícia', 0)],
  reservations: [
    { name: 'Convidado fictício 1', title: 'Fraldas tamanho P', category: 'fralda', diaper_size: 'P', quantity: 6, status: 'reserved' },
    { name: 'Convidado fictício 1', title: 'Mamadeira fictícia', category: 'mimo', diaper_size: null, quantity: 2, status: 'purchase_declared' },
  ],
}

type Reply = (request: { url: URL; body: Record<string, unknown> }) => { status: number; json: unknown; headers?: Record<string, string> }
const none: Reply = () => ({ status: 200, json: [], headers: { 'content-range': '*/0' } })
async function backend(page: Page, dashboard: Reply, events: Reply = () => ({ status: 200, json: [event] }), rest: Record<string, Reply> = {}) {
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = route.request().postDataJSON() ?? {}
    let result: ReturnType<Reply> = { status: 500, json: { message: 'Unexpected test request' } }
    if (path === '/auth/v1/user') result = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') result = events({ url, body })
    else if (path === '/rest/v1/rpc/organizer_invitations') result = dashboard({ url, body })
    else if (rest[path]) result = rest[path]({ url, body })
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.json), headers: { 'access-control-expose-headers': 'content-range', ...result.headers } })
  })
}
async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('painel separa convites, pessoas, fraldas por tamanho e mimos', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: full }))
  await page.goto(`/eventos/${eventId}/convites`)
  const people = page.getByRole('article', { name: 'Pessoas' })
  await expect(people).toContainText('5pessoas confirmadas')
  const answers = page.getByRole('article', { name: 'Convites' })
  await expect(answers).toContainText('4 de 5convites respondidos')
  await expect(answers.getByRole('definition')).toHaveText(['2', '1', '1', '1'])
  await expect(answers).toContainText('1 convite está com acesso revogado.')

  const sizes = page.getByRole('region', { name: 'Fraldas por tamanho' }).getByRole('listitem')
  await expect(sizes).toHaveCount(4)
  await expect(sizes.filter({ hasText: 'Tamanho P' })).toContainText('6 de 6')
  await expect(sizes.filter({ hasText: 'Tamanho P' })).toContainText('Tamanho completo')
  await expect(sizes.filter({ hasText: 'Tamanho M' })).toContainText('15 disponíveis')
  await expect(sizes.filter({ hasText: 'Tamanho XG' })).toContainText('5 disponíveis')

  const treats = page.getByRole('region', { name: 'Mimos', exact: true })
  await expect(treats.getByRole('listitem').first()).toHaveText('Mamadeira fictícia2 unidades')
  await treats.getByText('Mimos ainda não escolhidos (1)').click()
  await expect(treats.getByText('Pomada fictícia')).toBeVisible()

  const choices = page.getByRole('region', { name: 'Escolhas dos convidados' })
  await expect(choices).toContainText('só uma declaração do convidado')
  await expect(choices.getByRole('heading', { name: 'Fraldas' })).toBeVisible()
  await expect(choices.getByRole('heading', { name: 'Mimos' })).toBeVisible()
  await expect(choices.getByText('Compra informada', { exact: true })).toBeVisible()
  await expectAccessible(page)
  await page.screenshot({ path: `test-results/panel-${test.info().project.name}.png`, fullPage: true })
})

test('painel usa o resumo e o saldo enviados pelo servidor', async ({ page }) => {
  const fromServer = { ...full,
    summary: { invitations: { total: 5, answered: 3, yes: 1, no: 1, maybe: 1, pending: 2, revoked: 1 }, people_confirmed: 3 },
    items: full.items.map(item => ({ ...item, available: item.diaper_size === 'M' ? 11 : item.limit === null ? null : 0 })) }
  await backend(page, () => ({ status: 200, json: fromServer }))
  await page.goto(`/eventos/${eventId}/convites`)
  await expect(page.getByRole('article', { name: 'Pessoas' })).toContainText('3pessoas confirmadas')
  await expect(page.getByRole('article', { name: 'Convites' })).toContainText('3 de 5convites respondidos')
  const sizes = page.getByRole('region', { name: 'Fraldas por tamanho' }).getByRole('listitem')
  await expect(sizes.filter({ hasText: 'Tamanho M' })).toContainText('11 disponíveis')
  await expect(sizes.filter({ hasText: 'Tamanho G' })).toContainText('Tamanho completo')
})

test('painel vazio orienta o próximo passo', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: { invitations: [], items: [], reservations: [] } }))
  await page.goto(`/eventos/${eventId}/convites`)
  await expect(page.getByRole('article', { name: 'Pessoas' })).toContainText('0pessoas confirmadas')
  await expect(page.getByText('Nenhum tamanho de fralda na lista.')).toBeVisible()
  await expect(page.getByText('Nenhum mimo na lista.')).toBeVisible()
  await expect(page.getByText('Nenhum convite ainda.')).toBeVisible()
  await expect(page.getByText('Nenhuma escolha ainda.')).toBeVisible()
  await expectAccessible(page)
})

test('falha ao abrir o painel mostra erro e permite tentar de novo', async ({ page }) => {
  let failing = true
  await backend(page, () => failing ? { status: 503, json: { message: 'unavailable' } } : { status: 200, json: full })
  await page.goto(`/eventos/${eventId}/convites`)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Não foi possível abrir o painel.', { timeout: 15_000 })
  await expectAccessible(page)
  failing = false
  await alert.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
})

test('detalhes e lista de presentes mostram o mesmo estado de erro', async ({ page }) => {
  let failing = true
  await backend(page, () => ({ status: 200, json: full }), () => failing ? { status: 500, json: { message: 'unavailable' } } : { status: 200, json: [event] })
  for (const [path, title] of [[`/eventos/${eventId}`, 'Não foi possível abrir o evento.'], [`/eventos/${eventId}/presentes`, 'Não foi possível abrir a lista.']]) {
    await page.goto(path)
    await expect(page.getByRole('alert')).toContainText(title)
    await expectAccessible(page)
  }
  failing = false
  await page.getByRole('alert').getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByRole('heading', { name: 'Lista de presentes' })).toBeVisible()
})

const product = (n: number, size: 'P' | 'M' | 'G' | 'XG') => ({ id: `80000000-0000-4000-8000-00000000000${n}`, title: `Fraldas tamanho ${size}`,
  description: 'Uma unidade equivale a um pacote.', platform: 'manual', category: 'fralda', diaper_size: size, active: true })
test('catálogo marca o que já está na lista e destaca a lista pronta', async ({ page }) => {
  const g = product(1, 'G')
  const listedG = { id: '90000000-0000-4000-8000-000000000009', event_id: eventId, product_id: g.id, quantity_requested: 12, category: 'fralda', diaper_size: 'G', version: 1, product: g }
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': () => ({ status: 200, json: [listedG], headers: { 'content-range': '0-0/1' } }),
    '/rest/v1/products': () => ({ status: 200, json: [g, product(2, 'M')], headers: { 'content-range': '0-1/2' } }),
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByRole('button', { name: 'Completar a lista do chá' })).toBeVisible()
  const catalog = page.getByRole('region', { name: 'Incluir itens avulsos' })
  const cardG = catalog.getByRole('article').filter({ hasText: 'Fraldas tamanho G' })
  await expect(cardG).toContainText('Já na lista')
  await expect(cardG.getByRole('button')).toHaveCount(0)
  await expect(catalog.getByText('Catálogo manual')).toHaveCount(0)
  await expect(catalog.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mimos', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expectAccessible(page)
})

test('lista vazia recomenda a lista pronta do chá', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: full }), undefined, { '/rest/v1/event_items': none, '/rest/v1/products': none })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByRole('region', { name: 'Comece com a lista pronta do chá' })).toContainText('Recomendado')
  await expect(page.getByRole('button', { name: 'Preparar lista do chá' })).toBeVisible()
  await expectAccessible(page)
})

test('evento encerrado fica só para leitura, sem envio de imagem', async ({ page }) => {
  const closed = { ...event, status: 'closed' }
  await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [closed] }))
  await page.goto(`/eventos/${eventId}`)
  await expect(page.getByText('Este evento foi encerrado.')).toBeVisible()
  await expect(page.getByLabel('Nome do evento')).toBeDisabled()
  await expect(page.getByLabel('Imagem de capa (opcional)')).toHaveCount(0)
  const style = await page.getByLabel('Nome do evento').evaluate(el => getComputedStyle(el).borderStyle)
  expect(style).toBe('dashed')
  await expectAccessible(page)
})

test('falha ao conferir a lista avisa no catálogo e some quando a consulta volta', async ({ page }) => {
  let failing = true
  const g = product(1, 'G')
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url, body }) => !url.searchParams.get('select')?.startsWith('product_id,') ? none({ url, body })
      : failing ? { status: 500, json: { message: 'unavailable' } }
      : { status: 200, json: [{ product_id: g.id, diaper_size: 'G' }], headers: { 'content-range': '0-0/1' } },
    '/rest/v1/products': () => ({ status: 200, json: [g, product(2, 'M')], headers: { 'content-range': '0-1/2' } }),
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  const catalog = page.getByRole('region', { name: 'Incluir itens avulsos' })
  const alert = catalog.getByRole('alert')
  await expect(alert).toContainText('Não foi possível conferir o que já está na lista', { timeout: 15_000 })
  await expectAccessible(page)
  // Enquanto confere de novo, o aviso continua no lugar e o botão fica indisponível.
  const retry = alert.getByRole('button', { name: 'Tentar novamente' })
  await retry.click()
  await expect(retry).toBeDisabled()
  await expect(retry).toBeEnabled({ timeout: 10_000 })
  failing = false
  await retry.click()
  await expect(alert).toHaveCount(0)
  await expect(catalog.getByRole('article').filter({ hasText: 'Fraldas tamanho G' })).toContainText('Já na lista')
  await expect(catalog.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })).toBeVisible()
})

const rotated = { id: full.invitations[2].id, token: 'b'.repeat(64) }
function actions(replies: Record<string, ReturnType<Reply>>): Reply {
  return ({ body }) => replies[String(body.p_action)] ?? { status: 200, json: full }
}
async function openEdit(page: Page) {
  await page.goto(`/eventos/${eventId}/convites`)
  await page.getByRole('button', { name: 'Editar convite de Convidado fictício 1' }).click()
  return { create: page.getByRole('region', { name: 'Convide alguém especial' }), edit: page.getByRole('region', { name: 'Editar convite' }) }
}
async function confirmAnd(page: Page, invitation: string, action: string) {
  page.once('dialog', dialog => void dialog.accept())
  await page.getByRole('listitem').filter({ hasText: invitation }).getByRole('button', { name: action }).click()
}

test('reemitir link com edição aberta mostra o aviso junto do link novo', async ({ page }) => {
  await backend(page, actions({ rotate: { status: 200, json: rotated } }))
  const { create, edit } = await openEdit(page)
  await confirmAnd(page, 'Convidado fictício 3', 'Reemitir link')
  await expect(create.getByRole('status')).toHaveText('Convite pronto. Copie o link e envie pelo WhatsApp.')
  await expect(create.getByLabel('Link para compartilhar')).toBeFocused()
  await expect(edit.getByRole('status')).toHaveCount(0)
  await expect(edit).toBeVisible()
})

test('revogar com edição aberta avisa no formulário de convite', async ({ page }) => {
  await backend(page, actions({ revoke: { status: 200, json: { id: full.invitations[2].id } } }))
  const { create, edit } = await openEdit(page)
  await confirmAnd(page, 'Convidado fictício 3', 'Revogar acesso')
  await expect(create.getByRole('status')).toContainText('Convite revogado.')
  await expect(edit.getByRole('status')).toHaveCount(0)
  await expect(edit).toBeVisible()
})

test('erro ao revogar com edição aberta aparece no formulário de convite', async ({ page }) => {
  await backend(page, actions({ revoke: { status: 400, json: { message: 'INVITATION_NOT_FOUND' } } }))
  const { create, edit } = await openEdit(page)
  await confirmAnd(page, 'Convidado fictício 3', 'Revogar acesso')
  await expect(create.getByRole('alert')).toHaveText('Convite não encontrado ou sem permissão.')
  await expect(edit.getByRole('alert')).toHaveCount(0)
})

test('erro ao salvar fica na edição, não muda de lugar ao copiar e some ao cancelar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await backend(page, actions({ rotate: { status: 200, json: rotated }, update: { status: 400, json: { message: 'INVITATION_VERSION_CONFLICT' } } }))
  const { create, edit } = await openEdit(page)
  await confirmAnd(page, 'Convidado fictício 3', 'Reemitir link')
  await expect(create.getByLabel('Link para compartilhar')).toBeFocused()
  await edit.getByRole('button', { name: 'Salvar convite' }).click()
  await expect(edit.getByRole('alert')).toHaveText('Este convite mudou. Atualize o painel e revise os dados antes de salvar.')
  await expect(create.getByRole('status')).toHaveCount(0)
  await expect(create.getByRole('alert')).toHaveCount(0)
  await expectAccessible(page)

  await create.getByRole('button', { name: 'Copiar convite' }).click()
  await expect(create.getByRole('status')).toHaveText('Link copiado.')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/convite#${rotated.token}`)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(edit.getByRole('status')).toHaveCount(0)

  await edit.getByRole('button', { name: 'Salvar convite' }).click()
  await expect(edit.getByRole('alert')).toBeVisible()
  await edit.getByRole('button', { name: 'Cancelar edição' }).click()
  await expect(edit).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const status of ['published', 'closed'] as const) {
  test(`detalhes do evento (${status}) cabem em 320 px com texto a 200%`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, status }] }))
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByLabel('Término')).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBe(0)
  })
}

test('tentar de novo pelo teclado mantém o foco no botão', async ({ page }) => {
  await backend(page, () => ({ status: 500, json: { message: 'unavailable' } }))
  await page.goto(`/eventos/${eventId}/convites`)
  const retry = page.getByRole('alert').getByRole('button', { name: 'Tentar novamente' })
  await expect(retry).toBeVisible({ timeout: 15_000 })
  // Atrasa as próximas respostas para observar o botão durante a tentativa.
  await page.route('**/rest/v1/rpc/organizer_invitations', async route => { await new Promise(resolve => setTimeout(resolve, 800)); await route.fallback() })
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(retry).toHaveAttribute('aria-disabled', 'true')
  await expect(retry).toBeFocused()
  await expect(retry).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 })
  await expect(retry).toBeFocused()
})

test('links de voltar têm área de toque de 44 px', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: full }))
  await page.goto(`/eventos/${eventId}/convites`)
  const back = page.getByRole('link', { name: 'Detalhes do evento' })
  await expect(back).toBeVisible()
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test('falha de atualização nos detalhes não apaga o que está sendo digitado', async ({ page }) => {
  let failing = false
  await backend(page, () => ({ status: 200, json: full }), () => failing ? { status: 500, json: { message: 'unavailable' } } : { status: 200, json: [event] })
  await page.goto(`/eventos/${eventId}`)
  await page.getByLabel('Endereço privado').fill('Rascunho fictício em andamento')
  failing = true
  await expect(page.getByRole('alert')).toContainText('Os dados abaixo são da última consulta.', { timeout: 20_000 })
  await expect(page.getByLabel('Endereço privado')).toHaveValue('Rascunho fictício em andamento')
})

test('falha de atualização na lista de presentes mantém a tela', async ({ page }) => {
  let failing = false
  await backend(page, () => ({ status: 200, json: full }), () => failing ? { status: 500, json: { message: 'unavailable' } } : { status: 200, json: [event] },
    { '/rest/v1/event_items': none, '/rest/v1/products': none })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByRole('heading', { name: 'Fraldas na lista' })).toBeVisible()
  failing = true
  await page.waitForResponse(r => r.url().includes('/rest/v1/events') && r.status() === 500, { timeout: 20_000 })
  await page.waitForTimeout(300)
  await expect(page.getByRole('heading', { name: 'Fraldas na lista' })).toBeVisible()
})

test('voltar a uma tela que falhou mostra carregando, não o erro antigo', async ({ page }) => {
  let delay = 0
  await backend(page, () => ({ status: 200, json: full }), () => ({ status: 500, json: { message: 'unavailable' } }))
  await page.goto(`/eventos/${eventId}`)
  await expect(page.getByRole('heading', { name: 'Detalhes do evento' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toContainText('Não foi possível abrir o evento.')
  await page.getByRole('link', { name: 'Seus eventos' }).click()
  await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
  delay = 1500
  await page.route('**/rest/v1/events**', async route => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); await route.fallback() })
  await page.goBack()
  // A consulta em cache ainda guarda o erro, mas a nova tentativa ao montar é uma carga nova.
  await expect(page.getByRole('status').filter({ hasText: 'Carregando evento…' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Não foi possível abrir o evento.', { timeout: 15_000 })
})

test.describe('G2.1 · card de convidado', () => {
  test.beforeEach(async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}/convites`)
    await expect(page.getByRole('heading', { name: 'Convidado fictício 1' })).toBeVisible()
    // Os botões só ficam disponíveis depois que o evento (publicado) carrega.
    await expect(page.getByRole('button', { name: 'Editar convite de Convidado fictício 1' })).toBeEnabled()
  })
  const card = (page: Page, n: number) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `Convidado fictício ${n}`, exact: true }) })
  const radius = (locator: ReturnType<Page['locator']>) => locator.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius))

  test('editar mostra só "Editar convite" e mantém o nome para o leitor de tela', async ({ page }) => {
    const edit = card(page, 3).getByRole('button', { name: 'Editar convite de Convidado fictício 3' })
    await expect(edit).toBeVisible()
    // Texto visível: tudo menos o complemento em .sr-only (só para leitor de tela).
    expect(await edit.evaluate(el => { const copy = el.cloneNode(true) as HTMLElement; copy.querySelectorAll('.sr-only').forEach(n => n.remove()); return copy.textContent?.trim() })).toBe('Editar convite')
  })

  test('forma: card e botões sem cápsula, selo continua pill', async ({ page }) => {
    const item = card(page, 1)
    expect(await radius(item)).toBeLessThanOrEqual(16)
    for (const name of [/^Editar convite/, 'Reemitir link', 'Revogar acesso']) {
      const button = item.getByRole('button', { name })
      expect(await radius(button)).toBeLessThanOrEqual(12)
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await radius(item.locator('.badge').first())).toBeGreaterThan(100)
  })

  test('revogar é botão de ação destrutiva, sem aparência de link', async ({ page }) => {
    const revoke = card(page, 1).getByRole('button', { name: 'Revogar acesso' })
    await expect(revoke).toHaveClass(/btn-danger/)
    expect(await revoke.evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none')
  })

  test('só uma ação domina: nenhum botão preenchido dentro do card', async ({ page }) => {
    const filled = await card(page, 1).getByRole('button').evaluateAll(buttons => buttons.filter(b => {
      const bg = getComputedStyle(b).backgroundColor
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && bg !== 'transparent'
    }).length)
    expect(filled).toBe(0)
  })

  test('foco visível no teclado', async ({ page }) => {
    const edit = card(page, 1).getByRole('button', { name: /^Editar convite/ })
    await edit.focus()
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab')
    await expect(edit).toBeFocused()
    expect(await edit.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('3px')
  })

  test('alto contraste do sistema mantém o contorno dos botões', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    const border = (locator: ReturnType<Page['locator']>) => locator.evaluate(el => { const s = getComputedStyle(el); return `${s.borderTopStyle} ${s.borderTopWidth} ${s.borderTopColor}` })
    for (const name of [/^Editar convite/, 'Reemitir link', 'Revogar acesso']) {
      // Cor visível (não transparente) além do estilo: é o que desenha o contorno.
      expect(await border(card(page, 1).getByRole('button', { name }))).toMatch(/^solid [1-9][.0-9]*px rgb\(/)
    }
    // A trilha da barra de progresso perde o fundo nas cores forçadas; o contorno mostra o total.
    const meters = page.locator('.meter')
    await expect(meters.first()).toBeAttached()
    for (const meter of await meters.all()) expect(await border(meter)).toMatch(/^solid 1px rgb\(/)
  })

  test('card médio não deixa "Revogar acesso" sozinho à direita numa segunda linha', async ({ page }) => {
    // Viewport de 1000 px: dois cards por linha, cada um com ~450 px; as três ações não cabem numa linha.
    await page.setViewportSize({ width: 1000, height: 900 })
    const item = card(page, 1)
    const edit = (await item.getByRole('button', { name: /^Editar convite/ }).boundingBox())!
    const revoke = (await item.getByRole('button', { name: 'Revogar acesso' }).boundingBox())!
    if (revoke.y > edit.y + 1) expect(Math.abs(revoke.x - edit.x)).toBeLessThanOrEqual(1)
  })

  test('card estreito empilha as ações ocupando a largura (container query)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    const item = card(page, 1)
    const box = (await item.boundingBox())!
    const edit = (await item.getByRole('button', { name: /^Editar convite/ }).boundingBox())!
    expect(edit.width).toBeGreaterThan(box.width * 0.75)
  })
})
