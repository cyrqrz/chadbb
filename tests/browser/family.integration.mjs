import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localConfig, fixture, edge } from '../support/local.mjs'
let config, app, browser
const origin = 'http://127.0.0.1:5173'
before(async () => {
  config = localConfig()
  try { await fetch(origin); throw new Error('Porta 5173 ocupada; encerre o servidor de desenvolvimento antes do teste integrado.') }
  catch (error) { if (error.message.startsWith('Porta')) throw error }
  app = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: config.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: config.PUBLISHABLE_KEY }, stdio: 'ignore',
  })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(origin)).ok; if (ready) break } catch { /* wait for Vite */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'Vite deve iniciar')
  browser = await chromium.launch({ headless: true })
  await mkdir('test-results', { recursive: true })
}, { timeout: 30000 })
after(async () => { await browser?.close(); app?.kill() })
for (const [device, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`jornada real ${device}: RSVP, fraldas, mimos, sincronização e acessibilidade`, async () => {
    const f = await fixture(config)
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${origin}/convite#${f.invite.token}`)
      await expect(page.getByRole('heading', { name: 'Podemos contar com você?' })).toBeVisible()
      assert.equal(new URL(page.url()).hash, '')
      await page.getByRole('radio', { name: 'Vai participar' }).check()
      await page.getByLabel('Quantas pessoas vão?').fill('3')
      await page.getByRole('button', { name: 'Confirmar presença', exact: true }).click()
      await expect(page.getByText('Resposta atual: Vai participar · 3 pessoa(s).')).toBeVisible()
      await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
      const p = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P', exact: true }) })
      await p.getByRole('spinbutton').fill('2')
      await p.getByRole('button', { name: 'Escolher presente' }).click()
      await expect(p.getByText('Você confirmou 2 pacote(s).')).toBeVisible()
      await expect(p.getByText('4 de 6 pacotes disponíveis')).toBeVisible()
      const report = await new AxeBuilder({ page }).analyze()
      assert.deepEqual(report.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), [])
      await page.screenshot({ path: `test-results/family-diapers-${device}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Mimos', exact: true }).click()
      const gift = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira Anti Cólica', exact: true }) })
      await gift.getByRole('spinbutton').fill('5')
      await gift.getByRole('button', { name: 'Escolher presente' }).click()
      await expect(gift.getByText('Você confirmou 5 unidade(s).')).toBeVisible()
      const second = await edge(config, f.invite.token, 'exchange')
      const item = second.data.snapshot.items.find(i => i.title === 'Mamadeira Anti Cólica')
      const changed = await edge(config, second.data.session_token, 'reserve', { request_id: crypto.randomUUID(), item_id: item.id, quantity: 7, version: item.own.version })
      assert.equal(changed.status, 200)
      await expect(gift.getByText('Você confirmou 7 unidade(s).')).toBeVisible({ timeout: 7500 })
      await gift.getByRole('button', { name: 'Cancelar reserva' }).click()
      await expect(gift.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
      await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
      await expect(p.getByText('4 de 6 pacotes disponíveis')).toBeVisible()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      const dash = await f.call('organizer_invitations', { p_event_id: f.event.id })
      assert.equal(dash.invitations[0].attending, 3)
      assert.equal(dash.reservations.length, 1)
      assert.deepEqual(errors, [])
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Vamos recuperar seu acesso' })).toBeVisible()
    } finally { await ctx.close(); await f.cleanup() }
  }, { timeout: 90000 })
}
for (const [device, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`compra informada ${device}: quantidade e troca somem, cancelar permanece`, async () => {
    const f = await fixture(config)
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${origin}/convite#${f.invite.token}`)
      await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
      const article = size => page.getByRole('article').filter({ has: page.getByRole('heading', { name: `Fraldas tamanho ${size}`, exact: true }) })
      const p = article('P'); const m = article('M')
      await p.getByRole('spinbutton').fill('2')
      await p.getByRole('button', { name: 'Escolher presente' }).click()
      await expect(p.getByText('Você confirmou 2 pacote(s).')).toBeVisible()
      await m.getByRole('spinbutton').fill('1')
      await m.getByRole('button', { name: 'Escolher presente' }).click()
      await expect(m.getByText('Você confirmou 1 pacote(s).')).toBeVisible()
      await expect(m.getByRole('combobox').getByRole('option', { name: /^P ·/ })).toHaveCount(1)
      await p.getByRole('button', { name: 'Já comprei' }).click()
      await expect(p.getByText(/Compra informada por você\. Para mudar a quantidade ou o tamanho, cancele a reserva/)).toBeVisible()
      await expect(p.getByRole('spinbutton')).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Atualizar minha escolha' })).toHaveCount(0)
      await expect(p.getByRole('combobox')).toHaveCount(0)
      await expect(p.getByRole('button', { name: /^Trocar meus/ })).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Já comprei' })).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible()
      await expect(m.getByRole('combobox').getByRole('option', { name: /^P ·/ })).toHaveCount(0)
      const report = await new AxeBuilder({ page }).analyze()
      assert.deepEqual(report.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), [])
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await p.getByRole('button', { name: 'Cancelar reserva' }).click()
      await expect(p.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
      await expect(p.getByRole('spinbutton')).toHaveCount(1)
      assert.deepEqual(errors, [])
    } finally { await ctx.close(); await f.cleanup() }
  }, { timeout: 90000 })
}
test('organizador edita convite e recebe conflito se RSVP mudou durante a edição', async () => {
  const f = await fixture(config)
  const ctx = await browser.newContext()
  try {
    await ctx.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: `sb-${new URL(config.API_URL).hostname.split('.')[0]}-auth-token`, session: f.session,
    })
    const page = await ctx.newPage()
    await page.goto(`${origin}/eventos/${f.event.id}/convites`)
    await page.getByRole('button', { name: 'Editar convite de Família de teste' }).click()
    await page.getByLabel('Nome no convite').fill('Família revisada')
    await page.getByLabel('Limite de pessoas', { exact: true }).fill('4')
    await page.getByRole('button', { name: 'Salvar convite' }).click()
    await expect(page.getByRole('status')).toContainText('Convite atualizado.')
    await expect(page.getByRole('heading', { name: 'Família revisada' })).toBeVisible()
    await page.getByRole('button', { name: 'Editar convite de Família revisada' }).click()
    const access = (await edge(config, f.invite.token, 'exchange')).data
    assert.equal((await edge(config, access.session_token, 'rsvp', {
      response: 'yes', attending: 4, version: 2, request_id: crypto.randomUUID(),
    })).status, 200)
    await page.getByLabel('Limite de pessoas', { exact: true }).fill('2')
    await page.getByRole('button', { name: 'Salvar convite' }).click()
    await expect(page.getByRole('alert')).toContainText('Este convite mudou.')
    assert.equal((await f.call('organizer_invitations', { p_event_id: f.event.id })).invitations[0].capacity, 4)
    await page.getByRole('button', { name: 'Cancelar edição' }).click()
  } finally { await ctx.close(); await f.cleanup() }
}, { timeout: 30000 })

test('M5: outro convite e fragmento inválido na mesma aba nunca exibem a família anterior', async () => {
  const f = await fixture(config); const ctx = await browser.newContext()
  try {
    const other = await f.call('organizer_invitations', { p_event_id: f.event.id, p_action: 'create', p_payload: { name: 'Outra família', kind: 'family', capacity: 2 } })
    const page = await ctx.newPage()
    await page.goto(`${origin}/convite#${f.invite.token}`)
    await expect(page.getByText('Família de teste, este convite', { exact: false })).toBeVisible()
    await page.evaluate(token => { window.location.hash = token }, other.token)
    await expect(page.getByText('Outra família, este convite', { exact: false })).toBeVisible()
    await expect(page.getByText('Família de teste, este convite', { exact: false })).toHaveCount(0)
    assert.equal(new URL(page.url()).hash, '')
    await page.evaluate(() => { window.location.hash = 'invalido' })
    await expect(page.getByRole('heading', { name: 'Vamos recuperar seu acesso' })).toBeVisible()
    await expect(page.getByText('Outra família, este convite', { exact: false })).toHaveCount(0)
    await page.evaluate(token => { window.location.hash = token }, f.invite.token)
    await expect(page.getByText('Família de teste, este convite', { exact: false })).toBeVisible()
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
  } finally { await ctx.close(); await f.cleanup() }
}, { timeout: 30000 })

test('M5: resposta perdida após commit é recuperada com a mesma chave, sem duplicar reserva', async () => {
  const f = await fixture(config); const ctx = await browser.newContext()
  try {
    const page = await ctx.newPage(); const requests = []
    let loseResponse = true
    await page.route('**/functions/v1/guest', async route => {
      const body = route.request().postDataJSON()
      if (body.action !== 'reserve') return route.continue()
      requests.push(body.payload.request_id)
      const response = await route.fetch()
      assert.equal(response.status(), 200, 'o servidor confirmou antes da falha simulada')
      if (loseResponse) { loseResponse = false; await route.abort('failed') }
      else await route.fulfill({ response })
    })
    await page.goto(`${origin}/convite#${f.invite.token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const item = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P', exact: true }) })
    await item.getByRole('spinbutton').fill('2')
    await item.getByRole('button', { name: 'Escolher presente', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Verificar tentativa anterior' })).toBeVisible()
    await expect(page.getByText('Presente reservado para você.')).toHaveCount(0)
    await page.getByRole('button', { name: 'Verificar tentativa anterior' }).click()
    await expect(page.getByText('Presente reservado para você.')).toBeVisible()
    assert.equal(requests.length, 2); assert.equal(requests[0], requests[1])
    const snapshot = (await edge(config, f.invite.token, 'exchange')).data.snapshot
    const stored = snapshot.items.find(i => i.diaper_size === 'P')
    assert.equal(stored.committed, 2); assert.equal(stored.own.version, 1)
  } finally { await ctx.close(); await f.cleanup() }
}, { timeout: 30000 })

test('M5: 320 px, texto a 200%, teclado e acessibilidade nas três áreas do convite', async () => {
  const f = await fixture(config); const ctx = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' })
  try {
    const page = await ctx.newPage()
    await page.goto(`${origin}/convite#${f.invite.token}`)
    await expect(page.getByRole('heading', { name: 'Podemos contar com você?' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Podemos contar com você?' })).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200%; }' })
    for (const name of ['Presença', 'Fraldas', 'Mimos']) {
      const tab = page.getByRole('button', { name, exact: true })
      await tab.focus(); await page.keyboard.press('Enter')
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `sem rolagem horizontal em ${name}`)
      const report = await new AxeBuilder({ page }).analyze()
      assert.deepEqual(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [])
    }
  } finally { await ctx.close(); await f.cleanup() }
}, { timeout: 60000 })
