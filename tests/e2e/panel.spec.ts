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

type Reply = () => { status: number; json: unknown }
async function backend(page: Page, dashboard: Reply, events: Reply = () => ({ status: 200, json: [event] })) {
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname
    let result: { status: number; json: unknown } = { status: 500, json: { message: 'Unexpected test request' } }
    if (path === '/auth/v1/user') result = { status: 200, json: session().user }
    else if (path === '/rest/v1/events') result = events()
    else if (path === '/rest/v1/rpc/organizer_invitations') result = dashboard()
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.json), })
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
