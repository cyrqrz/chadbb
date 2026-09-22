import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import { session, userId } from './session'

// Refatoração da Lista de mimos: cabeçalho com contador e atalho para adicionar,
// linha compacta com o nome em primeiro plano e a remoção como ação discreta à direita.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const titles = ['Babadores', 'Cobertor', 'Almofada de amamentação', 'Manta', 'Pomada fictícia', 'Mamadeira fictícia',
  'Termômetro digital fictício de testa com visor grande', 'Toalha com capuz', 'Macacão de plush', 'Kit de higiene',
  'Chupeta de silicone', 'Livro de pano']
const treat = (n: number) => {
  const product = { id: `81000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, title: titles[n - 1], description: '',
    platform: 'manual', category: 'mimo', diaper_size: null, active: true, event_id: null }
  return { id: `91000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, event_id: eventId, product_id: product.id,
    quantity_requested: null, category: 'mimo', diaper_size: null, version: 1, product }
}

async function openTreats(page: Page, rows = titles.map((_, n) => treat(n + 1))) {
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const mimo = url.searchParams.get('category') === 'eq.mimo'
    let result: { status: number; json: unknown; headers?: Record<string, string> }
    if (path === '/auth/v1/user') result = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') result = { status: 200, json: [event] }
    else if (path === '/rest/v1/event_items') {
      const list = mimo || !url.searchParams.get('category') ? rows : []
      result = { status: 200, json: list, headers: { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' } }
    } else if (path === '/rest/v1/products') result = { status: 200, json: [], headers: { 'content-range': '*/0' } }
    else result = { status: 200, json: [], headers: { 'content-range': '*/0' } }
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.json),
      headers: { 'access-control-expose-headers': 'content-range', ...result.headers } })
  })
  await page.goto(`/eventos/${eventId}/presentes`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  return page.getByRole('region', { name: 'Mimos na lista' })
}

test('cabeçalho da lista mostra quantos itens existem e leva para adicionar', async ({ page }) => {
  const list = await openTreats(page)
  await expect(list.getByText('12 itens', { exact: true })).toBeVisible()
  const cta = list.getByRole('link', { name: 'Adicionar à lista' })
  await expect(cta).toBeVisible()
  const before = page.url()
  await cta.click()
  // O atalho leva o foco para a seção de adicionar, e não só a rolagem.
  await expect(page.getByRole('region', { name: 'Adicionar à lista' })).toBeFocused()
  // E não gasta uma volta do botão "voltar" do celular com `#adicionar`.
  expect(page.url()).toBe(before)
})

test('cada mimo é uma linha compacta: nome à esquerda, remover discreto à direita', async ({ page }) => {
  const list = await openTreats(page)
  const rows = list.locator('ul.item-rows > li')
  await expect(rows).toHaveCount(12)

  // O texto repetido saiu: sobra o nome, e a ação é um botão de ícone com nome acessível.
  await expect(list.getByText('Remover da lista', { exact: true })).toHaveCount(0)
  const remove = list.getByRole('button', { name: 'Remover da lista: Babadores' })
  await expect(remove).toHaveClass(/btn-icon/)
  // O `title` repete o nome acessível: textos diferentes fazem o leitor de tela ler os dois.
  await expect(remove).toHaveAttribute('title', 'Remover da lista: Babadores')

  const first = rows.first()
  const name = first.getByRole('heading', { name: 'Babadores' })
  const nameBox = (await name.boundingBox())!
  const removeBox = (await remove.boundingBox())!
  const rowBox = (await first.boundingBox())!
  // Mesma linha: o botão não desce para baixo do nome.
  expect(removeBox.y).toBeLessThan(nameBox.y + nameBox.height)
  expect(removeBox.x).toBeGreaterThan(nameBox.x + nameBox.width - 1)
  // Altura de linha administrativa, e não de cartão.
  expect(rowBox.height).toBeGreaterThanOrEqual(56)
  expect(rowBox.height).toBeLessThanOrEqual(72)
  // Alvo de toque confortável.
  expect(Math.min(removeBox.width, removeBox.height)).toBeGreaterThanOrEqual(44)

  // Em repouso a ação destrutiva não é vermelha; o destaque vem no hover.
  // `color` tem transição (`--duration-fast`), então a leitura precisa repetir:
  // uma só, logo depois do hover, às vezes pega a cor de repouso ainda.
  const rest = await remove.evaluate(el => getComputedStyle(el).color)
  await remove.hover()
  await expect(remove).not.toHaveCSS('color', rest)
})

test('remover continua pedindo confirmação na própria linha', async ({ page }) => {
  const list = await openTreats(page, [treat(1), treat(2)])
  const row = list.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Babadores' }) })
  await row.getByRole('button', { name: 'Remover da lista: Babadores' }).click()
  await expect(row.getByText('Remover “Babadores” da lista?')).toBeFocused()
  await row.getByRole('button', { name: 'Cancelar' }).click()
  await expect(row.getByRole('button', { name: 'Remover da lista: Babadores' })).toBeFocused()
})

test('lista de mimos vazia ensina o próximo passo', async ({ page }) => {
  const list = await openTreats(page, [])
  await expect(list.getByText('Nenhum mimo na lista.')).toBeVisible()
  await expect(list.getByRole('link', { name: 'Adicionar à lista' })).toHaveCount(1)
  await expect(list.locator('.list-count')).toHaveCount(0)
})

test('lista indisponível (503) mostra o erro sem prender o esqueleto', async ({ page }) => {
  // O postgrest-js repetia GET em 503 por conta própria (1 s + 2 s + 4 s) antes de
  // devolver o erro, e com a repetição do TanStack por cima a tela ficava ~15,7 s
  // em "Carregando a lista…". Com `db.retry: false` a única repetição é a visível.
  const attempts: number[] = []
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/auth/v1/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session().user) })
    if (path === '/rest/v1/events') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([event]) })
    // Só a leitura paginada da lista; `listedProducts` pede outras colunas.
    if (path === '/rest/v1/event_items' && url.searchParams.get('select')?.includes('product:products')) {
      attempts.push(Date.now())
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'no schema cache' }) })
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]',
      headers: { 'access-control-expose-headers': 'content-range', 'content-range': '*/0' } })
  })

  const start = Date.now()
  await page.goto(`/eventos/${eventId}/presentes`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  const list = page.getByRole('region', { name: 'Mimos na lista' })
  await expect(list.getByRole('button', { name: 'Recarregar lista' })).toBeVisible({ timeout: 8_000 })
  expect(Date.now() - start).toBeLessThan(8_000)
  await expect(list.getByText('Carregando a lista…')).toHaveCount(0)
  // Cada tentativa do TanStack custa uma chamada, e não as quatro do postgrest-js:
  // com a repetição da biblioteca ligada seriam 8 antes do erro aparecer.
  expect(attempts.length).toBeLessThanOrEqual(4)
})

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`lista de mimos cabe em ${width} px sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const list = await openTreats(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // Nome longo quebra em até duas linhas e nunca fica embaixo do botão.
    const long = list.getByRole('article').filter({ has: page.getByRole('heading', { name: titles[6] }) })
    const nameBox = (await long.getByRole('heading', { name: titles[6] }).boundingBox())!
    const removeBox = (await long.getByRole('button', { name: `Remover da lista: ${titles[6]}` }).boundingBox())!
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(removeBox.x + 1)
    const report = await new AxeBuilder({ page }).analyze()
    expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
    await page.screenshot({ path: `test-results/mimos-${width}-${test.info().project.name}.png`, fullPage: true })
  })
}
