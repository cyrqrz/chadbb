import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import { session, userId } from './session'
import { tabTo } from './keyboard'

// Seleção de vários na lista de presentes (pedido do titular em 02/10), no padrão de
// "Seus eventos": "Selecionar" com aria-pressed, caixa por linha com nome acessível,
// barra com "Selecionar todos" parcial e contagem viva. Incluir sugestões marcadas age
// direto; remover itens marcados confirma. O servidor faz tudo ou nada
// (add_event_items / remove_event_items); aqui é o que a tela envia, anuncia e foca.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

type Size = 'P' | 'M' | 'G' | 'XG'
type Product = { id: string; title: string; description: string; platform: string; category: string; diaper_size: Size | null; active: boolean; event_id: null }
type Row = { id: string; event_id: string; product_id: string; quantity_requested: number | null; category: string; diaper_size: Size | null; version: number; product: Product }
const sizes: Size[] = ['P', 'M', 'G', 'XG']
const hex = (n: number) => String(n).padStart(2, '0')
const diaperProduct = (size: Size): Product => ({ id: `85000000-0000-4000-8000-0000000000${hex(sizes.indexOf(size) + 1)}`, title: `Fraldas tamanho ${size}`, description: '',
  platform: 'manual', category: 'fralda', diaper_size: size, active: true, event_id: null })
const treatProduct = (n: number, title: string): Product => ({ id: `86000000-0000-4000-8000-0000000000${hex(n)}`, title, description: '',
  platform: 'manual', category: 'mimo', diaper_size: null, active: true, event_id: null })
const row = (product: Product, quantity: number | null, n: number): Row => ({ id: `96000000-0000-4000-8000-0000000000${hex(n)}`, event_id: eventId,
  product_id: product.id, quantity_requested: quantity, category: product.category, diaper_size: product.diaper_size, version: 2, product })
const treats = ['Babador fictício', 'Manta fictícia', 'Toalha fictícia', 'Pomada fictícia'].map((title, i) => treatProduct(i + 1, title))
const catalogOf = (category: string) => category === 'mimo' ? treats : sizes.map(diaperProduct)

type Answer = { status: number; json: unknown }
type Body = { p_event_id: string; p_items: Record<string, unknown>[] }
async function open(page: Page, options: { rows?: Row[]; onAdd?: (body: Body) => Answer | undefined; onRemove?: (body: Body) => Answer | undefined } = {}) {
  let rows = options.rows ?? []
  const adds: Record<string, unknown>[][] = []
  const removes: Record<string, unknown>[][] = []
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const category = url.searchParams.get('category')?.replace('eq.', '')
    let result: Answer & { headers?: Record<string, string> }
    const paged = (list: unknown[]) => ({ status: 200, json: list, headers: { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' } })
    if (path === '/auth/v1/user') result = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') result = { status: 200, json: [event] }
    else if (path === '/rest/v1/products') result = paged(catalogOf(category ?? 'fralda'))
    else if (path === '/rest/v1/event_items') result = paged(category ? rows.filter(item => item.category === category) : rows)
    else if (path === '/rest/v1/rpc/add_event_items') {
      const body = route.request().postDataJSON() as Body
      adds.push(body.p_items)
      result = options.onAdd?.(body) ?? (() => {
        const entered = body.p_items.filter(item => !rows.some(listed => listed.product_id === item.product_id))
        rows = [...rows, ...entered.map((item, i) => row([...treats, ...sizes.map(diaperProduct)].find(product => product.id === item.product_id)!, item.quantity as number | null, 50 + rows.length + i))]
        return { status: 200, json: entered.map(item => item.product_id) }
      })()
    } else if (path === '/rest/v1/rpc/remove_event_items') {
      const body = route.request().postDataJSON() as Body
      removes.push(body.p_items)
      result = options.onRemove?.(body) ?? (() => {
        const ids = body.p_items.map(item => item.id)
        rows = rows.filter(item => !ids.includes(item.id))
        return { status: 200, json: ids }
      })()
    } else result = paged([])
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.json),
      headers: { 'access-control-expose-headers': 'content-range', ...result.headers } })
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  return { adds, removes }
}
async function treatsTab(page: Page) {
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Sugestões do catálogo' }).getByRole('article').first()).toBeVisible()
}
const suggestions = (page: Page) => page.getByRole('region', { name: 'Sugestões do catálogo' })
const listRegion = (page: Page) => page.getByRole('region', { name: 'Fraldas na lista' })
const fourDiapers = () => sizes.map((size, i) => row(diaperProduct(size), 6 + i, i + 1))
async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('sugestões: marcar vários mimos e adicionar de uma vez, com anúncio e foco no aviso', async ({ page }) => {
  const { adds } = await open(page)
  await treatsTab(page)
  const region = suggestions(page)
  const toggle = region.getByRole('button', { name: 'Selecionar sugestões' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(region.getByRole('button', { name: 'Cancelar seleção de sugestões' })).toHaveAttribute('aria-pressed', 'true')
  const bar = page.getByRole('region', { name: 'Seleção de sugestões' })
  await expect(bar).toContainText('Nenhum selecionado')
  await expect(bar.getByRole('button', { name: 'Adicionar selecionados' })).toBeDisabled()
  // A caixa toma o lugar do "Adicionar" da linha, com o nome do mimo.
  await expect(region.getByRole('button', { name: /^Adicionar .* à lista$/ })).toHaveCount(0)
  await region.getByRole('checkbox', { name: 'Selecionar Babador fictício' }).check()
  await region.getByRole('checkbox', { name: 'Selecionar Toalha fictícia' }).check()
  await expect(bar).toContainText('2 selecionados')
  const all = bar.getByRole('checkbox', { name: 'Selecionar todos' })
  expect(await all.evaluate(el => (el as HTMLInputElement).indeterminate)).toBe(true)
  await expectAccessible(page)
  await bar.getByRole('button', { name: 'Adicionar selecionados' }).click()
  expect(adds).toEqual([[{ product_id: treats[0].id, quantity: null }, { product_id: treats[2].id, quantity: null }]])
  await expect(region.getByRole('status').filter({ hasText: 'entraram na lista' })).toHaveText('“Babador fictício” e “Toalha fictícia” entraram na lista.')
  await expect(region.getByRole('status').filter({ hasText: 'entraram na lista' })).toBeFocused()
  await expect(bar).toHaveCount(0)
  await expect(region.getByRole('article')).toHaveCount(2)
})

test('sugestões de fralda: cada uma com os pacotes da linha; o atalho sai durante a seleção', async ({ page }) => {
  const { adds } = await open(page)
  const region = suggestions(page)
  await expect(region.getByRole('button', { name: 'Adicionar todos os tamanhos' })).toBeVisible()
  await region.getByRole('button', { name: 'Selecionar sugestões' }).click()
  await expect(region.getByRole('button', { name: 'Adicionar todos os tamanhos' })).toHaveCount(0)
  await page.getByRole('spinbutton', { name: 'Pacotes de Fraldas tamanho P' }).fill('5')
  await region.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho P' }).check()
  await region.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho G' }).check()
  // Enter no campo não inclui a linha sozinha durante a seleção.
  await page.getByRole('spinbutton', { name: 'Pacotes de Fraldas tamanho P' }).press('Enter')
  expect(adds).toEqual([])
  await page.getByRole('region', { name: 'Seleção de sugestões' }).getByRole('button', { name: 'Adicionar selecionados' }).click()
  expect(adds).toEqual([[{ product_id: diaperProduct('P').id, quantity: 5 }, { product_id: diaperProduct('G').id, quantity: 1 }]])
  await expect(region.getByRole('status').filter({ hasText: 'Tamanhos P e G entraram na lista.' })).toBeFocused()
})

test('sugestões: recusa do servidor diz que nada entrou e mantém a seleção', async ({ page }) => {
  await open(page, { onAdd: () => ({ status: 400, json: { message: 'PRODUCT_UNAVAILABLE', code: 'P0001' } }) })
  await treatsTab(page)
  const region = suggestions(page)
  await region.getByRole('button', { name: 'Selecionar sugestões' }).click()
  const bar = page.getByRole('region', { name: 'Seleção de sugestões' })
  await bar.getByRole('checkbox', { name: 'Selecionar todos' }).check()
  await expect(bar).toContainText('4 selecionados')
  const action = bar.getByRole('button', { name: 'Adicionar selecionados' })
  await action.click()
  await expect(bar.getByRole('alert')).toHaveText('Este produto não está mais disponível no catálogo.')
  await expect(action).toBeFocused()
  await expect(bar).toContainText('4 selecionados')
  await expect(region.getByRole('article')).toHaveCount(4)
})

test('lista: marcar vários e remover de uma vez, com confirmação e versão de cada item', async ({ page }) => {
  const rows = fourDiapers()
  const { removes } = await open(page, { rows })
  const list = listRegion(page)
  await expect(list.getByRole('article')).toHaveCount(4)
  await list.getByRole('button', { name: 'Selecionar itens' }).click()
  const bar = page.getByRole('region', { name: 'Seleção de itens da lista' })
  // A caixa toma o lugar do remover da linha.
  await expect(list.getByRole('button', { name: /^Remover da lista:/ })).toHaveCount(0)
  await list.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho M' }).check()
  await list.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho XG' }).check()
  await expect(bar).toContainText('2 selecionados')
  await bar.getByRole('button', { name: 'Remover selecionados' }).click()
  const question = bar.getByText('Remover 2 itens da lista?')
  await expect(question).toBeFocused()
  await expect(question).toContainText('Os convidados deixam de ver estes presentes.')
  await expect(bar.getByRole('button', { name: 'Remover selecionados' })).toHaveAttribute('aria-expanded', 'true')
  await expectAccessible(page)
  await bar.getByRole('button', { name: 'Sim, remover 2 itens' }).click()
  expect(removes).toEqual([[{ id: rows[1].id, version: 2 }, { id: rows[3].id, version: 2 }]])
  const notice = list.getByRole('status').filter({ hasText: 'saíram da lista' })
  await expect(notice).toHaveText('“Fraldas tamanho M” e “Fraldas tamanho XG” saíram da lista.')
  await expect(notice).toBeFocused()
  await expect(list.getByRole('article')).toHaveCount(2)
  await expect(bar).toHaveCount(0)
})

test('lista: reserva ativa recusa o lote inteiro e diz qual item, sem remover nada', async ({ page }) => {
  const rows = fourDiapers()
  const { removes } = await open(page, { rows, onRemove: () => ({ status: 400, json: { message: 'ITEM_HAS_RESERVATIONS', code: 'P0001', details: rows[1].id } }) })
  const list = listRegion(page)
  await list.getByRole('button', { name: 'Selecionar itens' }).click()
  const bar = page.getByRole('region', { name: 'Seleção de itens da lista' })
  await bar.getByRole('checkbox', { name: 'Selecionar todos' }).check()
  await bar.getByRole('button', { name: 'Remover selecionados' }).click()
  const confirm = bar.getByRole('button', { name: 'Sim, remover 4 itens' })
  await confirm.click()
  await expect(bar.getByRole('alert')).toHaveText('Nada saiu da lista: um convidado já escolheu “Fraldas tamanho M”. Desmarque esse item para remover os outros.')
  await expect(confirm).toBeFocused()
  await expect(list.getByRole('article')).toHaveCount(4)
  expect(removes).toHaveLength(1)
  await expectAccessible(page)
  // Desmarcar o item travado fecha a confirmação e tira o aviso, para conferir de novo.
  await list.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho M' }).uncheck()
  await expect(bar.getByRole('alert')).toHaveCount(0)
  await expect(bar).toContainText('3 selecionados')
})

test('lista offline: mesmo aviso "Sem conexão", sem chamar o servidor', async ({ page }) => {
  const { removes } = await open(page, { rows: fourDiapers() })
  const list = listRegion(page)
  await list.getByRole('button', { name: 'Selecionar itens' }).click()
  const bar = page.getByRole('region', { name: 'Seleção de itens da lista' })
  await list.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho P' }).check()
  await bar.getByRole('button', { name: 'Remover selecionados' }).click()
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await bar.getByRole('button', { name: 'Sim, remover 1 item' }).click()
  await expect(bar.getByRole('alert')).toContainText('Sem conexão. Esta alteração não foi enviada')
  expect(removes).toHaveLength(0)
})

test('pelo teclado: selecionar, marcar com Espaço e confirmar a remoção', async ({ page }) => {
  const { removes } = await open(page, { rows: fourDiapers() })
  const list = listRegion(page)
  const toggle = list.getByRole('button', { name: 'Selecionar itens' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  const box = list.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho G' })
  await tabTo(page, box, 40)
  await page.keyboard.press('Space')
  await expect(box).toBeChecked()
  const bar = page.getByRole('region', { name: 'Seleção de itens da lista' })
  await bar.getByRole('button', { name: 'Remover selecionados' }).focus()
  await page.keyboard.press('Enter')
  await expect(bar.getByText('Remover 1 item da lista?')).toBeFocused()
  await tabTo(page, bar.getByRole('button', { name: 'Sim, remover 1 item' }), 3)
  await page.keyboard.press('Enter')
  await expect(list.getByRole('status').filter({ hasText: 'saiu da lista' })).toBeFocused()
  expect(removes).toHaveLength(1)
})

test('lista com um item só: sem "Selecionar", o remover da linha basta', async ({ page }) => {
  await open(page, { rows: [row(diaperProduct('P'), 6, 1)] })
  await expect(listRegion(page).getByRole('article')).toHaveCount(1)
  await expect(listRegion(page).getByRole('button', { name: 'Selecionar itens' })).toHaveCount(0)
})

for (const width of [320, 1280]) {
  test(`seleção em ${width} px com texto a 200%: barra e confirmação cabem e os alvos têm 44 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, { rows: fourDiapers() })
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const list = listRegion(page)
    await list.getByRole('button', { name: 'Selecionar itens' }).click()
    const bar = page.getByRole('region', { name: 'Seleção de itens da lista' })
    await list.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho P' }).check()
    await bar.getByRole('button', { name: 'Remover selecionados' }).click()
    for (const target of [bar.getByText('Selecionar todos'), bar.getByRole('button', { name: 'Remover selecionados' }), bar.getByRole('button', { name: 'Sim, remover 1 item' }),
      bar.getByRole('button', { name: 'Cancelar', exact: true }), list.getByRole('button', { name: 'Cancelar seleção de itens' }),
      list.locator('label').filter({ has: page.getByRole('checkbox', { name: 'Selecionar Fraldas tamanho M' }) })]) {
      const box = (await target.boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    await expectAccessible(page)
    await bar.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/lista-selecao-${width}-${test.info().project.name}.png` })
    // Sugestões em seleção também cabem.
    await treatsTab(page)
    await suggestions(page).getByRole('button', { name: 'Selecionar sugestões' }).click()
    await suggestions(page).getByRole('checkbox', { name: 'Selecionar Manta fictícia' }).check()
    await expectAccessible(page)
    await page.getByRole('region', { name: 'Seleção de sugestões' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/sugestoes-selecao-${width}-${test.info().project.name}.png` })
  })
}
