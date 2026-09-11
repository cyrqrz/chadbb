import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chromium, devices, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// Supabase, Edge Function e Chromium reais; sem traces ou registros dos links secretos.
test('convite familiar local: criação, respostas, reabertura, prazo e revogação', { timeout: 120000 }, async () => {
  const config = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  for (const [value, port] of [[config.API_URL, '54321'], [config.DB_URL, '54322']]) {
    const url = new URL(value)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    assert.equal(url.port, port)
  }
  const api = new URL(config.API_URL).origin
  const origin = 'http://127.0.0.1:5173'
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(api, config.SERVICE_ROLE_KEY ?? config.SECRET_KEY, options)
  const organizer = createClient(api, config.PUBLISHABLE_KEY, options)
  const db = new pg.Client({ connectionString: config.DB_URL })
  let browser, server, userId
  let phase = 'preparação'
  await db.connect()
  try {
    phase = 'disponibilidade da Edge Function local'
    await expect.poll(async () => {
      const response = await fetch(`${api}/functions/v1/guest`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read' }) })
      return response.status
    }, { timeout: 20000, intervals: [500, 1000] }).toBe(401)
    const email = `family-${randomUUID()}@example.test`
    const password = randomUUID()
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.equal(created.error, null); userId = created.data.user.id
    const login = await organizer.auth.signInWithPassword({ email, password })
    assert.equal(login.error, null)
    async function rpc(name, body) {
      const result = await organizer.rpc(name, body).single()
      assert.equal(result.error, null)
      return result.data
    }
    let event = await rpc('create_event', { p_title: 'Encontro de teste familiar' })
    event = await rpc('save_event', { p_event_id: event.id, p_version: event.version, p_title: event.title, p_public_description: 'Encontro fictício', p_starts_at: new Date(Date.now() + 86400000).toISOString(), p_private_address: 'Rua de teste, 123', p_private_instructions: 'Entrada pelo portão', p_cover_path: null })
    event = await rpc('transition_event', { p_event_id: event.id, p_version: event.version, p_status: 'published' })
    server = await createServer({
      server: { host: '127.0.0.1', port: 5173, strictPort: true },
      define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(config.PUBLISHABLE_KEY) },
    })
    await server.listen()
    browser = await chromium.launch()
    const ownerContext = await browser.newContext()
    await ownerContext.addInitScript(({ key, session }) => {
      globalThis.localStorage.setItem(key, JSON.stringify(session))
    }, { key: `sb-${new URL(api).hostname.split('.')[0]}-auth-token`, session: login.data.session })
    const owner = await ownerContext.newPage()
    phase = 'criação pela interface do organizador'
    await owner.goto(`${origin}/eventos/${event.id}/convites`)
    await owner.getByLabel('Nome da família ou grupo').fill('Família de teste')
    await owner.getByLabel('Pessoas convidadas').fill('Ana\nPedro\nLuiza')
    await owner.getByRole('button', { name: 'Criar convite familiar' }).click()
    await expect(owner.getByLabel('Link do convite')).toBeVisible()
    const link = await owner.getByLabel('Link do convite').inputValue()
    assert.match(new URL(link).hash, /^#[a-f0-9]{64}$/)
    const second = await rpc('create_family_invitation', { p_event_id: event.id, p_label: 'Outra família', p_names: ['Marina'], p_expires_at: null })
    const guestContext = await browser.newContext(devices['Pixel 7'])
    const guest = await guestContext.newPage()
    let leaked = false
    const token = new URL(link).hash.slice(1)
    guest.on('request', request => {
      if (request.url().includes(token) || (request.headers().referer ?? '').includes(token)) leaked = true
    })
    phase = 'abertura sem login no celular emulado'
    await guest.goto(link)
    await expect(guest.getByRole('heading', { name: event.title })).toBeVisible()
    assert.equal(guest.url(), `${origin}/convite`)
    await expect(guest.getByText('Rua de teste, 123', { exact: true })).toBeVisible()
    const ana = guest.getByRole('group', { name: 'Ana', exact: true })
    const pedro = guest.getByRole('group', { name: 'Pedro', exact: true })
    const luiza = guest.getByRole('group', { name: 'Luiza', exact: true })
    phase = 'Sim/Não/Talvez individuais'
    for (const [person, value] of [[ana, 'Sim'], [pedro, 'Não'], [luiza, 'Talvez']]) {
      await person.getByRole('button', { name: value, exact: true }).click()
      await expect(person).toContainText(`Resposta: ${value}`)
    }
    await owner.getByRole('button', { name: 'Atualizar respostas' }).click()
    const family = owner.getByRole('article').filter({ hasText: 'Família de teste' })
    await expect(family).toContainText('Ana: Sim')
    await expect(family).toContainText('Pedro: Não')
    await expect(family).toContainText('Luiza: Talvez')
    phase = 'reabertura do link original e alteração de resposta'
    await guest.reload()
    await expect(guest.getByRole('heading', { name: 'Acesso ao convite' })).toBeVisible()
    await guest.goto(link)
    await expect(ana).toContainText('Resposta: Sim')
    await ana.getByRole('button', { name: 'Talvez', exact: true }).click()
    await expect(ana).toContainText('Resposta: Talvez')
    assert.equal(await guest.evaluate(() => localStorage.length + sessionStorage.length), 0)
    assert.equal(leaked, false, 'token não deve aparecer em URL de requisição ou Referer')
    phase = 'bloqueio do prazo pelo servidor com página já aberta'
    await db.query("update public.events set starts_at=clock_timestamp()-interval '1 second' where id=$1 and owner_id=$2", [event.id, userId])
    await ana.getByRole('button', { name: 'Sim', exact: true }).click()
    await expect(guest.getByRole('alert')).toContainText('O evento já começou')
    await expect(ana.getByRole('button', { name: 'Sim', exact: true })).toBeDisabled()
    await expect(ana).toContainText('Resposta: Talvez')
    phase = 'reabertura após início somente para consulta'
    await guest.goto(link)
    await expect(guest.getByText('As respostas estão encerradas.', { exact: false })).toBeVisible()
    await expect(pedro.getByRole('button', { name: 'Sim', exact: true })).toBeDisabled()
    phase = 'revogação pelo organizador e invalidação de sessão existente'
    owner.once('dialog', dialog => dialog.accept())
    await owner.getByRole('button', { name: 'Revogar convite de Família de teste' }).click()
    await expect(owner.getByRole('status')).toContainText('Convite revogado.')
    await guest.getByRole('button', { name: 'Atualizar respostas' }).click()
    await expect(guest.getByRole('heading', { name: 'Acesso ao convite' })).toBeVisible()
    await guest.goto(link)
    await expect(guest.getByRole('alert')).toContainText('expirou ou foi revogado')
    phase = 'troca de família e link inválido na mesma aba'
    await guest.goto(`${origin}/convite#${second.token}`)
    await expect(guest.getByRole('group', { name: 'Marina', exact: true })).toBeVisible()
    await expect(ana).toHaveCount(0)
    await expect(guest.getByRole('alert')).toHaveCount(0)
    await guest.goto(`${origin}/convite#invalido`)
    await expect(guest.getByRole('heading', { name: 'Acesso ao convite' })).toBeVisible()
    await expect(guest.getByRole('group', { name: 'Marina', exact: true })).toHaveCount(0)
  } catch {
    throw new Error(`Falha no ensaio de convite familiar: ${phase}`)
  } finally {
    await browser?.close()
    await server?.close()
    try {
      if (userId) {
        await db.query('delete from public.invitations where event_id in (select id from public.events where owner_id=$1)', [userId])
        await db.query('delete from public.events where owner_id=$1', [userId])
        assert.equal((await admin.auth.admin.deleteUser(userId)).error, null)
      }
    } finally { await db.end() }
  }
})
