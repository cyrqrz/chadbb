import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { GuestItem, Snapshot } from '../../src/features/guests/api'

// Convite com a função `guest` simulada e dados fictícios. As regras de saldo e
// versão são testadas no banco; aqui só a apresentação de cada estado.
const token = 'a'.repeat(64)
function snapshot(items: GuestItem[]): Snapshot {
  return {
    invitation: { name: 'Convidado fictício', kind: 'family', capacity: 3, response: 'pending', attending: 0, version: 1 },
    event: { id: '60000000-0000-4000-8000-000000000006', title: 'Chá de teste', description: 'Texto fictício.', starts_at: '2035-09-10T17:30:00Z',
      address: 'Endereço fictício', instructions: '', cover_path: null, status: 'published' },
    items,
  }
}
const diaper: GuestItem = { id: '70000000-0000-4000-8000-000000000007', title: 'Fraldas tamanho P', description: 'Pacote fictício.',
  category: 'fralda', diaper_size: 'P', limit: 6, committed: 0, own: null }

async function backend(page: Page, options: { items?: GuestItem[]; failReads?: () => boolean } = {}) {
  let current = snapshot(options.items ?? [diaper])
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const body = route.request().postDataJSON()
    const reply = (status: number, json: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    if (body.action === 'exchange') return reply(200, { session_token: 'fake-guest-session', snapshot: current })
    if (body.action === 'read') return options.failReads?.() ? reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) : reply(200, { snapshot: current })
    const { item_id: id, quantity } = body.payload
    const change = (item: GuestItem): GuestItem => {
      if (item.id !== id) return item
      if (body.action === 'reserve') return { ...item, committed: quantity, own: { id: 'r1', quantity, version: 1, status: 'reserved' } }
      if (body.action === 'purchase') return { ...item, own: { ...item.own!, version: 2, status: 'purchase_declared' } }
      return { ...item, committed: 0, own: { ...item.own!, version: 3, status: 'cancelled' } }
    }
    current = { ...current, items: current.items.map(change) }
    return reply(200, { snapshot: current })
  })
}
async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('reserva, compra informada e cancelamento com uma ação principal por etapa', async ({ page }) => {
  await backend(page)
  await page.goto(`/convite#${token}`)
  await expect(page.getByRole('button', { name: 'Confirmar presença' })).toBeVisible()
  await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
  await card.getByRole('spinbutton').fill('2')
  await card.getByRole('button', { name: 'Escolher presente' }).click()
  await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
  await card.getByRole('spinbutton').fill('3')
  await card.getByRole('button', { name: 'Atualizar minha escolha' }).click()
  await expect(page.getByRole('status')).toHaveText('Escolha atualizada.')
  const purchase = card.getByRole('button', { name: 'Já comprei' })
  await expect(purchase).toHaveAccessibleDescription(/só avisa a organização/)
  await expectAccessible(page)
  await purchase.click()
  await expect(page.getByRole('status')).toHaveText('Compra informada. A organização vai ver o aviso.')
  await expect(card.getByText('Compra informada por você.', { exact: false })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Já comprei' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Cancelar reserva' }).click()
  await expect(page.getByRole('status')).toHaveText('Reserva cancelada.')
  await expect(card.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
})

test('lista vazia e falha de atualização têm estado próprio', async ({ page }) => {
  let failing = false
  await backend(page, { failReads: () => failing })
  await page.goto(`/convite#${token}`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  await expect(page.getByText('A organização está preparando esta lista.')).toBeVisible()
  failing = true
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Os dados abaixo são da última consulta.', { timeout: 15_000 })
  await expectAccessible(page)
  failing = false
  await alert.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(alert).toHaveCount(0)
})

test('link inválido explica como recuperar o acesso', async ({ page }) => {
  await backend(page)
  await page.goto('/convite#invalido')
  await expect(page.getByRole('heading', { name: 'Vamos recuperar seu acesso' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Reabra o convite original')
  await expectAccessible(page)
})
