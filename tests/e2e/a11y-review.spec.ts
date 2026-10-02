import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { rsvpFixture } from './rsvp-fixture'
import { session, userId } from './session'

// Revisão de acessibilidade de 02/10 (WCAG 2.2 AA): o que o axe não pega.
// 2.4.2 título por tela; 2.4.11 foco nunca escondido sob o cabeçalho fixo;
// 2.4.3 foco que não cai no início da página depois de "Já comprei" e "Cancelar reserva".
const eventId = '20000000-0000-4000-8000-000000000002'
const event = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste', public_description: '',
  private_address: 'Endereço fictício', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const dashboard = { rsvp: rsvpFixture, invitations: [], items: [], reservations: [],
  summary: { reminders: { pending: 0, attention: 0 }, invitations: { total: 0, answered: 0, yes: 0, no: 0, maybe: 0, pending: 0, revoked: 0 }, people_confirmed: 0 } }
const token = 'a'.repeat(64)
type Own = { id: string; quantity: number; version: number; status: string } | null

async function organizer(page: Page) {
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = path === '/auth/v1/user' ? session().user : path === '/rest/v1/events' ? [event] : path === '/rest/v1/rpc/organizer_invitations' ? dashboard : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json), headers: { 'access-control-expose-headers': 'content-range', 'content-range': '*/0' } })
  })
}
// Convidado com uma fralda já reservada: "Já comprei" e "Cancelar reserva" à vista.
async function guest(page: Page) {
  await page.route('https://www.google.com/maps**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mapa simulado</title>' }))
  let own: Own = { id: 'r1', quantity: 2, version: 1, status: 'reserved' }
  const snapshot = () => ({ rsvp: rsvpFixture, invitation: { name: 'Convidado fictício', kind: 'family', capacity: 3, response: 'yes', attending: 1, version: 1 },
    event: { id: eventId, title: 'Chá de teste', description: '', starts_at: '2035-09-10T17:30:00Z', address: 'Endereço fictício', instructions: '', cover_path: null, status: 'published' },
    items: [{ id: '70000000-0000-4000-8000-000000000007', title: 'Fraldas tamanho P', description: '', category: 'fralda', diaper_size: 'P', limit: 6,
      committed: own && own.status !== 'cancelled' ? own.quantity : 0, available: 6 - (own && own.status !== 'cancelled' ? own.quantity : 0), own }] })
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const { action } = route.request().postDataJSON()
    if (action === 'purchase' && own) own = { ...own, version: 2, status: 'purchase_declared' }
    if (action === 'cancel' && own) own = { ...own, version: 3, status: 'cancelled' }
    // Um respiro: o botão fica ocupado durante o envio, como na rede de verdade.
    if (action === 'purchase' || action === 'cancel') await new Promise(resolve => setTimeout(resolve, 300))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session_token: 'fake', snapshot: snapshot() }) })
  })
}

test('cada tela tem título próprio (2.4.2)', async ({ page }) => {
  await organizer(page)
  for (const [path, title] of [
    ['/eventos', 'Seus eventos · chadbb'],
    [`/eventos/${eventId}`, 'Painel · Chá de teste · chadbb'],
    [`/eventos/${eventId}/presentes`, 'Presentes · Chá de teste · chadbb'],
    [`/eventos/${eventId}/dados`, 'Dados do evento · Chá de teste · chadbb'],
    ['/privacidade', 'Privacidade e termos · chadbb'],
    ['/rota-inexistente', 'Página não encontrada · chadbb'],
    ['/', 'chadbb · Chá de bebê'],
  ]) {
    await page.goto(path)
    await expect(page).toHaveTitle(title)
  }
  // A troca de aba, sem recarregar, também troca o título.
  await page.goto(`/eventos/${eventId}`)
  await page.getByRole('navigation', { name: 'Áreas do evento' }).getByRole('link', { name: 'Presentes' }).click()
  await expect(page).toHaveTitle('Presentes · Chá de teste · chadbb')
})

test('título do login e do convite (2.4.2)', async ({ page }) => {
  await page.goto('/entrar')
  await expect(page).toHaveTitle('Entrar · chadbb')
  await guest(page)
  await page.goto(`/convite#${token}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Chá de teste' })).toBeVisible()
  await expect(page).toHaveTitle('Convite · Chá de teste · chadbb')
})

// O anterior fica logo acima do próximo, escondido pela faixa do cabeçalho fixo; Shift+Tab
// precisa trazê-lo para baixo do cabeçalho, e não deixá-lo coberto.
async function expectBackTabVisible(page: Page, target: Locator, next: Locator) {
  await next.focus()
  const header = page.locator('.site-header')
  const bottom = await header.evaluate(el => el.getBoundingClientRect().bottom)
  await next.evaluate((el, limit) => window.scrollBy({ top: el.getBoundingClientRect().top - limit - 2, behavior: 'instant' }), bottom)
  await page.keyboard.press('Shift+Tab')
  await expect(target).toBeFocused()
  const box = await target.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
  const headerBottom = await header.evaluate(el => el.getBoundingClientRect().bottom)
  expect(box.top, 'o controle focado começa abaixo do cabeçalho fixo').toBeGreaterThanOrEqual(headerBottom - 1)
}

for (const zoom of [false, true]) {
  test(`Shift+Tab não deixa o foco sob o cabeçalho fixo (2.4.11)${zoom ? ', 320 px com texto a 200%' : ''}`, async ({ page }) => {
    if (zoom) await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/')
    if (zoom) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const questions = page.locator('.faq-item > summary')
    await expect(questions.nth(2)).toBeVisible()
    await expectBackTabVisible(page, questions.nth(1), questions.nth(2))
  })
}

test('painel: Shift+Tab traz o controle para baixo do cabeçalho (2.4.11)', async ({ page }) => {
  await organizer(page)
  await page.goto(`/eventos/${eventId}/dados`)
  const name = page.getByLabel('Nome do evento')
  await expect(name).toHaveValue('Chá de teste')
  await expectBackTabVisible(page, name, page.getByLabel('Descrição pública', { exact: false }).first())
})

test('âncora da política começa abaixo do cabeçalho fixo (2.4.11)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('/privacidade#contato')
  const heading = page.locator('#contato')
  await expect(heading).toBeInViewport()
  const headerBottom = await page.locator('.site-header').evaluate(el => el.getBoundingClientRect().bottom)
  expect(await heading.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(headerBottom - 1)
})

test('convite: depois de "Já comprei" e de "Cancelar reserva", o foco vai para o aviso do cartão (2.4.3)', async ({ page }) => {
  await guest(page)
  await page.goto(`/convite#${token}`)
  await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
  const purchase = card.getByRole('button', { name: 'Já comprei' })
  await purchase.focus()
  await page.keyboard.press('Enter')
  // Durante o envio o foco fica no botão (aria-disabled), em vez de cair no <body>.
  await expect(purchase).toHaveAttribute('aria-disabled', 'true')
  await expect(purchase).toBeFocused()
  const purchased = card.getByRole('status').filter({ hasText: 'Compra informada' })
  await expect(purchased).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Compra informada')
  // O próximo Tab segue no cartão, e não no topo da página.
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: 'Cancelar reserva' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('status').filter({ hasText: 'Reserva cancelada' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Reserva cancelada')
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
})
