import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import { session, userId } from './session'

// QA da refatoração da Lista de mimos do organizador: o que os testes da mudança não
// cobriram — a linha de fralda (stepper + "Atualizar quantidade" + remover na mesma
// linha), evento encerrado, paginação, carregando, erro, 320 px com texto a 200% e a
// contagem do cabeçalho depois de remover e de adicionar.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

type Size = 'P' | 'M' | 'G' | 'XG'
const sizes: Size[] = ['P', 'M', 'G', 'XG']
function diaper(n: number, size: Size, quantity: number) {
  const product = { id: `82000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, title: `Fraldas tamanho ${size}`, description: '',
    platform: 'manual', category: 'fralda', diaper_size: size, active: true, event_id: null }
  return { id: `92000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, event_id: eventId, product_id: product.id,
    quantity_requested: quantity, category: 'fralda', diaper_size: size, version: 1, product }
}
function treat(n: number, title: string) {
  const product = { id: `83000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, title, description: '',
    platform: 'manual', category: 'mimo', diaper_size: null, active: true, event_id: null }
  return { id: `93000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, event_id: eventId, product_id: product.id,
    quantity_requested: null, category: 'mimo', diaper_size: null, version: 1, product }
}
const fourSizes = sizes.map((size, i) => diaper(i + 1, size, 6 + i))

type Rows = Record<string, unknown>[]
type Options = {
  status?: EventRecord['status']
  diapers?: () => Rows | { status: number }
  treats?: () => Rows
  catalog?: () => Rows
  onAdd?: () => void
  onRemove?: () => void
  delayItems?: number
}
// Backend simulado da tela de presentes. A lista vem recortada por offset/limit, como
// o PostgREST recebe da consulta, e o content-range traz o total da categoria.
async function open(page: Page, options: Options = {}) {
  const { status = 'published', diapers = () => fourSizes, treats = () => [], catalog = () => [], onAdd, onRemove, delayItems = 0 } = options
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let result: { status: number; json: unknown; headers?: Record<string, string> }
    if (path === '/auth/v1/user') result = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') result = { status: 200, json: [{ ...event, status }] }
    else if (path === '/rest/v1/rpc/add_event_item') { onAdd?.(); result = { status: 200, json: { id: 'novo', event_id: eventId, version: 1 } } }
    else if (path === '/rest/v1/rpc/remove_event_item') { onRemove?.(); result = { status: 200, json: {} } }
    else if (path === '/rest/v1/products') {
      const list = catalog()
      result = { status: 200, json: list, headers: { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' } }
    } else if (path === '/rest/v1/event_items') {
      const answer = url.searchParams.get('category') === 'eq.mimo' ? treats() : diapers()
      if (!Array.isArray(answer)) result = { status: answer.status, json: { message: 'unavailable' } }
      else {
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? answer.length)
        const slice = answer.slice(offset, offset + limit)
        result = { status: 200, json: slice, headers: { 'content-range': slice.length ? `${offset}-${offset + slice.length - 1}/${answer.length}` : `*/${answer.length}` } }
      }
      if (delayItems) await new Promise(resolve => setTimeout(resolve, delayItems))
    } else result = { status: 200, json: [], headers: { 'content-range': '*/0' } }
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.json),
      headers: { 'access-control-expose-headers': 'content-range', ...result.headers } })
  })
  await page.goto(`/eventos/${eventId}/presentes`)
}
const diapersRegion = (page: Page) => page.getByRole('region', { name: 'Fraldas na lista' })
async function box(node: Locator) {
  const value = await node.boundingBox()
  if (!value) throw new Error('elemento sem caixa')
  return value
}
// Percurso do Tab a partir de um controle, com a posição de cada parada na tela.
async function tabPath(page: Page, start: Locator, steps: number) {
  await start.focus()
  const path: { name: string; top: number; bottom: number; left: number }[] = []
  for (let i = 0; i < steps; i++) {
    path.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const rect = el.getBoundingClientRect()
      const name = el.tagName === 'INPUT' ? 'campo de quantidade' : el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName
      return { name, top: Math.round(rect.top + window.scrollY), bottom: Math.round(rect.bottom + window.scrollY), left: Math.round(rect.left) }
    }))
    await page.keyboard.press('Tab')
  }
  return path
}
// Paradas que sobem na tela: controles na mesma faixa podem ter alturas diferentes, e
// só conta como volta quando a parada seguinte fica inteiramente acima da anterior —
// o sintoma de ordem de DOM diferente da ordem visual (WCAG 2.4.3).
function backwards(path: { name: string; top: number; bottom: number }[]) {
  return path.flatMap((stop, i) => i > 0 && stop.bottom <= path[i - 1].top ? [`${path[i - 1].name} → ${stop.name}`] : [])
}

// Regressão: com a fralda a linha tem stepper, "Atualizar quantidade" e o remover. Em
// tela estreita a quantidade desce para a segunda faixa; se o remover ficasse ao lado
// do nome, o Tab subiria de volta depois de "Atualizar quantidade".
test('fralda em tela estreita: o Tab desce, nunca volta para cima', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await open(page)
  const region = diapersRegion(page)
  await expect(region.getByRole('article')).toHaveCount(4)
  // Percurso das quatro linhas inteiras: dentro de cada uma e na passagem para a seguinte.
  const path = await tabPath(page, region.getByRole('button', { name: 'Diminuir pacotes' }).first(), 17)
  expect(backwards(path), `percurso: ${path.map(s => `${s.name}@${s.top}`).join(' → ')}`).toEqual([])
  // O remover continua na linha do item, depois de "Atualizar quantidade".
  expect(path.map(stop => stop.name).slice(0, 5)).toEqual(['Diminuir pacotes', 'campo de quantidade', 'Aumentar pacotes',
    'Atualizar quantidade', 'Remover da lista: Fraldas tamanho P'])
})

test('fralda em tela larga: tudo numa faixa só, com o remover no fim e o Tab em ordem', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, { diapers: () => [diaper(1, 'P', 6), diaper(2, 'M', 7)] })
  const region = diapersRegion(page)
  const name = await box(region.getByRole('heading', { name: 'Fraldas tamanho P' }))
  const form = await box(region.getByRole('button', { name: 'Atualizar quantidade' }).first())
  const remove = await box(region.getByRole('button', { name: 'Remover da lista: Fraldas tamanho P' }))
  expect(form.y).toBeLessThan(name.y + name.height)
  expect(remove.x).toBeGreaterThan(form.x + form.width - 1)
  expect(remove.y).toBeLessThan(name.y + name.height)
  // Nenhuma sobreposição entre o nome e o formulário da grade.
  expect(name.x + name.width).toBeLessThanOrEqual(form.x + 1)
  const path = await tabPath(page, region.getByRole('button', { name: 'Diminuir pacotes' }).first(), 9)
  expect(backwards(path), `percurso: ${path.map(s => `${s.name}@${s.top}`).join(' → ')}`).toEqual([])
})

test('fralda a 320 px com texto a 200%: sem rolagem lateral e com alvos de 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await open(page)
  const region = diapersRegion(page)
  await expect(region.getByRole('article')).toHaveCount(4)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const remove = region.getByRole('button', { name: 'Remover da lista: Fraldas tamanho P' })
  const target = await box(remove)
  expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44)
  // O remover não monta em cima do "Atualizar quantidade" da mesma linha.
  const update = await box(region.getByRole('button', { name: 'Atualizar quantidade' }).first())
  expect(update.x + update.width).toBeLessThanOrEqual(target.x + 1)
  await expectAccessible(page)
})

// Quatro tamanhos com a confirmação aberta: a pergunta e os botões ficam dentro da
// própria linha e o Tab continua dali para a linha seguinte.
test('confirmação de remoção da fralda não invade a linha de baixo', async ({ page }) => {
  await open(page)
  const region = diapersRegion(page)
  const rows = region.locator('ul.item-rows > li')
  await expect(rows).toHaveCount(4)
  const m = region.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho M' }) })
  await m.getByRole('button', { name: 'Remover da lista: Fraldas tamanho M' }).click()
  const question = m.getByText('Remover “Fraldas tamanho M” da lista?')
  await expect(question).toBeFocused()
  const inside = await question.evaluate(el => {
    const li = document.querySelectorAll('ul.item-rows > li')[1].getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return rect.top >= li.top - 0.5 && rect.bottom <= li.bottom + 0.5
  })
  expect(inside).toBe(true)
  // A pergunta diz o que acontece com quem já escolheu o presente.
  await expect(question).toContainText('Os convidados deixam de ver este presente')
  await expect(m.getByRole('button', { name: 'Remover', exact: true })).toBeVisible()
  await expectAccessible(page)
})

test('evento encerrado: sem remover, sem atalho de adicionar e com a contagem', async ({ page }) => {
  await open(page, { status: 'closed' })
  const region = diapersRegion(page)
  await expect(region.getByText('4 itens', { exact: true })).toBeVisible()
  await expect(region.getByRole('link', { name: 'Adicionar à lista' })).toHaveCount(0)
  await expect(region.getByRole('button', { name: /^Remover da lista/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Adicionar à lista' })).toHaveCount(0)
  // Nenhum link apontando para uma âncora que não existe mais na página.
  expect(await page.locator('a[href="#adicionar"]').count()).toBe(0)
  await expectAccessible(page)
})

test('lista com mais de uma página: a contagem é o total do servidor', async ({ page }) => {
  const many = Array.from({ length: 15 }, (_, i) => treat(i + 1, `Mimo fictício ${i + 1}`))
  await open(page, { diapers: () => [], treats: () => many })
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const region = page.getByRole('region', { name: 'Mimos na lista' })
  await expect(region.getByText('15 itens', { exact: true })).toBeVisible()
  await expect(region.locator('ul.item-rows > li')).toHaveCount(12)
  await page.getByRole('navigation', { name: 'Paginação da lista' }).getByRole('button', { name: 'Próxima' }).click()
  await expect(region.locator('ul.item-rows > li')).toHaveCount(3)
  // A contagem continua sendo o total da categoria, e não o tamanho da página.
  await expect(region.getByText('15 itens', { exact: true })).toBeVisible()
  await expect(region.getByRole('button', { name: 'Remover da lista: Mimo fictício 13' })).toBeVisible()
})

test('lista carregando: esqueleto no lugar das linhas, sem contagem inventada', async ({ page }) => {
  await open(page, { delayItems: 1500 })
  const region = diapersRegion(page)
  await expect(region.getByText('Carregando a lista…')).toBeVisible()
  await expect(region.locator('.skeleton').first()).toBeVisible()
  // O esqueleto é desenho: o leitor de tela não recebe linhas falsas.
  await expect(region.locator('ul[aria-hidden="true"]')).toHaveCount(1)
  await expect(region.locator('.list-count')).toHaveCount(0)
  await expect(region.getByRole('article')).toHaveCount(0)
  await expectAccessible(page)
  await expect(region.getByRole('article')).toHaveCount(4)
  await expect(region.locator('.skeleton')).toHaveCount(0)
  await expect(region.getByText('4 itens', { exact: true })).toBeVisible()
})

test('lista fora do ar: erro com saída, sem contagem, e recuperação', async ({ page }) => {
  let failing = true
  await open(page, { diapers: () => (failing ? { status: 500 } : fourSizes) })
  const region = diapersRegion(page)
  await expect(region.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  await expect(region.getByText('Não foi possível concluir. Confira sua conexão e tente novamente.')).toBeVisible()
  await expect(region.locator('.list-count')).toHaveCount(0)
  // O atalho de adicionar continua: a falha é da leitura da lista, não do catálogo.
  await expect(region.getByRole('link', { name: 'Adicionar à lista' })).toBeVisible()
  await expectAccessible(page)
  failing = false
  await region.getByRole('button', { name: 'Recarregar lista' }).click()
  await expect(region.getByRole('article')).toHaveCount(4)
  await expect(region.getByText('4 itens', { exact: true })).toBeVisible()
})

test('depois de remover, a contagem do cabeçalho acompanha a lista', async ({ page }) => {
  let rows = [treat(1, 'Mimo fictício 1'), treat(2, 'Mimo fictício 2'), treat(3, 'Mimo fictício 3')]
  await open(page, { diapers: () => [], treats: () => rows, onRemove: () => { rows = rows.slice(1) } })
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const region = page.getByRole('region', { name: 'Mimos na lista' })
  await expect(region.getByText('3 itens', { exact: true })).toBeVisible()
  await region.getByRole('button', { name: 'Remover da lista: Mimo fictício 1' }).click()
  await region.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(region.getByText('“Mimo fictício 1” saiu da lista.')).toBeVisible()
  await expect(region.locator('ul.item-rows > li')).toHaveCount(2)
  await expect(region.getByText('2 itens', { exact: true })).toBeVisible()
})

test('o atalho leva ao catálogo pelo teclado e a contagem acompanha o que entra', async ({ page }) => {
  const novo = treat(9, 'Mimo fictício 9')
  let rows = [treat(1, 'Mimo fictício 1')]
  await open(page, { diapers: () => [], treats: () => rows, catalog: () => [novo.product], onAdd: () => { rows = [...rows, novo] } })
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const region = page.getByRole('region', { name: 'Mimos na lista' })
  await expect(region.getByText('1 item', { exact: true })).toBeVisible()
  // Pelo teclado: o atalho do cabeçalho leva o foco para a seção de adicionar.
  await region.getByRole('link', { name: 'Adicionar à lista' }).focus()
  await page.keyboard.press('Enter')
  const catalog = page.getByRole('region', { name: 'Adicionar à lista' })
  await expect(catalog).toBeFocused()
  await catalog.getByRole('button', { name: 'Adicionar Mimo fictício 9 à lista' }).click()
  await expect(catalog.getByText('“Mimo fictício 9” entrou na lista.')).toBeVisible()
  // A contagem do cabeçalho vem do servidor e acompanha a inclusão.
  await expect(region.getByText('2 itens', { exact: true })).toBeVisible()
  await expect(region.getByRole('button', { name: 'Remover da lista: Mimo fictício 9' })).toBeVisible()
})

// A linha inteira muda de fundo ao passar o mouse, mas a linha não é clicável: no
// toque o :hover gruda depois do toque e a linha fica destacada como se estivesse
// selecionada. O realce só vale onde há mouse, como no .step-card.
test('o realce da linha é só para quem usa mouse', async ({ page }) => {
  await open(page, { diapers: () => [], treats: () => [treat(1, 'Mimo fictício 1')] })
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const row = page.getByRole('region', { name: 'Mimos na lista' }).locator('ul.item-rows > li').first()
  await expect(row).toBeVisible()
  const background = () => row.evaluate(node => getComputedStyle(node).backgroundColor)
  const mouse = await page.evaluate(() => matchMedia('(hover: hover)').matches)
  const rest = await background()
  await row.hover()
  // O navegador só aplica o :hover no hit-test do quadro seguinte ao movimento do
  // ponteiro. Ler o estilo logo depois do hover() corre com esse recálculo e, sob
  // carga, pega a cor de repouso — daí esperar em vez de medir uma vez só.
  if (mouse) await expect.poll(background, { timeout: 5000 }).not.toBe(rest)
  else {
    // Sem mouse não há o que esperar, mas o realce também não pode aparecer num
    // quadro seguinte: dá dois quadros de folga antes de afirmar que não veio.
    await row.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
    expect(await background()).toBe(rest)
  }
  // Nada de clicável na linha além do botão: ela não é link nem tem onClick.
  expect(await row.evaluate(node => node.querySelector('a,[role="button"],[onclick]') !== null)).toBe(false)
})

async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
