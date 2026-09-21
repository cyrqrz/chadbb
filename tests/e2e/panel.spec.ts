import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import type { Dashboard, Invitation } from '../../src/features/guests/api'
import { session, userId } from './session'

// O convite carrega o mapa do Google em iframe: nos testes ele é simulado, sem rede externa.
test.beforeEach(async ({ page }) => {
  await page.route('https://www.google.com/maps**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mapa simulado</title>' }))
})

// Painel do organizador com backend simulado e dados fictícios.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
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
  await expect(sizes.filter({ hasText: 'Tamanho P' })).toContainText('Completo')
  await expect(sizes.filter({ hasText: 'Tamanho M' })).toContainText('15 disponíveis')
  await expect(sizes.filter({ hasText: 'Tamanho XG' })).toContainText('5 disponíveis')

  const treats = page.getByRole('region', { name: 'Mimos', exact: true })
  await expect(treats.getByRole('listitem').first()).toHaveText('Mamadeira fictícia2 unidades')
  await treats.getByText('Mimos ainda não escolhidos (1)').click()
  await expect(treats.getByText('Pomada fictícia')).toBeVisible()

  const choices = page.getByRole('region', { name: 'Escolhas dos convidados' })
  await expect(choices).toContainText('só uma declaração do convidado')
  await expect(choices.getByRole('heading', { name: 'Fraldas', exact: true })).toBeVisible()
  await expect(choices.getByRole('heading', { name: 'Mimos', exact: true })).toBeVisible()
  await expect(choices.locator('.badge', { hasText: 'Compra informada' })).toBeVisible()
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
  await expect(sizes.filter({ hasText: 'Tamanho G' })).toContainText('Completo')
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
  for (const [path, title] of [[`/eventos/${eventId}/dados`, 'Não foi possível abrir o evento.'], [`/eventos/${eventId}/presentes`, 'Não foi possível abrir a lista.']]) {
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
test('sugestões do catálogo mostram só o que falta na lista', async ({ page }) => {
  const g = product(1, 'G')
  const listedG = { id: '90000000-0000-4000-8000-000000000009', event_id: eventId, product_id: g.id, quantity_requested: 12, category: 'fralda', diaper_size: 'G', version: 1, product: g }
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': () => ({ status: 200, json: [listedG], headers: { 'content-range': '0-0/1' } }),
    '/rest/v1/products': () => ({ status: 200, json: [g, product(2, 'M')], headers: { 'content-range': '0-1/2' } }),
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByRole('button', { name: 'Completar a lista do chá' })).toBeVisible()
  const catalog = page.getByRole('region', { name: 'Adicionar à lista' })
  await expect(catalog.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })).toBeVisible()
  // O tamanho G já está na lista: não aparece como sugestão.
  await expect(catalog.getByRole('article').filter({ hasText: 'Fraldas tamanho G' })).toHaveCount(0)
  await expect(catalog.getByRole('searchbox')).toHaveCount(0)
  await expect(catalog.getByText('Catálogo manual')).toHaveCount(0)
  await expect(catalog.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mimos', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expectAccessible(page)
})

test('remover item: confirma no cartão, avisa e recusa quando alguém já escolheu', async ({ page }) => {
  const mimo = (n: number, title: string) => ({ id: `81000000-0000-4000-8000-00000000000${n}`, title, description: '', platform: 'manual', category: 'mimo', diaper_size: null, active: true, event_id: null })
  const row = (n: number, title: string) => ({ id: `91000000-0000-4000-8000-00000000000${n}`, event_id: eventId, product_id: mimo(n, title).id, quantity_requested: null, category: 'mimo', diaper_size: null, version: 1, product: mimo(n, title) })
  let items = [row(1, 'Pomada fictícia'), row(2, 'Mamadeira fictícia')]
  const removed: unknown[] = []
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url }) => ({ status: 200, json: url.searchParams.get('category') === 'eq.fralda' ? [] : items, headers: { 'content-range': `0-${items.length}/${items.length}` } }),
    '/rest/v1/products': none,
    '/rest/v1/rpc/remove_event_item': ({ body }) => {
      removed.push(body)
      if (body.p_item_id === row(2, '').id) return { status: 400, json: { message: 'ITEM_HAS_RESERVATIONS', code: 'P0001' } }
      items = items.filter(item => item.id !== body.p_item_id)
      return { status: 200, json: row(1, 'Pomada fictícia') }
    },
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const pomada = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Pomada fictícia' }) })
  await pomada.getByRole('button', { name: 'Remover da lista: Pomada fictícia' }).click()
  await expect(pomada.getByText('Remover “Pomada fictícia” da lista?')).toBeFocused()
  await pomada.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '“Pomada fictícia” saiu da lista.' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Pomada fictícia' })).toHaveCount(0)
  expect(removed[0]).toEqual({ p_event_id: eventId, p_item_id: row(1, '').id, p_version: 1 })
  const mamadeira = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira fictícia' }) })
  await mamadeira.getByRole('button', { name: 'Remover da lista: Mamadeira fictícia' }).click()
  await mamadeira.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(mamadeira.getByRole('alert')).toHaveText('Um convidado já escolheu este presente. Ele não pode sair da lista.')
  // O "Remover" não serve mais e some; o foco vai para o motivo, e "Fechar" devolve ao botão do cartão.
  await expect(mamadeira.getByRole('alert')).toBeFocused()
  await expect(mamadeira.getByRole('button', { name: 'Remover', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mamadeira fictícia' })).toBeVisible()
  await expectAccessible(page)
  await mamadeira.getByRole('button', { name: 'Fechar' }).click()
  await expect(mamadeira.getByRole('button', { name: 'Remover da lista: Mamadeira fictícia' })).toBeFocused()
  // O aviso é da categoria em que o item saiu.
  await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
  await expect(page.getByText('saiu da lista')).toHaveCount(0)
})

test('remover item já removido em outra aba conta como removido; conflito de versão explica o que houve', async ({ page }) => {
  const mimo = (n: number, title: string) => ({ id: `81000000-0000-4000-8000-00000000000${n}`, title, description: '', platform: 'manual', category: 'mimo', diaper_size: null, active: true, event_id: null })
  const row = (n: number, title: string) => ({ id: `91000000-0000-4000-8000-00000000000${n}`, event_id: eventId, product_id: mimo(n, title).id, quantity_requested: null, category: 'mimo', diaper_size: null, version: 1, product: mimo(n, title) })
  let items = [row(1, 'Pomada fictícia'), row(2, 'Mamadeira fictícia')]
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': () => ({ status: 200, json: items, headers: { 'content-range': `0-${items.length - 1}/${items.length}` } }),
    '/rest/v1/products': none,
    '/rest/v1/rpc/remove_event_item': ({ body }) => {
      if (body.p_item_id === row(2, '').id) return { status: 400, json: { message: 'ITEM_VERSION_CONFLICT', code: 'P0001' } }
      items = items.filter(item => item.id !== body.p_item_id)
      return { status: 400, json: { message: 'ITEM_NOT_FOUND', code: 'P0001' } }
    },
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const mamadeira = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira fictícia' }) })
  await mamadeira.getByRole('button', { name: 'Remover da lista: Mamadeira fictícia' }).click()
  await mamadeira.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(mamadeira.getByRole('alert')).toHaveText('Este presente mudou em outra aba. A lista foi atualizada: confira e confirme de novo.')
  const pomada = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Pomada fictícia' }) })
  await pomada.getByRole('button', { name: 'Remover da lista: Pomada fictícia' }).click()
  await pomada.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pomada fictícia' })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: '“Pomada fictícia” saiu da lista.' })).toBeFocused()
})

test('completar depois de remover diz que o item da lista pronta voltou', async ({ page }) => {
  const rows = [{ product_id: '81000000-0000-4000-8000-000000000001', diaper_size: 'P', category: 'fralda', quantity_requested: 6 }]
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url }) => isListQuery(url) ? { status: 200, json: [], headers: { 'content-range': '*/0' } } : { status: 200, json: rows, headers: { 'content-range': '0-0/1' } },
    '/rest/v1/products': none,
    '/rest/v1/rpc/prepare_family_list': () => ({ status: 200, json: 1 }),
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByText('inclui de novo tudo o que falta, inclusive o que você removeu')).toBeVisible()
  await page.getByRole('button', { name: 'Completar a lista do chá' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 item da lista pronta voltou para a lista.' })).toBeVisible()
})

test('mimo próprio: entra na lista com o selo “Criado por você” e recusa nome repetido', async ({ page }) => {
  const own = { id: '82000000-0000-4000-8000-000000000001', title: 'Livro de pano', description: 'Qualquer cor', platform: 'manual', category: 'mimo', diaper_size: null, active: true, event_id: eventId }
  let items: unknown[] = []
  const calls: unknown[] = []
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': () => ({ status: 200, json: items, headers: { 'content-range': items.length ? `0-0/${items.length}` : '*/0' } }),
    '/rest/v1/products': none,
    '/rest/v1/rpc/add_custom_treat': ({ body }) => {
      calls.push(body)
      if (items.length) return { status: 400, json: { message: 'ITEM_ALREADY_EXISTS', code: 'P0001' } }
      items = [{ id: '92000000-0000-4000-8000-000000000001', event_id: eventId, product_id: own.id, quantity_requested: null, category: 'mimo', diaper_size: null, version: 1, product: own }]
      return { status: 200, json: items[0] }
    },
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const form = page.getByRole('region', { name: 'Adicionar mimo próprio' })
  await form.getByRole('button', { name: 'Adicionar mimo' }).click()
  await expect(form.getByRole('alert')).toHaveText('Informe o nome do mimo.')
  // Erro ligado ao campo, e o foco vai para ele.
  await expect(form.getByLabel('Nome do mimo')).toBeFocused()
  await expect(form.getByLabel('Nome do mimo')).toHaveAttribute('aria-invalid', 'true')
  await expect(form.getByLabel('Nome do mimo')).toHaveAccessibleDescription('Informe o nome do mimo.')
  expect(calls).toEqual([])
  await form.getByLabel('Descrição (opcional)').fill('Qualquer cor')
  await form.getByLabel('Nome do mimo').fill('Livro de pano')
  // Enter no celular ("Ir"): o campo fica só leitura durante o envio e não solta o foco.
  await form.getByLabel('Nome do mimo').press('Enter')
  await expect(form.getByRole('status')).toHaveText('“Livro de pano” entrou na lista.')
  await expect(form.getByLabel('Nome do mimo')).toBeFocused()
  expect(calls[0]).toEqual({ p_event_id: eventId, p_title: 'Livro de pano', p_description: 'Qualquer cor' })
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Livro de pano' }) })
  await expect(card).toContainText('Criado por você')
  await expect(card).toContainText('Qualquer cor')
  await form.getByLabel('Nome do mimo').fill('livro de pano')
  await form.getByRole('button', { name: 'Adicionar mimo' }).click()
  await expect(form.getByRole('alert')).toHaveText('Já existe um mimo com esse nome na lista.')
  await expect(form.getByLabel('Nome do mimo')).toHaveValue('livro de pano')
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
  await page.goto(`/eventos/${eventId}/dados`)
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
  const catalog = page.getByRole('region', { name: 'Adicionar à lista' })
  const alert = catalog.getByRole('alert')
  await expect(alert).toContainText('Não foi possível conferir o que já está na lista', { timeout: 15_000 })
  // Sem saber o que já está na lista, todas as sugestões aparecem; o banco recusa repetição.
  await expect(catalog.getByRole('button', { name: 'Adicionar Fraldas tamanho G à lista' })).toBeVisible()
  await expectAccessible(page)
  // Enquanto confere de novo, o aviso continua no lugar e o botão fica indisponível.
  const retry = alert.getByRole('button', { name: 'Conferir a lista de novo' })
  await retry.click()
  await expect(retry).toBeDisabled()
  await expect(retry).toBeEnabled({ timeout: 10_000 })
  failing = false
  await retry.click()
  await expect(alert).toHaveCount(0)
  await expect(catalog.getByRole('article').filter({ hasText: 'Fraldas tamanho G' })).toHaveCount(0)
  await expect(catalog.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })).toBeVisible()
})

const rotated = { id: full.invitations[2].id, token: 'b'.repeat(64) }
function actions(replies: Record<string, ReturnType<Reply>>): Reply {
  return ({ body }) => replies[String(body.p_action)] ?? { status: 200, json: full }
}
async function openEdit(page: Page) {
  await page.goto(`/eventos/${eventId}/convites`)
  await page.getByRole('button', { name: 'Editar convite de Convidado fictício 1' }).click()
  return { create: page.getByRole('region', { name: 'Convide alguém especial' }), edit: page.getByRole('region', { name: 'Editar convite' }),
    list: page.getByRole('region', { name: 'Convidados' }).locator('.guests-feedback') }
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

test('revogar com edição aberta avisa acima da lista, sem abrir o formulário de convite', async ({ page }) => {
  await backend(page, actions({ revoke: { status: 200, json: { id: full.invitations[2].id } } }))
  const { create, edit, list } = await openEdit(page)
  await confirmAnd(page, 'Convidado fictício 3', 'Revogar acesso')
  await expect(list.getByRole('status')).toContainText('Convite revogado.')
  await expect(create).toHaveCount(0)
  await expect(edit.getByRole('status')).toHaveCount(0)
  await expect(edit).toBeVisible()
})

test('erro ao revogar com edição aberta aparece acima da lista', async ({ page }) => {
  await backend(page, actions({ revoke: { status: 400, json: { message: 'INVITATION_NOT_FOUND' } } }))
  const { edit, list } = await openEdit(page)
  await confirmAnd(page, 'Convidado fictício 3', 'Revogar acesso')
  await expect(list.getByRole('alert')).toHaveText('Convite não encontrado ou sem permissão.')
  await expect(edit.getByRole('alert')).toHaveCount(0)
})

test('salvar a edição fecha o formulário e avisa acima da lista', async ({ page }) => {
  await backend(page, actions({ update: { status: 200, json: { id: full.invitations[0].id } } }))
  const { edit, list } = await openEdit(page)
  await edit.getByRole('button', { name: 'Salvar convite' }).click()
  await expect(list.getByRole('status')).toHaveText('Convite atualizado.')
  await expect(edit).toHaveCount(0)
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
    await page.goto(`/eventos/${eventId}/dados`)
    await expect(page.getByLabel('Término')).toBeVisible()
    // iPhone: com a aparência nativa, o Safari ignora width: 100% nos campos de data.
    for (const label of ['Data e horário', 'Término']) expect(await page.getByLabel(label).evaluate(el => getComputedStyle(el).appearance)).toBe('none')
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

test('links de voltar e abas têm área de toque de 44 px', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: full }))
  await page.goto(`/eventos/${eventId}`)
  for (const tab of await page.getByRole('navigation', { name: 'Áreas do evento' }).getByRole('link').all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const back = page.getByRole('main').getByRole('link', { name: 'Seus eventos' })
  await expect(back).toBeVisible()
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test('falha de atualização nos detalhes não apaga o que está sendo digitado', async ({ page }) => {
  let failing = false
  await backend(page, () => ({ status: 200, json: full }), () => failing ? { status: 500, json: { message: 'unavailable' } } : { status: 200, json: [event] })
  await page.goto(`/eventos/${eventId}/dados`)
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
  await page.goto(`/eventos/${eventId}/dados`)
  await expect(page.getByRole('heading', { name: 'Dados do evento' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toContainText('Não foi possível abrir o evento.')
  await page.getByRole('main').getByRole('link', { name: 'Seus eventos' }).click()
  await expect(page.getByRole('heading', { name: 'Seus eventos' })).toBeVisible()
  delay = 1500
  await page.route('**/rest/v1/events**', async route => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); await route.fallback() })
  await page.goBack()
  // A consulta em cache ainda guarda o erro, mas a nova tentativa ao montar é uma carga nova.
  await expect(page.getByRole('status').filter({ hasText: 'Carregando evento…' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Não foi possível abrir o evento.', { timeout: 15_000 })
})

// G4b.1 · achados A11–A13 da auditoria (docs/design/audit.md).
const listItem = (n: number) => {
  const size = (['P', 'M', 'G', 'XG'] as const)[n % 4]
  const item = product(n % 10, size)
  return { id: `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`, event_id: eventId, product_id: item.id, quantity_requested: 6,
    category: 'fralda', diaper_size: size, version: 1, product: { ...item, title: `Fralda fictícia ${n}` } }
}
const isListQuery = (url: URL) => url.searchParams.get('select')?.startsWith('id,event_id') ?? false

test('A11 · voltar a uma categoria que falhou mostra carregando, não o erro antigo', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url, body }) => isListQuery(url) && url.searchParams.get('category') === 'eq.fralda'
      ? { status: 500, json: { message: 'unavailable' } } : none({ url, body }),
    '/rest/v1/products': none,
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  const diapers = page.getByRole('region', { name: 'Fraldas na lista' })
  await expect(diapers.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Mimos na lista' }).getByText('Nenhum mimo na lista.')).toBeVisible()
  // G4b.3: a regra "sem limite" passou do item para o topo da lista. Sem mimo nenhum,
  // ela não faz sentido: quem chega aqui precisa do próximo passo, não da regra.
  await expect(page.getByRole('region', { name: 'Mimos na lista' }).getByText('Sem limite de quantidade')).toHaveCount(0)
  // A nova tentativa de Fraldas demora: enquanto isso, a tela diz que está carregando.
  await page.route('**/rest/v1/event_items**', async route => {
    if (isListQuery(new URL(route.request().url()))) await new Promise(resolve => setTimeout(resolve, 1500))
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
  await expect(diapers.getByRole('status').filter({ hasText: 'Carregando a lista…' })).toBeVisible()
  await expect(diapers.getByRole('alert')).toHaveCount(0)
  await expect(diapers.getByRole('alert')).toBeVisible({ timeout: 15_000 })
})

test('A12 · página da lista que falha mantém a paginação para voltar', async ({ page }) => {
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url, body }) => !isListQuery(url) ? none({ url, body })
      : url.searchParams.get('offset') === '12' ? { status: 500, json: { message: 'unavailable' } }
      : { status: 200, json: Array.from({ length: 12 }, (_, n) => listItem(n + 1)), headers: { 'content-range': '0-11/13' } },
    '/rest/v1/products': none,
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  const diapers = page.getByRole('region', { name: 'Fraldas na lista' })
  await expect(diapers.getByRole('heading', { name: 'Fralda fictícia 1', exact: true })).toBeVisible()
  await diapers.getByRole('navigation', { name: 'Paginação da lista' }).getByRole('button', { name: 'Próxima' }).click()
  await expect(diapers.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  // Os itens da página anterior não voltam como se fossem atuais; só a navegação fica.
  await expect(diapers.getByRole('heading', { name: 'Fralda fictícia 1', exact: true })).toHaveCount(0)
  const pages = diapers.getByRole('navigation', { name: 'Paginação da lista' })
  await expect(pages).toContainText('Página 2 de 2')
  await pages.getByRole('button', { name: 'Anterior' }).click()
  await expect(diapers.getByRole('heading', { name: 'Fralda fictícia 1', exact: true })).toBeVisible()
  await expect(diapers.getByRole('alert')).toHaveCount(0)
})

test('A13 · falha só na consulta do evento avisa no topo da lista', async ({ page }) => {
  let failing = false
  await backend(page, () => ({ status: 200, json: full }), () => failing ? { status: 500, json: { message: 'unavailable' } } : { status: 200, json: [event] },
    { '/rest/v1/event_items': none, '/rest/v1/products': none })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByRole('heading', { name: 'Fraldas na lista' })).toBeVisible()
  failing = true
  await page.waitForResponse(r => r.url().includes('/rest/v1/events') && r.status() === 500, { timeout: 20_000 })
  // Só a situação do evento pode estar velha: a lista abaixo acabou de ser consultada.
  const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível conferir se o evento continua aberto.' })
  await expect(alert).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Fraldas na lista' })).toBeVisible()
  await expectAccessible(page)
  failing = false
  await alert.getByRole('button', { name: 'Conferir de novo' }).click()
  await expect(alert).toHaveCount(0)
})

test('A13 · com o servidor fora, nenhum aviso nem botão se repete', async ({ page }) => {
  let failing = false
  const down = { status: 500, json: { message: 'unavailable' } }
  await backend(page, () => ({ status: 200, json: full }), () => failing ? down : { status: 200, json: [event] },
    { '/rest/v1/event_items': a => failing ? down : none(a), '/rest/v1/products': none })
  await page.goto(`/eventos/${eventId}/presentes`)
  await expect(page.getByRole('heading', { name: 'Fraldas na lista' })).toBeVisible()
  failing = true
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível conferir se o evento continua aberto.' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('alert')).toBeVisible({ timeout: 20_000 })
  const texts = await page.getByRole('alert').allInnerTexts()
  expect(new Set(texts).size).toBe(texts.length)
  const names = await page.getByRole('alert').getByRole('button').allInnerTexts()
  expect(new Set(names).size).toBe(names.length)
})

const thirteen = (url: URL) => url.searchParams.get('offset') === '12' ? { status: 500, json: { message: 'unavailable' } }
  : { status: 200, json: Array.from({ length: 12 }, (_, n) => listItem(n + 1)), headers: { 'content-range': '0-11/13' } }
test('A12 · trocar de página pelo teclado não solta o foco, nem no erro', async ({ page }) => {
  let delay = 0
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url, body }) => !isListQuery(url) ? none({ url, body }) : thirteen(url), '/rest/v1/products': none })
  await page.route('**/rest/v1/event_items**', async route => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); await route.fallback() })
  await page.goto(`/eventos/${eventId}/presentes`)
  const pages = page.getByRole('navigation', { name: 'Paginação da lista' })
  await expect(pages).toContainText('Página 1 de 2')
  delay = 800
  await pages.getByRole('button', { name: 'Próxima' }).focus()
  await page.keyboard.press('Enter')
  // Durante a carga e depois do erro, o foco continua na paginação.
  await expect(page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('status').filter({ hasText: 'Carregando a lista…' })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.closest('nav')?.getAttribute('aria-label'))).toBe('Paginação da lista')
  await expect(page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('alert')).toBeVisible({ timeout: 15_000 })
  // Na última página, "Próxima" fica indisponível sem soltar o foco.
  await expect(pages.getByRole('button', { name: 'Próxima' })).toHaveAttribute('aria-disabled', 'true')
  await expect(pages.getByRole('button', { name: 'Próxima' })).toBeFocused()
  await pages.getByRole('button', { name: 'Anterior' }).focus()
  await page.keyboard.press('Enter')
  await expect(pages).toContainText('Página 1 de 2')
  expect(await page.evaluate(() => document.activeElement?.closest('nav')?.getAttribute('aria-label'))).toBe('Paginação da lista')
})

test('A12 · erro de página com a paginação cabe em 320 px com texto a 200% e alvos de 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await backend(page, () => ({ status: 200, json: full }), undefined, {
    '/rest/v1/event_items': ({ url, body }) => !isListQuery(url) ? none({ url, body }) : thirteen(url), '/rest/v1/products': none })
  await page.goto(`/eventos/${eventId}/presentes`)
  const diapers = page.getByRole('region', { name: 'Fraldas na lista' })
  await diapers.getByRole('button', { name: 'Próxima' }).click()
  await expect(diapers.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
  for (const b of await diapers.getByRole('button').all()) { const box = await b.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.x + box!.width).toBeLessThanOrEqual(320) }
  await expectAccessible(page)
})

// G4b.2 · resumo no topo da lista e lista pronta compacta.
test.describe('G4b.2 · resumo da lista', () => {
  // Estado do servidor simulado: a lista e a conferência leem as mesmas linhas.
  function summaryBackend(page: Page, { status = 'published' }: { status?: string } = {}) {
    const rows = [
      { ...listItem(1), diaper_size: 'P', quantity_requested: 6, product: { ...product(1, 'P') } },
      { ...listItem(2), diaper_size: 'M', quantity_requested: 19, product: { ...product(2, 'M') } },
      { ...listItem(3), diaper_size: 'G', quantity_requested: 12, product: { ...product(3, 'G') } },
      ...[1, 2, 3].map(n => ({ ...listItem(20 + n), category: 'mimo', diaper_size: null, quantity_requested: null,
        product: { ...product(4, 'P'), id: `82000000-0000-4000-8000-00000000000${n}`, title: `Mimo fictício ${n}`, category: 'mimo', diaper_size: null } })),
    ]
    return backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, status }] }), {
      '/rest/v1/event_items': ({ url }) => {
        const category = url.searchParams.get('category')?.replace('eq.', '')
        const json = !isListQuery(url) ? rows.map(({ product_id, diaper_size, category, quantity_requested }) => ({ product_id, diaper_size, category, quantity_requested }))
          : rows.filter(row => !category || row.category === category)
        return { status: 200, json, headers: { 'content-range': `0-${Math.max(json.length - 1, 0)}/${json.length}` } }
      },
      '/rest/v1/products': none,
      '/rest/v1/rpc/set_event_item_quantity': ({ body }) => {
        const row = rows.find(r => r.id === body.p_item_id)!
        Object.assign(row, { quantity_requested: body.p_quantity, version: row.version + 1 })
        return { status: 200, json: row }
      },
    })
  }
  const summary = (page: Page) => page.getByRole('region', { name: 'Lista do chá' })

  test('mostra os pacotes pedidos por tamanho, o total e os mimos', async ({ page }) => {
    await summaryBackend(page)
    await page.goto(`/eventos/${eventId}/presentes`)
    const box = summary(page)
    await expect(box).toContainText('3 mimos na lista')
    // Sem total somado no front (regra 6): ele depende de summary.diapers do servidor.
    await expect(box).not.toContainText('37')
    const sizes = box.getByRole('list', { name: 'Pacotes pedidos por tamanho' }).getByRole('listitem')
    await expect(sizes).toHaveText(['P 6 pacotes', 'M 19 pacotes', 'G 12 pacotes', 'XG fora da lista'])
    await expectAccessible(page)
  })

  test('com itens, a lista pronta vira uma ação dentro do resumo, sem cartão próprio', async ({ page }) => {
    await summaryBackend(page)
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(summary(page).getByRole('button', { name: 'Completar a lista do chá' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Lista pronta do chá' })).toHaveCount(0)
    await expect(page.getByText('Recomendado')).toHaveCount(0)
  })

  test('lista vazia continua com o destaque da lista pronta e sem resumo', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), undefined, { '/rest/v1/event_items': none, '/rest/v1/products': none })
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(page.getByRole('button', { name: 'Preparar lista do chá' })).toBeVisible()
    await expect(summary(page)).toHaveCount(0)
  })

  test('evento encerrado mostra o resumo sem a ação de completar', async ({ page }) => {
    await summaryBackend(page, { status: 'closed' })
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(summary(page)).toContainText('M 19 pacotes')
    await expect(summary(page).getByRole('button')).toHaveCount(0)
  })

  test('salvar uma quantidade atualiza o resumo com a resposta do servidor', async ({ page }) => {
    await summaryBackend(page)
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(summary(page)).toContainText('M 19 pacotes')
    const card = page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('article').filter({ hasText: 'Fraldas tamanho M' })
    await card.getByRole('button', { name: 'Aumentar pacotes' }).click()
    await card.getByRole('button', { name: 'Atualizar quantidade' }).click()
    await expect(card.getByRole('status').filter({ hasText: 'Quantidade atualizada.' })).toBeVisible()
    await expect(summary(page).getByRole('list', { name: 'Pacotes pedidos por tamanho' })).toContainText('M 20 pacotes')
  })

  // QA G4b.2: o botão "Preparar" some quando a lista passa a ter itens.
  test('QA · preparar a lista vazia não perde o foco e anuncia o resultado', async ({ page }) => {
    let prepared = false
    const rows = [{ product_id: '81000000-0000-4000-8000-000000000001', diaper_size: 'P', category: 'fralda', quantity_requested: 6 }]
    await backend(page, () => ({ status: 200, json: full }), undefined, {
      '/rest/v1/event_items': ({ url }) => {
        const json = prepared && !isListQuery(url) ? rows : []
        return { status: 200, json, headers: { 'content-range': json.length ? '0-0/1' : '*/0' } }
      },
      '/rest/v1/products': none,
      '/rest/v1/rpc/prepare_family_list': () => { prepared = true; return { status: 200, json: 1 } },
    })
    await page.goto(`/eventos/${eventId}/presentes`)
    await page.getByRole('button', { name: 'Preparar lista do chá' }).click()
    await expect(summary(page)).toContainText('Lista do chá preparada.')
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  })

  test('QA · enquanto confere a lista, não oferece "Completar" a quem ainda não tem itens', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), undefined, { '/rest/v1/event_items': none, '/rest/v1/products': none })
    let release = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('https://e2e.supabase.co/rest/v1/event_items**', async route => {
      if (isListQuery(new URL(route.request().url()))) return route.fallback()
      await held
      await route.fallback()
    })
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(page.getByText('Carregando evento…')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Lista de presentes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Completar a lista do chá' })).toHaveCount(0)
    release()
    await expect(page.getByRole('button', { name: 'Preparar lista do chá' })).toBeVisible()
  })

  test('QA · resumo cabe em 320 px com texto a 200% e o botão tem 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await summaryBackend(page)
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(summary(page)).toContainText('M 19 pacotes')
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
    const box = await summary(page).getByRole('button', { name: 'Completar a lista do chá' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  })

  test('QA · uma unidade aparece no singular', async ({ page }) => {
    const rows = [{ product_id: '81000000-0000-4000-8000-000000000004', diaper_size: 'XG', category: 'fralda', quantity_requested: 1 }]
    await backend(page, () => ({ status: 200, json: full }), undefined, {
      '/rest/v1/event_items': ({ url }) => isListQuery(url) ? { status: 200, json: [], headers: { 'content-range': '*/0' } } : { status: 200, json: rows, headers: { 'content-range': '0-0/1' } },
      '/rest/v1/products': none,
    })
    await page.goto(`/eventos/${eventId}/presentes`)
    await expect(summary(page).getByRole('list', { name: 'Pacotes pedidos por tamanho' })).toContainText('XG 1 pacote')
    await expect(summary(page).getByRole('list', { name: 'Pacotes pedidos por tamanho' })).not.toContainText('1 pacotes')
    await expect(summary(page)).toContainText('0 mimos na lista')
  })
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

// G3.1: os cards do organizador seguem a anatomia do card de fralda do convite.
test.describe('G3.1 · cards do organizador', () => {
  // Guarda de sanidade: a tela tem card. Desde a G4b.3, a lista de presentes é um card
  // com uma linha por item, e não um card por item — daí o seletor ser `.card`.
  async function sameAnatomy(page: Page) {
    await expect(page.locator('.card').first()).toBeVisible()
    await expect(page.locator(':is(article, li, a).card:not(.card-stack)')).toHaveCount(0)
    // Sem caixa colorida dentro do card.
    await expect(page.locator('.card :is(.notice, .state-warning)')).toHaveCount(0)
  }

  test('painel: fralda por tamanho com barra acessível e selo de completo', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}/convites`)
    const sizes = page.getByRole('region', { name: 'Fraldas por tamanho' }).getByRole('listitem')
    const p = sizes.filter({ has: page.getByRole('heading', { name: 'Tamanho P' }) })
    await expect(p.getByRole('progressbar', { name: '6 de 6 pacotes comprometidos' })).toBeVisible()
    await expect(p.locator('.badge-success')).toHaveText('✓Completo')
    await expect(p).not.toContainText('disponíve')
    const m = sizes.filter({ has: page.getByRole('heading', { name: 'Tamanho M' }) })
    await expect(m.getByRole('progressbar', { name: '4 de 19 pacotes comprometidos' })).toBeVisible()
    await expect(m).toContainText('15 disponíveis')
    await expect(m.locator('.badge-success')).toHaveCount(0)
    await sameAnatomy(page)
    await expectAccessible(page)
  })

  test('painel: escolha dos convidados usa selo com ícone', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}/convites`)
    const choices = page.getByRole('region', { name: 'Escolhas dos convidados' })
    await expect(choices.getByRole('heading', { name: 'Fraldas tamanho P · 6 pacotes' })).toBeVisible()
    await expect(choices.locator('.badge-success')).toHaveText('✓Compra informada')
  })

  const g = product(1, 'G')
  const listedG = { id: '90000000-0000-4000-8000-000000000009', event_id: eventId, product_id: g.id, quantity_requested: 12, category: 'fralda', diaper_size: 'G', version: 1, product: g }
  const bottle = { id: '80000000-0000-4000-8000-000000000005', title: 'Mamadeira fictícia', description: '', platform: 'manual', category: 'mimo', diaper_size: null, active: false }
  const listedBottle = { id: '90000000-0000-4000-8000-000000000008', event_id: eventId, product_id: bottle.id, quantity_requested: null, category: 'mimo', diaper_size: null, version: 1, product: bottle }
  async function giftList(page: Page) {
    await backend(page, () => ({ status: 200, json: full }), undefined, {
      '/rest/v1/event_items': ({ url }) => {
        const rows = url.searchParams.get('category') === 'eq.mimo' ? [listedBottle] : [listedG]
        return { status: 200, json: rows, headers: { 'content-range': `0-0/1` } }
      },
      '/rest/v1/products': () => ({ status: 200, json: [g, product(2, 'M')], headers: { 'content-range': '0-1/2' } }),
    })
    await page.goto(`/eventos/${eventId}/presentes`)
  }

  test('lista: fralda usa o stepper e só libera a ação quando a quantidade muda', async ({ page }) => {
    await giftList(page)
    const card = page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('article')
    await expect(card.getByRole('heading', { name: 'Fraldas tamanho G' })).toHaveClass(/item-row-title/)
    const field = card.getByRole('spinbutton', { name: 'Quantidade de Fraldas tamanho G' })
    await expect(field).toHaveValue('12')
    await expect(field).toHaveAttribute('max', '10000')
    const stepper = card.getByRole('group', { name: 'Quantidade de Fraldas tamanho G' })
    // O contorno envolve só − | valor | +: não estica até a borda do card.
    expect(await stepper.evaluate(el => el.getBoundingClientRect().width - [...el.children].reduce((sum, child) => sum + child.getBoundingClientRect().width, 0))).toBeLessThanOrEqual(4)
    const save = card.getByRole('button', { name: 'Atualizar quantidade' })
    await expect(save).toBeDisabled()
    await field.press('Enter')
    await expect(card.getByRole('alert')).toHaveCount(0)
    await card.getByRole('button', { name: 'Aumentar pacotes' }).click()
    await expect(field).toHaveValue('13')
    await expect(save).toBeEnabled()
    await sameAnatomy(page)
    await expectAccessible(page)
  })

  test('lista: mimo sem caixa interna e produto fora do catálogo como selo', async ({ page }) => {
    await giftList(page)
    await page.getByRole('button', { name: 'Mimos', exact: true }).click()
    const section = page.getByRole('region', { name: 'Mimos na lista' })
    const card = section.getByRole('article')
    // G4b.3: "sem limite" é regra da categoria e aparece uma vez no topo, não em cada linha.
    await expect(section.getByText('Sem limite de quantidade')).toHaveCount(1)
    await expect(card).not.toContainText('Sem limite de quantidade')
    await expect(card.locator('.badge-warning')).toHaveText('!Fora do catálogo')
    await sameAnatomy(page)
    await expectAccessible(page)
  })

  // G4b.3: a aba empilhava um cartão por tamanho de fralda e um por mimo. Agora é
  // uma lista só, com um card em volta e uma linha por item.
  test('lista: fraldas e mimos em linhas, sem um cartão por item', async ({ page }) => {
    await giftList(page)
    for (const [tab, region] of [['Fraldas', 'Fraldas na lista'], ['Mimos', 'Mimos na lista']] as const) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      const section = page.getByRole('region', { name: region })
      await expect(section.locator('.card')).toHaveCount(1)
      await expect(section.locator('ul.item-rows > li')).toHaveCount(1)
      // A linha é o próprio item: nenhum card dentro da lista.
      await expect(section.locator('.item-rows .card')).toHaveCount(0)
      await expect(section.getByRole('article')).toHaveClass(/item-row/)
    }
  })

  // Com quatro tamanhos dentro de um card só, o que era isolado por cartão agora divide
  // a mesma moldura: erro, confirmação e sucesso não podem vazar para a linha vizinha,
  // e o Tab precisa andar linha a linha, sem pular de volta.
  test('lista: com quatro tamanhos, cada linha guarda o próprio erro, confirmação e foco', async ({ page }) => {
    const sizes = ['P', 'M', 'G', 'XG'] as const
    const rows = sizes.map((size, i) => ({ id: `9000000${i}-0000-4000-8000-000000000009`, event_id: eventId, product_id: product(1, size).id,
      quantity_requested: 6 + i, category: 'fralda', diaper_size: size, version: 1, product: { ...product(1, size), event_id: null } }))
    await backend(page, () => ({ status: 200, json: full }), undefined, {
      '/rest/v1/event_items': ({ url }) => {
        const list = url.searchParams.get('category') === 'eq.mimo' ? [] : rows
        return { status: 200, json: list, headers: { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' } }
      },
      '/rest/v1/products': none,
      '/rest/v1/rpc/set_event_item_quantity': () => ({ status: 503, json: { message: 'unavailable' } }),
    })
    await page.goto(`/eventos/${eventId}/presentes`)
    const region = page.getByRole('region', { name: 'Fraldas na lista' })
    const items = region.locator('ul.item-rows > li')
    await expect(items).toHaveCount(4)
    // Linha, e não cartão: a divisão entre itens é um filete, não uma borda de card.
    expect(await items.nth(1).evaluate(li => getComputedStyle(li).borderTopWidth)).not.toBe('0px')
    expect(await items.first().evaluate(li => getComputedStyle(li).borderTopWidth)).toBe('0px')

    // Erro na linha do P; confirmação aberta na linha do M.
    const p = region.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    const m = region.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho M' }) })
    await p.getByRole('button', { name: 'Aumentar pacotes' }).click()
    await p.getByRole('button', { name: 'Atualizar quantidade' }).click()
    await expect(p.getByRole('alert')).toBeVisible()
    await m.getByRole('button', { name: 'Remover da lista: Fraldas tamanho M' }).click()
    await expect(m.getByText('Remover “Fraldas tamanho M” da lista?')).toBeFocused()
    // Nada vazou: o erro é só do P e a pergunta é só do M.
    await expect(m.getByRole('alert')).toHaveCount(0)
    await expect(p.getByText('Remover “')).toHaveCount(0)
    await expect(region.getByRole('alert')).toHaveCount(1)
    // E cada bloco fica dentro do retângulo da própria linha, sem invadir a de baixo.
    for (const [index, node] of [[0, p.getByRole('alert')], [1, m.getByText('Remover “Fraldas tamanho M” da lista?')]] as const) {
      const inside = await node.evaluate((el, i) => {
        const li = document.querySelectorAll('ul.item-rows > li')[i].getBoundingClientRect()
        const box = el.getBoundingClientRect()
        return box.top >= li.top - 0.5 && box.bottom <= li.bottom + 0.5
      }, index)
      expect(inside, `bloco da linha ${index + 1}`).toBe(true)
    }

    // Tab anda dentro da linha e só então passa para a próxima.
    await p.getByRole('button', { name: 'Diminuir pacotes' }).focus()
    const order: string[] = []
    for (let i = 0; i < 6; i++) {
      order.push(await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return el.tagName === 'INPUT' ? 'campo de quantidade' : el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''
      }))
      await page.keyboard.press('Tab')
    }
    expect(order).toEqual(['Diminuir pacotes', 'campo de quantidade', 'Aumentar pacotes', 'Atualizar quantidade', 'Recarregar quantidade', 'Remover da lista: Fraldas tamanho P'])
    await sameAnatomy(page)
    await expectAccessible(page)
  })

  test('catálogo: pacotes pelo stepper e nenhum botão preenchido nos cards', async ({ page }) => {
    await giftList(page)
    const catalog = page.getByRole('region', { name: 'Adicionar à lista' })
    const m = catalog.getByRole('article').filter({ hasText: 'Fraldas tamanho M' })
    await expect(m.getByRole('spinbutton', { name: 'Pacotes de Fraldas tamanho M' })).toHaveValue('1')
    await m.getByRole('button', { name: 'Aumentar pacotes' }).click()
    await expect(m.getByRole('spinbutton', { name: 'Pacotes de Fraldas tamanho M' })).toHaveValue('2')
    await expect(m.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })).toHaveClass(/secondary/)
    await expect(catalog.getByRole('article').filter({ hasText: 'Fraldas tamanho G' })).toHaveCount(0)
    await sameAnatomy(page)
  })

  // Entre 370 e 500 px (e com texto a 200% até ~1000 px) o formulário cabia ao lado e
  // espremia o nome do produto a uma palavra por linha. O nome curto fica numa linha só.
  test('catálogo: nome da sugestão não é espremido pelo formulário', async ({ page }) => {
    await giftList(page)
    const title = page.getByRole('region', { name: 'Sugestões do catálogo' }).getByRole('heading', { name: 'Fraldas tamanho M', level: 4 })
    for (const [width, zoom] of [[400, '100%'], [480, '100%'], [800, '200%']] as const) {
      await page.setViewportSize({ width, height: 800 })
      await page.evaluate(value => { document.documentElement.style.fontSize = value }, zoom)
      const lines = await title.evaluate(h => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)))
      expect(lines, `${width}px, texto ${zoom}`).toBe(1)
    }
  })

  // Lista com rotas de escrita simuladas; `calls` guarda o corpo de cada RPC.
  async function giftListWith(page: Page, { status = 'published', write }: { status?: string; write?: Reply } = {}) {
    const calls: Record<string, unknown>[] = []
    const rpc: Reply = request => { calls.push(request.body); return write ? write(request) : { status: 500, json: { message: 'unexpected' } } }
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, status }] }), {
      '/rest/v1/event_items': ({ url }) => {
        const rows = url.searchParams.get('category') === 'eq.mimo' ? [listedBottle] : [listedG]
        return { status: 200, json: rows, headers: { 'content-range': '0-0/1' } }
      },
      '/rest/v1/products': () => ({ status: 200, json: [g, product(2, 'M')], headers: { 'content-range': '0-1/2' } }),
      '/rest/v1/rpc/set_event_item_quantity': rpc,
      '/rest/v1/rpc/add_event_item': rpc,
    })
    await page.goto(`/eventos/${eventId}/presentes`)
    return calls
  }
  const listCard = (page: Page) => page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('article')
  const catalogCard = (page: Page) => page.getByRole('region', { name: 'Adicionar à lista' }).getByRole('article').filter({ hasText: 'Fraldas tamanho M' })

  test('stepper: nome acessível do grupo e dos botões nos dois cards', async ({ page }) => {
    await giftListWith(page)
    await expect(listCard(page).getByRole('group', { name: 'Quantidade de Fraldas tamanho G' })).toBeVisible()
    await expect(catalogCard(page).getByRole('group', { name: 'Pacotes de Fraldas tamanho M' })).toBeVisible()
    for (const card of [listCard(page), catalogCard(page)]) {
      for (const name of ['Diminuir pacotes', 'Aumentar pacotes']) {
        const button = card.getByRole('button', { name, exact: true })
        await expect(button).toBeVisible()
        const box = (await button.boundingBox())!
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
      }
    }
  })

  // A20: a 320 px com texto a 200% o campo do stepper não encolhia. Como `.stepper`
  // tem `overflow: hidden`, o sintoma não é rolagem lateral (o documento continua com
  // overflow 0): quem encolhia era o − e o +, que caíam para 36 px. O teste mede o
  // alvo de toque no tamanho em que ele quebrava, na lista e no catálogo.
  test('stepper: − e + mantêm 44 px a 320 px com texto a 200%', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await giftListWith(page)
    await expect(listCard(page).getByRole('spinbutton')).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    for (const [card, where] of [[listCard(page), 'lista'], [catalogCard(page), 'catálogo']] as const) {
      for (const name of ['Diminuir pacotes', 'Aumentar pacotes']) {
        const box = (await card.getByRole('button', { name, exact: true }).boundingBox())!
        expect(Math.min(box.width, box.height), `${where}: ${name}`).toBeGreaterThanOrEqual(44)
      }
      // O campo também continua legível: ele encolhe, mas não some.
      expect((await card.getByRole('spinbutton').boundingBox())!.width, where).toBeGreaterThanOrEqual(44)
    }
  })

  test('stepper: nos limites o botão fica indisponível sem soltar o foco', async ({ page }) => {
    await giftListWith(page)
    const card = catalogCard(page)
    const field = card.getByRole('spinbutton', { name: 'Pacotes de Fraldas tamanho M' })
    const minus = card.getByRole('button', { name: 'Diminuir pacotes' })
    const plus = card.getByRole('button', { name: 'Aumentar pacotes' })
    await expect(field).toHaveValue('1')
    await expect(minus).toHaveAttribute('aria-disabled', 'true')
    await minus.focus()
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('1')
    await expect(minus).toBeFocused()

    await field.fill('10000')
    await expect(plus).toHaveAttribute('aria-disabled', 'true')
    await expect(minus).not.toHaveAttribute('aria-disabled', 'true')
    await plus.focus()
    await page.keyboard.press('Space')
    await expect(field).toHaveValue('10000')
    await expect(plus).toBeFocused()
    // Acima do máximo, o − traz de volta para o limite.
    await field.fill('10001')
    await minus.click()
    await expect(field).toHaveValue('10000')
  })

  for (const [value, rule] of [['', 'vazio'], ['0', 'zero'], ['10001', 'acima do máximo']] as const) {
    test(`quantidade inválida (${rule}) não é enviada na lista nem no catálogo`, async ({ page }) => {
      const calls = await giftListWith(page, { write: () => ({ status: 200, json: {} }) })
      for (const [card, field, action] of [
        [listCard(page), 'Quantidade de Fraldas tamanho G', 'Atualizar quantidade'],
        [catalogCard(page), 'Pacotes de Fraldas tamanho M', 'Adicionar Fraldas tamanho M à lista'],
      ] as const) {
        const input = card.getByRole('spinbutton', { name: field })
        await input.fill(value)
        await card.getByRole('button', { name: action }).click()
        // O navegador segura o envio e leva o foco ao campo com a mensagem de validação.
        await expect(input).toBeFocused()
        expect(await input.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
        await expect(card.getByRole('status')).toHaveCount(0)
      }
      expect(calls).toEqual([])
    })
  }

  test('lista: salvar mostra o resultado dentro do card e não deixa o foco cair no vazio', async ({ page }) => {
    const calls = await giftListWith(page, { write: ({ body }) => ({ status: 200, json: { ...listedG, quantity_requested: body.p_quantity, version: 2, product: undefined } }) })
    const card = listCard(page)
    await card.getByRole('spinbutton', { name: 'Quantidade de Fraldas tamanho G' }).fill('14')
    const save = card.getByRole('button', { name: 'Atualizar quantidade' })
    await save.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('status')).toHaveText('Quantidade atualizada.')
    expect(calls).toEqual([{ p_event_id: eventId, p_item_id: listedG.id, p_version: 1, p_quantity: 14 }])
    await expect(card.getByRole('spinbutton')).toHaveValue('14')
    await expect(save).toBeDisabled()
    await expect(save).toBeFocused()
    await expectAccessible(page)
  })

  test('lista: erro ao salvar fica no card, com saída pelo "Recarregar quantidade"', async ({ page }) => {
    await giftListWith(page, { write: () => ({ status: 503, json: { message: 'unavailable' } }) })
    const card = listCard(page)
    const field = card.getByRole('spinbutton', { name: 'Quantidade de Fraldas tamanho G' })
    await field.fill('14')
    await card.getByRole('button', { name: 'Atualizar quantidade' }).click()
    await expect(card.getByRole('alert')).toBeVisible()
    await expect(card.getByRole('alert')).not.toContainText(/unavailable|503/)
    await expect(field).toHaveValue('14')
    await expectAccessible(page)
    page.once('dialog', dialog => void dialog.accept())
    await card.getByRole('button', { name: 'Recarregar quantidade' }).click()
    await expect(field).toHaveValue('12')
    await expect(card.getByRole('status')).toHaveText('Quantidade recarregada.')
    await expect(card.getByRole('alert')).toHaveCount(0)
  })

  // Decisão da G4b.3: o aviso de "versão mais recente" fica na própria linha. Cenário:
  // o organizador está digitando aqui e, em outra aba, alguém salva outra quantidade;
  // a consulta periódica traz a versão nova. Regra 7: o que está sendo digitado não
  // pode ser sobrescrito, e o aviso precisa dizer que existe algo mais novo.
  test('lista: alteração em outra aba avisa na linha sem apagar o que está sendo digitado', async ({ page }) => {
    let bumped = false
    await backend(page, () => ({ status: 200, json: full }), undefined, {
      '/rest/v1/event_items': ({ url }) => {
        const rows = url.searchParams.get('category') === 'eq.mimo' ? [] : [bumped ? { ...listedG, quantity_requested: 30, version: 5 } : listedG]
        return { status: 200, json: rows, headers: { 'content-range': rows.length ? '0-0/1' : '*/0' } }
      },
      '/rest/v1/products': none,
    })
    await page.goto(`/eventos/${eventId}/presentes`)
    const card = listCard(page)
    const field = card.getByRole('spinbutton', { name: 'Quantidade de Fraldas tamanho G' })
    await expect(field).toHaveValue('12')
    await field.fill('8')
    bumped = true
    const warning = card.getByText('Existe uma versão mais recente desta quantidade.')
    await expect(warning).toBeVisible({ timeout: 15_000 })
    // O que a pessoa digitou continua lá; o aviso e a saída estão na mesma linha.
    await expect(field).toHaveValue('8')
    await expect(card.getByRole('button', { name: 'Recarregar quantidade' })).toBeVisible()
    await expectAccessible(page)
    page.once('dialog', dialog => void dialog.accept())
    await card.getByRole('button', { name: 'Recarregar quantidade' }).focus()
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('30')
    const done = card.getByRole('status').filter({ hasText: 'Quantidade recarregada.' })
    await expect(done).toBeFocused()
    await expect(warning).toHaveCount(0)
  })

  // O "Recarregar quantidade" é o único jeito de sair do erro, e ele mesmo some ao ser
  // usado. Pelo teclado o foco caía no <body>: o próximo Tab voltava para "Pular para o
  // conteúdo", no topo da página, e a pessoa perdia a linha em que estava.
  test('lista: "Recarregar quantidade" não deixa o foco cair no vazio', async ({ page }) => {
    await giftListWith(page, { write: () => ({ status: 503, json: { message: 'unavailable' } }) })
    const card = listCard(page)
    const field = card.getByRole('spinbutton', { name: 'Quantidade de Fraldas tamanho G' })
    await field.fill('14')
    await card.getByRole('button', { name: 'Atualizar quantidade' }).click()
    await expect(card.getByRole('alert')).toBeVisible()
    page.once('dialog', dialog => void dialog.accept())
    await card.getByRole('button', { name: 'Recarregar quantidade' }).focus()
    await page.keyboard.press('Enter')
    const done = card.getByRole('status').filter({ hasText: 'Quantidade recarregada.' })
    await expect(done).toBeVisible()
    // O foco fica no resultado, dentro da linha: o próximo Tab continua dali.
    await expect(done).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(card.getByRole('button', { name: 'Remover da lista: Fraldas tamanho G' })).toBeFocused()
  })

  test('catálogo: erro fica na linha do produto e o sucesso vira aviso com foco', async ({ page }) => {
    let fail = true
    const calls = await giftListWith(page, { write: () => fail ? { status: 500, json: { message: 'boom' } } : { status: 200, json: { id: 'x' } } })
    const card = catalogCard(page)
    await card.getByRole('button', { name: 'Aumentar pacotes' }).click()
    const add = card.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' })
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('alert')).toBeVisible()
    await expect(card.getByRole('alert')).not.toContainText('boom')
    await expect(add).toBeFocused()
    fail = false
    await card.getByRole('button', { name: 'Adicionar Fraldas tamanho M à lista' }).click()
    // O aviso fica no topo das sugestões e recebe o foco: a linha incluída sai de lá.
    await expect(page.getByRole('region', { name: 'Sugestões do catálogo' }).getByRole('status')).toHaveText('“Fraldas tamanho M” entrou na lista.')
    await expect(page.getByRole('region', { name: 'Sugestões do catálogo' }).getByRole('status')).toBeFocused()
    await expect(card.getByRole('alert')).toHaveCount(0)
    expect(calls.at(-1)).toEqual({ p_event_id: eventId, p_product_id: product(2, 'M').id, p_quantity: 2 })
  })

  test('evento encerrado: stepper desabilitado, sem ação de salvar nem catálogo', async ({ page }) => {
    await giftListWith(page, { status: 'closed' })
    await expect(page.getByText('Evento encerrado. A lista está disponível apenas para consulta.')).toBeVisible()
    const card = listCard(page)
    await expect(card.getByRole('spinbutton', { name: 'Quantidade de Fraldas tamanho G' })).toBeDisabled()
    await expect(card.getByRole('spinbutton')).toHaveValue('12')
    await expect(card.getByRole('button', { name: 'Diminuir pacotes' })).toBeDisabled()
    await expect(card.getByRole('button', { name: 'Aumentar pacotes' })).toBeDisabled()
    await expect(card.getByRole('button', { name: 'Atualizar quantidade' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Adicionar à lista' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Lista pronta|Preparar|Completar/ })).toHaveCount(0)
    // A regra dos mimos está no presente ("cada convidado informa quantos vai levar"):
    // num chá que já aconteceu ela contradiz o aviso de encerrado logo acima.
    await page.getByRole('button', { name: 'Mimos', exact: true }).click()
    const treats = page.getByRole('region', { name: 'Mimos na lista' })
    await expect(treats.getByRole('article')).toBeVisible()
    await expect(treats.getByText('Sem limite de quantidade')).toHaveCount(0)
    await expectAccessible(page)
  })

  // Títulos sem saltos (h2 → h4) em nenhuma das telas do organizador.
  async function headingLevels(page: Page) {
    return page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(list => list.map(h => Number(h.tagName[1])))
  }
  function expectNoSkips(levels: number[]) {
    expect(levels[0]).toBe(1)
    levels.forEach((level, i) => { if (i) expect(level - levels[i - 1], `nível ${levels[i - 1]} → ${level}`).toBeLessThanOrEqual(1) })
  }

  test('painel: títulos em ordem e selos lidos sem o ícone', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}/convites`)
    await expect(page.getByRole('heading', { name: 'Fraldas tamanho P · 6 pacotes' })).toBeVisible()
    expectNoSkips(await headingLevels(page))
    const p = page.getByRole('region', { name: 'Fraldas por tamanho' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Tamanho P' }) })
    const snapshot = await p.ariaSnapshot()
    expect(snapshot).toContain('Completo')
    expect(snapshot).not.toMatch(/[✓•!×]/)
    const choice = await page.getByRole('region', { name: 'Escolhas dos convidados' }).ariaSnapshot()
    expect(choice).toContain('Vai levar')
    expect(choice).not.toMatch(/[✓•!×]/)
    // Mimo escolhido no painel é título de nível 3 sob "Mimos".
    await expect(page.getByRole('region', { name: 'Mimos' }).getByRole('heading', { level: 3, name: 'Mamadeira fictícia' })).toBeVisible()
  })

  test('lista: títulos em ordem', async ({ page }) => {
    await giftListWith(page)
    await expect(catalogCard(page)).toBeVisible()
    expectNoSkips(await headingLevels(page))
  })

  for (const [where, path] of [['painel', 'convites'], ['lista', 'presentes']] as const) {
    test(`${where}: 320 px com texto a 200% sem rolagem lateral nem controle cortado`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 })
      if (where === 'lista') await giftListWith(page); else { await backend(page, () => ({ status: 200, json: full })); await page.goto(`/eventos/${eventId}/${path}`) }
      await expect(page.locator('.card-title').first()).toBeVisible()
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
      // Nenhum botão, campo ou selo passa da borda do próprio card (overflow escondido também conta).
      const clipped = await page.locator('.card').evaluateAll(cards => cards.flatMap(card => {
        const outer = card.getBoundingClientRect()
        return [...card.querySelectorAll('button, input, .badge, .card-title')].filter(el => {
          const box = el.getBoundingClientRect()
          return box.width > 0 && (box.left < outer.left - 0.5 || box.right > outer.right + 0.5)
        }).map(el => el.getAttribute('aria-label') ?? el.textContent)
      }))
      expect(clipped).toEqual([])
    })
  }

  test('eventos: o card inteiro é um link sem controles dentro, com foco visível', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [event], headers: { 'content-range': '0-0/1' } }))
    await page.goto('/eventos')
    const card = page.getByRole('link', { name: /Chá de teste/ })
    await expect(card).toHaveAttribute('href', `/eventos/${eventId}`)
    await expect(card.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0)
    const name = await card.evaluate(el => el.textContent ?? '')
    expect(name).toContain('Publicado')
    expect(await card.ariaSnapshot()).not.toMatch(/[✓•]/)
    await card.focus()
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab')
    await expect(card).toBeFocused()
    expect(await card.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`))
  })

  // Regressão: os cards de evento ficam dentro de um `.stagger`, e a animação
  // de entrada preenchida (`both`) vencia o cascade e travava o `transform`,
  // matando a elevação do hover que a G3.1 aprovou. Ver `.stagger` no CSS.
  test('eventos: a animação de entrada não mata a elevação no hover', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [event], headers: { 'content-range': '0-0/1' } }))
    await page.goto('/eventos')
    const card = page.getByRole('link', { name: /Chá de teste/ })
    await expect(card).toBeVisible()
    const transform = () => card.evaluate(el => getComputedStyle(el).transform)
    // A entrada precisa ter terminado antes de medir: com `both` o valor ficava
    // preso em "none" para sempre, e não só durante a animação.
    await expect.poll(transform).toBe('none')
    await card.hover()
    await expect.poll(transform).not.toBe('none')
  })

  test('eventos: card de evento com a mesma anatomia', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [event], headers: { 'content-range': '0-0/1' } }))
    await page.goto('/eventos')
    const card = page.getByRole('link', { name: /Chá de teste/ })
    await expect(card).toHaveClass(/card-stack/)
    await expect(card.getByRole('heading', { name: 'Chá de teste' })).toHaveClass(/card-title/)
    await sameAnatomy(page)
    await expectAccessible(page)
  })
})

// Exclusão de um evento (Edge `delete-event`, contrato em CONTRATOS-TRANSACIONAIS.md):
// só rascunho e encerrado; confirmação no próprio card; nada é apagado sem ela.
test.describe('eventos: excluir evento', () => {
  const closed: EventRecord = { ...event, id: '10000000-0000-4000-8000-000000000002', status: 'closed', title: 'Chá encerrado', version: 7 }
  function list(initial: EventRecord[]) {
    let rows = initial
    const calls: Record<string, unknown>[] = []
    return {
      calls,
      events: (() => ({ status: 200, json: rows, headers: { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' } })) as Reply,
      remove: (reply?: ReturnType<Reply>): Reply => ({ body }) => {
        calls.push(body)
        if (reply) return reply
        rows = rows.filter(row => row.id !== body.event_id)
        return { status: 200, json: { event_id: body.event_id, items_removed: 1, invitations_removed: 0, reservations_removed: 0, storage_cleanup: 'done' } }
      },
    }
  }

  test('só rascunho e encerrado têm o botão, fora do link do card', async ({ page }) => {
    const draft: EventRecord = { ...event, id: '10000000-0000-4000-8000-000000000003', status: 'draft', title: 'Chá rascunho' }
    const mock = list([event, closed, draft])
    await backend(page, none, mock.events)
    await page.goto('/eventos')
    const published = page.getByRole('link', { name: /Chá de teste/ })
    await expect(published).toBeVisible()
    await expect(published.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Excluir evento Chá de teste' })).toHaveCount(0)
    for (const title of ['Chá encerrado', 'Chá rascunho']) {
      const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title }) })
      await expect(card.getByRole('button', { name: `Excluir evento ${title}` })).toBeVisible()
      await expect(card.getByRole('link', { name: new RegExp(title) })).toHaveCount(1)
      await expect(card.locator('a button, a a')).toHaveCount(0)
    }
    await expectAccessible(page)
  })

  test('cancelar a confirmação não apaga e devolve o foco ao botão', async ({ page }) => {
    const mock = list([closed])
    await backend(page, none, mock.events, { '/functions/v1/delete-event': mock.remove() })
    await page.goto('/eventos')
    const trigger = page.getByRole('button', { name: 'Excluir evento Chá encerrado' })
    await trigger.click()
    const question = page.getByText('Excluir “Chá encerrado”?', { exact: false })
    await expect(question).toBeVisible()
    await expect(question).toContainText('não dá para desfazer')
    await expect(question).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(question).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(mock.calls).toEqual([])
  })

  test('confirmar apaga com a versão, some da lista e avisa', async ({ page }) => {
    const mock = list([closed])
    await backend(page, none, mock.events, { '/functions/v1/delete-event': mock.remove() })
    await page.goto('/eventos')
    await page.getByRole('button', { name: 'Excluir evento Chá encerrado' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Evento “Chá encerrado” excluído.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chá encerrado' })).toHaveCount(0)
    expect(mock.calls).toEqual([{ event_id: closed.id, version: 7 }])
    await expectAccessible(page)
  })

  test('recusa do servidor mantém o card e explica', async ({ page }) => {
    const mock = list([closed])
    await backend(page, none, mock.events, { '/functions/v1/delete-event': mock.remove({ status: 409, json: { error: 'EVENT_NOT_DELETABLE' } }) })
    await page.goto('/eventos')
    await page.getByRole('button', { name: 'Excluir evento Chá encerrado' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    await expect(page.getByRole('alert')).toContainText('Só é possível excluir eventos em rascunho ou encerrados')
    await expect(page.getByRole('heading', { name: 'Chá encerrado' })).toBeVisible()
  })

  test('o card tem só o título como nome e o foco vai para o aviso depois de cada exclusão', async ({ page }) => {
    const other: EventRecord = { ...closed, id: '10000000-0000-4000-8000-000000000004', title: 'Chá antigo', version: 2 }
    const mock = list([closed, other])
    await backend(page, none, mock.events, { '/functions/v1/delete-event': mock.remove() })
    await page.goto('/eventos')
    await expect(page.getByRole('article', { name: 'Chá encerrado', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Excluir evento Chá encerrado' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    const notice = page.getByRole('status').filter({ hasText: 'excluído.' })
    await expect(notice).toHaveText('Evento “Chá encerrado” excluído.')
    await expect(page.getByRole('heading', { name: 'Chá encerrado' })).toHaveCount(0)
    await expect(notice).toBeFocused()
    // Segunda exclusão: o aviso troca de texto (não acumula) e recebe o foco de novo.
    await page.getByRole('button', { name: 'Excluir evento Chá antigo' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).dblclick()
    await expect(notice).toHaveText('Evento “Chá antigo” excluído.')
    await expect(page.getByRole('status').filter({ hasText: 'excluído.' })).toHaveCount(1)
    await expect(notice).toBeFocused()
    expect(mock.calls).toHaveLength(2)
  })

  test('excluir o único evento da última página volta para a página anterior', async ({ page }) => {
    const rows = Array.from({ length: 13 }, (_, n): EventRecord => ({ ...closed, id: `10000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`, title: `Chá fictício ${n + 1}` }))
    let current = rows
    const calls: unknown[] = []
    await backend(page, none, ({ url }) => {
      const offset = Number(url.searchParams.get('offset') ?? 0)
      if (offset >= current.length) return { status: 416, json: { code: 'PGRST103', message: 'Requested range not satisfiable' } }
      const slice = current.slice(offset, offset + 12)
      return { status: 200, json: slice, headers: { 'content-range': `${offset}-${offset + slice.length - 1}/${current.length}` } }
    }, { '/functions/v1/delete-event': ({ body }) => { calls.push(body); current = current.filter(row => row.id !== body.event_id); return { status: 200, json: { event_id: body.event_id, storage_cleanup: 'done' } } } })
    await page.goto('/eventos')
    await page.getByRole('button', { name: 'Próxima' }).click()
    await page.getByRole('button', { name: 'Excluir evento Chá fictício 13' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Evento “Chá fictício 13” excluído.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chá fictício 1', exact: true })).toBeVisible()
    await expect(page.getByText('Não foi possível carregar seus eventos.')).toHaveCount(0)
    expect(calls).toHaveLength(1)
  })

  test('em 320 px com texto a 200% a confirmação cabe e os alvos têm 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const mock = list([closed])
    await backend(page, none, mock.events)
    await page.goto('/eventos')
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await page.getByRole('button', { name: 'Excluir evento Chá encerrado' }).click()
    for (const name of ['Excluir evento Chá encerrado', 'Excluir definitivamente', 'Cancelar']) {
      const box = await page.getByRole('button', { name }).boundingBox()
      expect(box!.height, name).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expectAccessible(page)
  })
  test('limpeza pendente dos arquivos ainda conta como excluído e o pedido leva o login', async ({ page }) => {
    const mock = list([closed])
    let auth = ''
    await backend(page, none, mock.events, { '/functions/v1/delete-event': request => {
      const reply = mock.remove()(request)
      return { ...reply, json: { ...(reply.json as object), storage_cleanup: 'pending' } }
    } })
    page.on('request', request => { if (request.url().includes('/functions/v1/delete-event') && request.method() === 'POST') auth = request.headers().authorization ?? '' })
    await page.goto('/eventos')
    await page.getByRole('button', { name: 'Excluir evento Chá encerrado' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Evento “Chá encerrado” excluído.' })).toBeVisible()
    expect(auth).toMatch(/^Bearer \S+$/)
  })

  test('evento já excluído em outra aba some da lista, sem aviso de sucesso', async ({ page }) => {
    const mock = list([closed])
    let gone = false
    await backend(page, none, (request => gone ? { status: 200, json: [], headers: { 'content-range': '*/0' } } : mock.events(request)) as Reply,
      { '/functions/v1/delete-event': () => { gone = true; return { status: 404, json: { error: 'EVENT_NOT_FOUND' } } } })
    await page.goto('/eventos')
    await page.getByRole('button', { name: 'Excluir evento Chá encerrado' }).click()
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    await expect(page.getByRole('heading', { name: 'Chá encerrado' })).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Evento “Chá encerrado” excluído.' })).toHaveCount(0)
  })
})

// G4 (docs/design/G4-PAINEL.md): o painel é a tela inicial do evento, com
// cabeçalho e abas comuns, e o organizador vê o convite como o convidado.
test.describe('G4 · painel do evento', () => {
  const tabs = (page: Page) => page.getByRole('navigation', { name: 'Áreas do evento' })

  test('o card em “Seus eventos” abre o painel, com o título do evento e as abas', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto('/eventos')
    await page.getByRole('link', { name: /Chá de teste/ }).click()
    await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Chá de teste' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
    await expect(tabs(page).getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page')
    await expect(tabs(page).getByRole('link', { name: 'Presentes' })).not.toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: 'Ver como o convidado vê' })).toHaveAttribute('href', `/eventos/${eventId}/previa`)
    await expect(page.getByRole('link', { name: 'Seus eventos' }).first()).toBeVisible()
    await expectAccessible(page)
    await page.screenshot({ path: `test-results/g4-painel-${test.info().project.name}.png`, fullPage: true })
  })

  test('o endereço antigo de convites leva ao painel', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}/convites`)
    await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`))
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
  })

  test('as abas levam a presentes e aos dados do evento, com o mesmo cabeçalho', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), undefined, { '/rest/v1/event_items': none, '/rest/v1/products': none })
    await page.goto(`/eventos/${eventId}`)
    await tabs(page).getByRole('link', { name: 'Dados do evento' }).click()
    await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/dados$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Chá de teste' })).toBeVisible()
    await expect(page.getByLabel('Nome do evento')).toHaveValue('Chá de teste')
    await expect(tabs(page).getByRole('link', { name: 'Dados do evento' })).toHaveAttribute('aria-current', 'page')
    await expectAccessible(page)
    await page.screenshot({ path: `test-results/g4-dados-${test.info().project.name}.png`, fullPage: true })
    await tabs(page).getByRole('link', { name: 'Presentes' }).click()
    await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/presentes$`))
    await expect(page.getByRole('heading', { name: 'Lista de presentes' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expectAccessible(page)
  })

  test('o cabeçalho mostra quantos dias faltam, pelo horário de Brasília', async ({ page }) => {
    // Mesmo horário, nove dias depois: nove dias de calendário em Brasília.
    const soon = new Date(Date.now() + 9 * 86_400_000).toISOString()
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, starts_at: soon }] }))
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByText('Faltam 9 dias')).toBeVisible()
  })

  test('o painel começa pelo resumo e segue com convidados, fraldas, mimos e escolhas', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
    const order = await page.locator('main h2').allTextContents()
    const wanted = ['Resumo', 'Convidados', 'Fraldas por tamanho', 'Mimos', 'Escolhas dos convidados']
    expect(order.filter(text => wanted.includes(text))).toEqual(wanted)
  })

  test('“Convidar alguém” abre o formulário e leva o foco ao nome', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    const open = page.getByRole('button', { name: 'Convidar alguém' })
    await expect(open).toBeEnabled()
    await expect(page.getByLabel('Nome da pessoa ou família')).toHaveCount(0)
    await expect(open).toHaveAttribute('aria-expanded', 'false')
    await open.click()
    await expect(open).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByLabel('Nome da pessoa ou família')).toBeFocused()
    await expectAccessible(page)
  })

  test('fraldas aparecem numa só lista de progresso, sem um card por tamanho', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    const region = page.getByRole('region', { name: 'Fraldas por tamanho' })
    await expect(region.getByRole('listitem')).toHaveCount(4)
    await expect(region.locator('li.card')).toHaveCount(0)
  })

  test('cabe em 320 px com texto a 200%', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
  })

  test('a prévia mostra o convite com dados de exemplo e não envia nada', async ({ page }) => {
    const guestCalls: string[] = []
    page.on('request', request => { if (request.url().includes('/functions/v1/guest')) guestCalls.push(request.url()) })
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, private_address: 'Rua fictícia, 10' }] }))
    await page.goto(`/eventos/${eventId}`)
    await page.getByRole('link', { name: 'Ver como o convidado vê' }).click()
    await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/previa$`))
    await expect(page.getByText('Prévia do convite')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Chá de teste' })).toBeVisible()
    await expect(page.getByText('Convidado de exemplo, este convite é para você')).toBeVisible()
    await expect(page.getByText('Rua fictícia, 10').first()).toBeVisible()
    const gift = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho M' }) })
    await gift.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByText('Na prévia, nada é enviado.')).toBeVisible()
    await page.getByRole('radio', { name: 'Vai participar' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(page.getByRole('region', { name: 'Podemos contar com você?' }).getByText('Na prévia, nada é enviado.')).toBeVisible()
    expect(guestCalls).toEqual([])
    await expect(page.getByRole('link', { name: 'Voltar ao painel' })).toHaveAttribute('href', `/eventos/${eventId}`)
    await expectAccessible(page)
    await page.screenshot({ path: `test-results/g4-previa-${test.info().project.name}.png`, fullPage: true })
  })

  test('evento inexistente: as três abas dizem “Evento não encontrado”, sem abas nem prévia', async ({ page }) => {
    await backend(page, () => ({ status: 400, json: { message: 'EVENT_NOT_FOUND' } }), () => ({ status: 200, json: [] }))
    for (const path of ['', '/presentes', '/dados']) {
      await page.goto(`/eventos/${eventId}${path}`)
      await expect(page.getByRole('heading', { level: 2, name: 'Evento não encontrado' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: 'Seu evento' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ver como o convidado vê' })).toHaveCount(0)
      await expect(tabs(page)).toHaveCount(0)
      await expect(page.getByRole('main').getByRole('link', { name: 'Seus eventos' })).toBeVisible()
    }
    await expectAccessible(page)
  })

  test('trocar de aba pelo teclado mantém o foco na aba escolhida', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), undefined, { '/rest/v1/event_items': none, '/rest/v1/products': none })
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
    const data = tabs(page).getByRole('link', { name: 'Dados do evento' })
    await data.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Nome do evento')).toBeVisible()
    await expect(data).toBeFocused()
    await expect(data).toHaveAttribute('aria-current', 'page')
  })

  test('“Fechar” devolve o foco a “Convidar alguém”', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    const open = page.getByRole('button', { name: 'Convidar alguém' })
    await open.click()
    await page.getByRole('region', { name: 'Convide alguém especial' }).getByRole('button', { name: 'Fechar' }).click()
    await expect(page.getByRole('region', { name: 'Convide alguém especial' })).toHaveCount(0)
    await expect(open).toHaveAttribute('aria-expanded', 'false')
    await expect(open).toBeFocused()
  })

  test('fechar o formulário só pede confirmação se o link não foi copiado', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await backend(page, actions({ create: { status: 200, json: { id: 'novo', token: 'token-ficticio' } } }))
    await page.goto(`/eventos/${eventId}`)
    await page.getByRole('button', { name: 'Convidar alguém' }).click()
    const form = page.getByRole('region', { name: 'Convide alguém especial' })
    await form.getByLabel('Nome da pessoa ou família').fill('Convidado fictício 9')
    await form.getByRole('button', { name: 'Criar convite' }).click()
    await expect(form.getByLabel('Link para compartilhar')).toHaveValue(/token-ficticio/)
    const dialogs: string[] = []
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss() })
    await form.getByRole('button', { name: 'Fechar' }).click()
    expect(dialogs).toHaveLength(1)
    await expect(form).toBeVisible()
    await form.getByRole('button', { name: 'Copiar convite' }).click()
    await expect(form.getByRole('status')).toHaveText('Link copiado.')
    await form.getByRole('button', { name: 'Fechar' }).click()
    await expect(form).toHaveCount(0)
    expect(dialogs).toHaveLength(1)
  })

  test('evento encerrado não oferece “Convidar alguém” nem manda publicar', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, status: 'closed' }] }))
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByRole('heading', { name: 'Convidados', exact: true })).toBeVisible()
    await expect(page.getByText('Este evento foi encerrado. Não é possível criar novos convites.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Convidar alguém' })).toHaveCount(0)
    await expect(page.getByText(/Publique o evento/)).toHaveCount(0)
  })

  for (const [label, path] of [['presentes', '/presentes'], ['prévia', '/previa']] as const) {
    test(`${label} cabe em 320 px com texto a 200%`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 })
      await backend(page, () => ({ status: 200, json: full }), undefined, { '/rest/v1/event_items': none, '/rest/v1/products': none })
      await page.goto(`/eventos/${eventId}${path}`)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Chá de teste')
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
    })
  }

  test('com o formulário aberto e texto a 200%, o painel cabe em 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    await page.getByRole('button', { name: 'Convidar alguém' }).click()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
    for (const button of [page.getByRole('button', { name: 'Convidar alguém' }), page.getByRole('button', { name: 'Fechar' }), page.getByRole('link', { name: 'Ver como o convidado vê' })])
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('endereço com id inválido diz “Evento não encontrado”, sem consultar o servidor', async ({ page }) => {
    const pedidos: string[] = []
    await backend(page, () => ({ status: 200, json: full }))
    page.on('request', request => { if (request.url().includes('e2e.supabase.co/rest')) pedidos.push(new URL(request.url()).pathname) })
    await page.goto('/eventos/%3Cid%3E')
    await expect(page.getByRole('heading', { name: 'Evento não encontrado' })).toBeVisible()
    await expect(tabs(page)).toHaveCount(0)
    expect(pedidos).toEqual([])
  })

  test('prévia sem data pede para preencher os dados do evento', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [{ ...event, starts_at: null, status: 'draft' }] }))
    await page.goto(`/eventos/${eventId}/previa`)
    await expect(page.getByText('Defina a data do evento em “Dados do evento” para ver a prévia.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dados do evento' })).toHaveAttribute('href', `/eventos/${eventId}/dados`)
  })
})

// Estabilidade: a reconsulta a cada 5 s não pode empurrar a tela ("tremida") nem
// piscar "Atualizando…" quando a resposta é rápida.
test.describe('reconsulta sem tremida', () => {
  // Observa por um ciclo de reconsulta: posições verticais do alvo e se o aviso apareceu.
  async function watch(page: Page, selector: string, ms = 6500) {
    return page.evaluate(({ selector, ms }) => new Promise<{ tops: number[]; flashed: boolean }>(resolve => {
      const tops = new Set<number>()
      let flashed = false
      const target = () => document.querySelector(selector)
      const observer = new MutationObserver(() => { if (document.querySelector('main')?.textContent?.includes('Atualizando')) flashed = true })
      observer.observe(document.body, { subtree: true, childList: true, characterData: true })
      const timer = setInterval(() => { const box = target()?.getBoundingClientRect(); if (box) tops.add(Math.round(box.top + window.scrollY)) }, 25)
      setTimeout(() => { clearInterval(timer); observer.disconnect(); resolve({ tops: [...tops], flashed }) }, ms)
    }), { selector, ms })
  }
  const card = 'main :is(a, article).card'

  test('“Seus eventos”: resposta rápida não mostra aviso nem mexe na lista', async ({ page }) => {
    await backend(page, none)
    await page.goto('/eventos')
    await expect(page.locator(card).first()).toBeVisible()
    const seen = await watch(page, card)
    expect(seen.flashed).toBe(false)
    expect(seen.tops).toHaveLength(1)
  })

  test('“Seus eventos”: resposta lenta mostra o aviso sem empurrar a lista', async ({ page }) => {
    await backend(page, none)
    await page.goto('/eventos')
    await expect(page.locator(card).first()).toBeVisible()
    await page.route('**/rest/v1/events**', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.fallback() })
    const seen = await watch(page, card)
    expect(seen.flashed).toBe(true)
    expect(seen.tops).toHaveLength(1)
  })

  test('detalhes do evento no celular: reconsulta não mexe no formulário', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await backend(page, none)
    // G4: a edição saiu de /eventos/:id (agora o painel) para a aba “Dados do evento”.
    await page.goto(`/eventos/${eventId}/dados`)
    await expect(page.getByLabel('Nome do evento')).toBeVisible()
    await page.route('**/rest/v1/events**', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.fallback() })
    const seen = await watch(page, 'main form')
    expect(seen.tops).toHaveLength(1)
  })

  test('painel: resposta rápida não pisca “Atualizando painel…”', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }))
    await page.goto(`/eventos/${eventId}`)
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
    const seen = await watch(page, 'main h2')
    expect(seen.flashed).toBe(false)
    expect(seen.tops).toHaveLength(1)
  })
})

// Convidado que não vai mas reservou presente: a organização precisa entender o número.
test.describe('painel: quem não vai e mesmo assim reservou', () => {
  const withGift = { ...full, reservations: [...full.reservations,
    { name: 'Convidado fictício 2', title: 'Fraldas tamanho M', category: 'fralda' as const, diaper_size: 'M' as const, quantity: 2, status: 'reserved' }] }
  const card = (page: Page, name: string) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) })

  test('painel marca quem não vai e mesmo assim vai enviar presente', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: withGift }))
    await page.goto(`/eventos/${eventId}/convites`)
    const declined = card(page, 'Convidado fictício 2')
    await expect(declined).toContainText('Não poderá ir')
    await expect(declined.locator('.badge', { hasText: 'Vai enviar presente' })).toBeVisible()
    await expect(card(page, 'Convidado fictício 1').locator('.badge', { hasText: 'Vai enviar presente' })).toHaveCount(0)
    await expectAccessible(page)
  })

  test('os dois selos cabem em 320 px com texto a 200%', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page, () => ({ status: 200, json: withGift }))
    await page.goto(`/eventos/${eventId}/convites`)
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const badges = card(page, 'Convidado fictício 2').locator('.card-badges .badge')
    await expect(badges).toHaveCount(3)
    for (const badge of await badges.all()) await expect(badge).toBeVisible()
    await expectAccessible(page)
  })

  // Quem escolheu presente e ainda não respondeu não disse que não vem: o selo
  // “Vai enviar presente” significa “não vem, mas manda”. Em quem está sem
  // resposta ele inventa uma ausência, e o convite nem faz essa pergunta a
  // essa pessoa (o aviso do convite só aparece para quem respondeu que não vai).
  test('quem ainda não respondeu não é anunciado como ausente que manda presente', async ({ page }) => {
    const noAnswerGift = { ...full, reservations: [...full.reservations,
      { name: 'Convidado fictício 5', title: 'Fraldas tamanho G', category: 'fralda' as const, diaper_size: 'G' as const, quantity: 1, status: 'reserved' }] }
    await backend(page, () => ({ status: 200, json: noAnswerGift }))
    await page.goto(`/eventos/${eventId}/convites`)
    const waiting = card(page, 'Convidado fictício 5')
    await expect(waiting).toContainText('Sem resposta')
    await expect(waiting.locator('.badge', { hasText: 'Vai enviar presente' })).toHaveCount(0)
    // A escolha continua visível onde é fato, sem virar intenção de ausência.
    await expect(page.getByRole('region', { name: 'Escolhas dos convidados' })).toContainText('Convidado fictício 5')
  })

  // O selo casa reserva com convite pelo nome (o back ainda não manda
  // `invitation_id`). Com dois convites de mesmo nome não há como saber de quem
  // é a reserva: melhor não afirmar nada do que marcar a pessoa errada.
  test('dois convites de mesmo nome não recebem o selo por adivinhação', async ({ page }) => {
    const twins: Dashboard = { ...full,
      invitations: [...full.invitations, invitation(6, { name: 'Convidado fictício 2', response: 'no', kind: 'individual', capacity: 1 })],
      reservations: [...full.reservations,
        { name: 'Convidado fictício 2', title: 'Fraldas tamanho M', category: 'fralda' as const, diaper_size: 'M' as const, quantity: 2, status: 'reserved' }] }
    await backend(page, () => ({ status: 200, json: twins }))
    await page.goto(`/eventos/${eventId}/convites`)
    const homonyms = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Convidado fictício 2' }) })
    await expect(homonyms).toHaveCount(2)
    await expect(homonyms.locator('.badge', { hasText: 'Vai enviar presente' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Escolhas dos convidados' })).toContainText('Convidado fictício 2')
  })
})

// A entrada em cascata (`.stagger`) usa `animation-fill-mode: backwards`: o
// estado inicial vale durante o atraso, e o final volta a ser o padrão da tela
// (era `both`, que congelava o `transform` e matava a elevação dos cards).
// Estas telas são todas as listas em cascata do organizador.
test.describe('entrada em cascata sem sobra', () => {
  test.use({ reducedMotion: 'no-preference' })
  const settled = (page: Page) => page.evaluate(async () => {
    const items = [...document.querySelectorAll('.stagger > *')] as HTMLElement[]
    await Promise.all(items.flatMap(el => el.getAnimations().map(a => a.finished.then(() => {}, () => {}))))
    return items.map(el => { const s = getComputedStyle(el); return { fill: s.animationFillMode, opacity: s.opacity, transform: s.transform } })
  })

  const screens: [string, string][] = [['painel de convites', 'convites'], ['lista de presentes e catálogo', 'presentes']]
  for (const [label, path] of screens) {
    test(`${label}: nada fica invisível nem deslocado depois da entrada`, async ({ page }) => {
      await backend(page, () => ({ status: 200, json: full }), undefined, {
        '/rest/v1/event_items': () => ({ status: 200, json: [], headers: { 'content-range': '*/0' } }),
        '/rest/v1/products': () => ({ status: 200, json: [product(1, 'G'), product(2, 'M')], headers: { 'content-range': '0-1/2' } }),
      })
      await page.goto(`/eventos/${eventId}/${path}`)
      // A G4 carrega a aba dentro de um Suspense: o h1 é do cabeçalho comum e
      // aparece antes do conteúdo. Esperar o próprio item em cascata.
      await expect(page.locator('.stagger > *').first()).toBeVisible()
      const states = await settled(page)
      expect(states.length, 'nenhum item em cascata na tela').toBeGreaterThan(0)
      for (const state of states) expect(state).toEqual({ fill: 'backwards', opacity: '1', transform: 'none' })
    })
  }

  test('“Seus eventos”: nada fica invisível nem deslocado depois da entrada', async ({ page }) => {
    await backend(page, () => ({ status: 200, json: full }), () => ({ status: 200, json: [event], headers: { 'content-range': '0-0/1' } }))
    await page.goto('/eventos')
    await expect(page.getByRole('link', { name: /Chá de teste/ })).toBeVisible()
    const states = await settled(page)
    expect(states.length).toBeGreaterThan(0)
    for (const state of states) expect(state).toEqual({ fill: 'backwards', opacity: '1', transform: 'none' })
  })
})
