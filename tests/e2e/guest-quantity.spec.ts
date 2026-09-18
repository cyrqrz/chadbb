// Quantidade no convite: bloqueio durante o envio e versão do rascunho
// diante de mudança concorrente (revisão do Codex, 2026-09-17).
import { expect, test } from '@playwright/test'
import type { Snapshot } from '../../src/features/guests/api'

// O convite carrega o mapa do Google em iframe: nos testes ele é simulado, sem rede externa.
test.beforeEach(async ({ page }) => {
  await page.route('https://www.google.com/maps**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mapa simulado</title>' }))
})

const token = 'b'.repeat(64)
const makeSnapshot = (version: number | null): Snapshot => ({
  invitation: { name: 'Pessoa fictícia', kind: 'individual', capacity: 1, response: 'pending', attending: 0, version: 1 },
  event: { id: '60000000-0000-4000-8000-000000000006', title: 'Evento fictício', description: '', starts_at: '2035-09-10T17:30:00Z', address: '', instructions: '', cover_path: null, status: 'published' },
  items: [{ id: '70000000-0000-4000-8000-000000000007', title: 'Fralda fictícia P', description: '', category: 'fralda', diaper_size: 'P', limit: 10, committed: version === null ? 0 : 1,
    own: version === null ? null : { id: 'r1', quantity: 1, version, status: 'reserved' } }],
})

test('quantidade fica bloqueada enquanto a reserva é enviada', async ({ page }) => {
  let current = makeSnapshot(null)
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  let received!: () => void
  const sent = new Promise<void>(resolve => { received = resolve })
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const body = route.request().postDataJSON()
    if (body.action === 'reserve') {
      received()
      await hold
      current = makeSnapshot(1)
      current.items[0].committed = body.payload.quantity
      current.items[0].own!.quantity = body.payload.quantity
    }
    await route.fulfill({ json: { session_token: 'fake-session', snapshot: current } })
  })
  await page.goto(`/convite#${token}`)
  const input = page.getByRole('spinbutton')
  await input.fill('2')
  await page.getByRole('button', { name: 'Escolher presente' }).click()
  await sent
  try {
    await expect(input).toBeDisabled({ timeout: 1500 })
    await expect(page.getByRole('button', { name: 'Aumentar pacotes' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Diminuir pacotes' })).toBeDisabled()
  } finally { release() }
  await expect(input).toBeEnabled()
  await expect(input).toHaveValue('2')
})

test('Enter no campo de quantidade mantém o foco no campo durante e depois do envio', async ({ page }) => {
  let current = makeSnapshot(null)
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  let received!: () => void
  const sent = new Promise<void>(resolve => { received = resolve })
  let reserves = 0
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const body = route.request().postDataJSON()
    if (body.action === 'reserve') {
      reserves += 1
      received()
      await hold
      current = makeSnapshot(1)
      current.items[0].committed = body.payload.quantity
      current.items[0].own!.quantity = body.payload.quantity
    }
    await route.fulfill({ json: { session_token: 'fake-session', snapshot: current } })
  })
  await page.goto(`/convite#${token}`)
  const input = page.getByRole('spinbutton')
  await input.fill('2')
  await input.press('Enter')
  await sent
  try {
    // Indisponível para quem usa leitor de tela, mas sem soltar o foco.
    await expect(page.getByRole('button', { name: 'Escolher presente' })).toHaveAttribute('aria-disabled', 'true', { timeout: 1500 })
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('aria-disabled', 'true')
    // Enter repetido e digitação durante o envio não mudam nada.
    await input.press('Enter')
    await input.press('ArrowUp')
    await expect(input).toHaveValue('2')
  } finally { release() }
  await expect(page.getByRole('status').filter({ hasText: 'Presente reservado para você.' })).toBeVisible()
  await expect(input).not.toHaveAttribute('aria-disabled', 'true')
  await expect(input).toBeFocused()
  expect(reserves).toBe(1)
})

for (const initialVersion of [null, 1]) {
  test(`continuar digitando depois de mudança em outra sessão mantém a versão original (${initialVersion ?? 'sem reserva'})`, async ({ page }) => {
    let current = makeSnapshot(initialVersion)
    let submitted: { version: number | null } | undefined
    await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
      const body = route.request().postDataJSON()
      if (body.action === 'reserve') {
        submitted = body.payload
        return route.fulfill({ status: 409, json: { error: 'RESERVATION_VERSION_CONFLICT' } })
      }
      await route.fulfill({ json: { session_token: 'fake-session', snapshot: current } })
    })
    await page.goto(`/convite#${token}`)
    const input = page.getByRole('spinbutton')
    await input.fill('2')
    current = makeSnapshot(2)
    const conflict = page.getByRole('status').filter({ hasText: 'A escolha mudou em outra sessão.' })
    await expect(conflict).toBeVisible({ timeout: 15000 })
    await input.fill('3')
    await expect(conflict).toBeVisible({ timeout: 1500 })
    await page.getByRole('button', { name: 'Atualizar quantidade' }).click()
    await expect.poll(() => submitted?.version).toBe(initialVersion)
    await expect(input).toHaveValue('3')
    await page.getByRole('button', { name: 'Usar escolha atual' }).click()
    await expect(input).toHaveValue('1')
    await expect(conflict).toHaveCount(0)
  })
}
