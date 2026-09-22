import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { EventRecord } from '../../src/features/events/model'
import type { Dashboard } from '../../src/features/guests/api'
import type { GuestItem, Snapshot } from '../../src/features/guests/api'
import { session, userId } from './session'

// G5.3: o banner global (Layout) e o aviso "antes de tentar salvar" nos pontos de
// gravação usam `navigator.onLine`; `context.setOffline` do Playwright zera esse
// valor e bloqueia a rede de verdade, então o teste também garante que nenhuma
// chamada chegou ao "servidor" enquanto offline.
const eventId = '20000000-0000-4000-8000-000000000002'
const event: EventRecord = { id: eventId, owner_id: userId, type: 'baby_shower', status: 'published', title: 'Chá de teste',
  public_description: '', private_address: '', private_instructions: '', starts_at: '2035-09-10T17:30:00Z', ends_at: '2035-09-10T21:00:00Z',
  personal_data_purged_at: null, guests_done_at: '2026-01-02T00:00:00Z', gifts_done_at: '2026-01-02T00:00:00Z', cover_path: null, version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

async function organizerBackend(page: Page) {
  const calls: string[] = []
  let record = event
  const dashboard: Dashboard = { invitations: [], items: [], reservations: [],
    summary: { invitations: { total: 0, answered: 0, yes: 0, no: 0, maybe: 0, pending: 0, revoked: 0 }, people_confirmed: 0 } }
  await page.addInitScript(value => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(value)), session())
  await page.route('https://e2e.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    calls.push(path)
    const body = route.request().postDataJSON() ?? {}
    let json: unknown = {}
    if (path === '/auth/v1/user') json = session().user
    else if (path === '/rest/v1/events') json = [record]
    else if (path === '/rest/v1/rpc/save_event') { record = { ...record, title: body.p_title, version: record.version + 1 }; json = record }
    else if (path === '/rest/v1/rpc/organizer_invitations') json = body.p_action === 'create' ? { id: 'novo', token: 'token-ficticio' } : dashboard
    else if (['/rest/v1/event_items', '/rest/v1/products'].includes(path)) { json = []; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json), headers: { 'content-range': '0-0/1' } })
  })
  return { calls }
}

// `context.setOffline` derruba de verdade a rede, inclusive o WebSocket de HMR do
// servidor de dev usado nos testes — o que pode recarregar a página fora do controle
// do teste. Para testar só o hook/banner, o `navigator.onLine` é simulado direto.
async function setNavigatorOnline(page: Page, online: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  }, online)
}

test('banner de "sem conexão" aparece e some com o navegador', async ({ page }) => {
  await page.goto('/amostras')
  // Espera o conteúdo real (depois do fallback do Suspense da rota) para o Layout já
  // ter montado o listener antes do evento ser disparado.
  await expect(page.getByRole('heading', { name: 'Amostras do sistema visual' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0)
  await setNavigatorOnline(page, false)
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toBeVisible()
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  await setNavigatorOnline(page, true)
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0)
})

test('salvar dados do evento offline avisa sem chamar o servidor', async ({ page, context }) => {
  const mock = await organizerBackend(page)
  await page.goto(`/eventos/${eventId}/dados`)
  await expect(page.getByLabel('Nome do evento')).toHaveValue('Chá de teste')
  await context.setOffline(true)
  await page.getByLabel('Nome do evento').fill('Chá de teste — offline')
  const before = mock.calls.length
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('alert')).toContainText('Sem conexão')
  expect(mock.calls.filter(path => path === '/rest/v1/rpc/save_event')).toHaveLength(0)
  expect(mock.calls.length).toBe(before)
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Alterações salvas.' })).toBeVisible()
})

test('criar convite offline avisa sem chamar o servidor', async ({ page, context }) => {
  const mock = await organizerBackend(page)
  await page.goto(`/eventos/${eventId}`)
  await expect(page.getByRole('heading', { name: 'Convidados', exact: true })).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Convidar alguém' }).click()
  await page.getByLabel('Nome da pessoa ou família').fill('Convidado offline')
  const before = mock.calls.length
  await page.getByRole('button', { name: 'Criar convite' }).click()
  await expect(page.getByRole('alert')).toContainText('Sem conexão')
  expect(mock.calls.length).toBe(before)
})

const guestToken = 'a'.repeat(64)
function snapshot(): Snapshot {
  return {
    invitation: { name: 'Convidado fictício', kind: 'individual', capacity: 1, response: 'pending', attending: 0, version: 1 },
    event: { id: '60000000-0000-4000-8000-000000000006', title: 'Chá de teste', description: '', starts_at: '2035-09-10T17:30:00Z',
      address: '', instructions: '', cover_path: null, status: 'published' },
    items: [] as GuestItem[],
  }
}
test('confirmar presença offline avisa sem chamar o servidor', async ({ page, context }) => {
  const calls: string[] = []
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const body = route.request().postDataJSON()
    calls.push(body.action)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session_token: 'fake', snapshot: snapshot() }) })
  })
  await page.goto(`/convite#${guestToken}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('radio', { name: 'Vai participar' }).check()
  const before = calls.length
  await page.getByRole('button', { name: 'Confirmar presença' }).click()
  await expect(page.getByRole('alert')).toContainText('Sem conexão')
  expect(calls.filter(a => a === 'rsvp')).toHaveLength(0)
  expect(calls.length).toBe(before)
})
