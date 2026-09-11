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
      await p.getByRole('button', { name: 'Vou levar' }).click()
      await expect(p.getByText('Você confirmou 2 pacote(s).')).toBeVisible()
      await expect(p.getByText('4 de 6 pacotes disponíveis')).toBeVisible()
      const report = await new AxeBuilder({ page }).analyze()
      assert.deepEqual(report.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), [])
      await page.screenshot({ path: `test-results/family-diapers-${device}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Mimos', exact: true }).click()
      const gift = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira Anti Cólica', exact: true }) })
      await gift.getByRole('spinbutton').fill('5')
      await gift.getByRole('button', { name: 'Vou levar' }).click()
      await expect(gift.getByText('Você confirmou 5 unidade(s).')).toBeVisible()
      const second = await edge(config, f.invite.token, 'exchange')
      const item = second.data.snapshot.items.find(i => i.title === 'Mamadeira Anti Cólica')
      const changed = await edge(config, second.data.session_token, 'reserve', { request_id: crypto.randomUUID(), item_id: item.id, quantity: 7, version: item.own.version })
      assert.equal(changed.status, 200)
      await expect(gift.getByText('Você confirmou 7 unidade(s).')).toBeVisible({ timeout: 7500 })
      await gift.getByRole('button', { name: 'Cancelar escolha' }).click()
      await expect(gift.getByRole('button', { name: 'Vou levar' })).toBeVisible()
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
