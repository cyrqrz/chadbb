import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import { session, userId } from './session'
import { tabTo } from './keyboard'

// Atalho "Adicionar todos os tamanhos" (pedido do titular em 02/10): na aba Fraldas,
// os tamanhos sugeridos entram de uma vez, cada um com os pacotes do campo da linha.
// O servidor (add_event_items) faz tudo ou nada; aqui é a tela: o que vai no pedido,
// estado ocupado, anúncio, foco, teclado, offline e 320 px com texto a 200%.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

type Size = 'P' | 'M' | 'G' | 'XG'
const sizes: Size[] = ['P', 'M', 'G', 'XG']
const product = (size: Size) => ({ id: `84000000-0000-4000-8000-0000000000${sizes.indexOf(size) + 1}0`, title: `Fraldas tamanho ${size}`, description: '',
  platform: 'manual', category: 'fralda', diaper_size: size, active: true, event_id: null })
const item = (size: Size, quantity: number) => ({ id: `94000000-0000-4000-8000-0000000000${sizes.indexOf(size) + 1}0`, event_id: eventId,
  product_id: product(size).id, quantity_requested: quantity, category: 'fralda', diaper_size: size, version: 1, product: product(size) })
// O catálogo chega por título, como o PostgREST ordena: G, M, P, XG.
const catalog = ['G', 'M', 'P', 'XG'].map(size => product(size as Size))

type Answer = { status: number; json: unknown }
async function open(page: Page, options: { listed?: Size[]; addAll?: (diapers: Record<Size, number>) => Answer | Promise<Answer> } = {}) {
  const rows = (options.listed ?? []).map(size => item(size, 4))
  const calls: Record<string, number>[] = []
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let result: Answer & { headers?: Record<string, string> }
    if (path === '/auth/v1/user') result = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') result = { status: 200, json: [event] }
    else if (path === '/rest/v1/rpc/add_event_items') {
      const body = route.request().postDataJSON()
      expect(body.p_event_id).toBe(eventId)
      // O pedido vai por produto; aqui ele é lido como pacotes por tamanho, como a tela mostra.
      const diapers = Object.fromEntries(body.p_items.map((row: { product_id: string; quantity: number }) =>
        [catalog.find(product => product.id === row.product_id)!.diaper_size, row.quantity])) as Record<Size, number>
      calls.push(diapers)
      // Padrão: o servidor inclui o que ainda não estava na lista, sem somar.
      const entered = options.addAll ? await options.addAll(diapers) : (() => {
        const sizesIn = sizes.filter(size => size in diapers && !rows.some(row => row.diaper_size === size))
        rows.push(...sizesIn.map(size => item(size, diapers[size])))
        return { status: 200, json: sizesIn }
      })()
      // As respostas dos testes vêm em tamanhos; o servidor devolve os produtos.
      result = entered.status === 200 ? { status: 200, json: (entered.json as Size[]).map(size => product(size).id) } : entered
    } else if (path === '/rest/v1/products') result = { status: 200, json: catalog, headers: { 'content-range': `0-${catalog.length - 1}/${catalog.length}` } }
    else if (path === '/rest/v1/event_items') {
      const list = url.searchParams.get('category') === 'eq.mimo' ? [] : rows
      result = { status: 200, json: list, headers: { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' } }
    } else result = { status: 200, json: [], headers: { 'content-range': '*/0' } }
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.json),
      headers: { 'access-control-expose-headers': 'content-range', ...result.headers } })
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  const suggestions = page.getByRole('region', { name: 'Sugestões do catálogo' })
  await expect(suggestions.getByRole('article').first()).toBeVisible()
  return { calls, suggestions, button: suggestions.getByRole('button', { name: 'Adicionar todos os tamanhos' }) }
}
const packages = (page: Page, size: Size) => page.getByRole('spinbutton', { name: `Pacotes de Fraldas tamanho ${size}` })
async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('adiciona todos os tamanhos com os pacotes de cada linha e anuncia o resultado', async ({ page }) => {
  const { calls, suggestions, button } = await open(page)
  // Do menor ao maior, como a lista acima, embora o catálogo chegue por título.
  await expect(suggestions.getByRole('heading', { level: 4 })).toHaveText(sizes.map(size => `Fraldas tamanho ${size}`))
  // O botão diz o que faz, e a descrição diz quais tamanhos e com quantos pacotes.
  await expect(button).toHaveAccessibleDescription('Inclui os tamanhos P, M, G e XG de uma vez, cada um com os pacotes informados na própria linha.')
  await packages(page, 'P').fill('6')
  await packages(page, 'M').fill('19')
  await suggestions.getByRole('button', { name: 'Aumentar pacotes' }).nth(2).click()
  await button.click()
  expect(calls).toEqual([{ P: 6, M: 19, G: 2, XG: 1 }])
  // Os tamanhos saem das sugestões: o foco vai para o aviso, que é anunciado.
  const notice = suggestions.getByRole('status').filter({ hasText: 'Tamanhos P, M, G e XG entraram na lista.' })
  await expect(notice).toBeFocused()
  await expect(button).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Fraldas na lista' }).getByRole('article')).toHaveCount(4)
  await expect(page.getByRole('list', { name: 'Pacotes pedidos por tamanho' })).toContainText('P 6 pacotes')
  await expect(suggestions.getByText('Todos os tamanhos de fralda do catálogo já estão na lista.')).toBeVisible()
  await expectAccessible(page)
})

test('só os tamanhos que faltam; o que já estava na lista é pulado e dito', async ({ page }) => {
  // A lista desta aba ainda não sabe do G incluído em outra aba: o servidor pula.
  const { calls, suggestions, button } = await open(page, { listed: ['P'], addAll: () => ({ status: 200, json: ['M', 'XG'] }) })
  await expect(suggestions.getByRole('article')).toHaveCount(3)
  await expect(button).toHaveAccessibleDescription(/os tamanhos M, G e XG de uma vez/)
  await button.click()
  expect(calls).toEqual([{ M: 1, G: 1, XG: 1 }])
  await expect(suggestions.getByRole('status').filter({ hasText: 'Tamanhos M e XG entraram na lista. G já estava na lista.' })).toBeFocused()
})

test('ocupado: o foco fica no botão, as linhas travam e o duplo clique envia uma vez só', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  const { calls, suggestions, button } = await open(page, { addAll: async () => { await held; return { status: 200, json: ['P', 'M', 'G', 'XG'] } } })
  await button.focus()
  await page.keyboard.press('Enter')
  const busy = suggestions.getByRole('button', { name: 'Adicionando…' })
  await expect(busy).toHaveAttribute('aria-disabled', 'true')
  await expect(busy).toBeFocused()
  await page.keyboard.press('Enter')
  await busy.dispatchEvent('click')
  // As linhas não enviam nem mudam de valor enquanto o atalho está em curso.
  await expect(suggestions.getByRole('button', { name: 'Adicionar Fraldas tamanho P à lista' })).toHaveAttribute('aria-disabled', 'true')
  await expect(packages(page, 'P')).toHaveAttribute('readonly', '')
  expect(calls).toHaveLength(1)
  release()
  await expect(suggestions.getByRole('status').filter({ hasText: 'entraram na lista' })).toBeFocused()
  expect(calls).toHaveLength(1)
})

test('recusa do servidor: nada é anunciado como incluído e o foco continua no botão', async ({ page }) => {
  const { suggestions, button } = await open(page, { addAll: () => ({ status: 400, json: { message: 'ITEM_ALREADY_EXISTS', code: 'P0001' } }) })
  await button.click()
  await expect(suggestions.getByRole('alert')).toHaveText('Um item da lista tem o mesmo nome de um destes tamanhos, e nada foi incluído. Adicione um por vez para ver qual.')
  await expect(button).toBeFocused()
  await expect(suggestions.getByRole('status').filter({ hasText: 'entraram na lista' })).toHaveCount(0)
  await expect(suggestions.getByRole('article')).toHaveCount(4)
  await expectAccessible(page)
})

test('pacotes inválidos numa linha: avisa qual e não chama o servidor', async ({ page }) => {
  const { calls, suggestions, button } = await open(page)
  await packages(page, 'G').fill('0')
  await button.click()
  await expect(suggestions.getByRole('alert')).toHaveText('Confira os pacotes de Fraldas tamanho G: informe uma quantidade inteira entre 1 e 10.000.')
  expect(calls).toHaveLength(0)
  // Corrigir o campo tira o aviso.
  await packages(page, 'G').fill('3')
  await expect(suggestions.getByRole('alert')).toHaveCount(0)
})

test('offline: mesmo aviso "Sem conexão" dos outros pontos de gravação, sem chamar o servidor', async ({ page }) => {
  const { calls, suggestions, button } = await open(page)
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await button.click()
  await expect(suggestions.getByRole('alert')).toContainText('Sem conexão. Esta alteração não foi enviada')
  expect(calls).toHaveLength(0)
})

test('com um tamanho só sobrando, o atalho sai: o "Adicionar" da linha já faz o mesmo', async ({ page }) => {
  const { suggestions, button } = await open(page, { listed: ['P', 'M', 'G'] })
  await expect(suggestions.getByRole('article')).toHaveCount(1)
  await expect(suggestions.getByRole('button', { name: 'Adicionar Fraldas tamanho XG à lista' })).toBeVisible()
  await expect(button).toHaveCount(0)
})

test('pelo teclado: o atalho vem depois da última linha e funciona com Enter', async ({ page }) => {
  const { calls, suggestions, button } = await open(page)
  await suggestions.getByRole('button', { name: 'Adicionar Fraldas tamanho XG à lista' }).focus()
  await tabTo(page, button, 3)
  await page.keyboard.press('Enter')
  await expect(suggestions.getByRole('status').filter({ hasText: 'entraram na lista' })).toBeFocused()
  expect(calls).toEqual([{ P: 1, M: 1, G: 1, XG: 1 }])
})

for (const width of [320, 375, 1280]) {
  test(`atalho cabe em ${width} px com texto a 200%, com alvo de 44 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const { button } = await open(page)
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const target = (await button.boundingBox())!
    expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44)
    await expectAccessible(page)
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/fraldas-atalho-${width}-${test.info().project.name}.png` })
  })
}
