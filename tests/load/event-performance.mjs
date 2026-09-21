// T-B5: dry-run padrão; produção somente após revisão e aprovação do titular.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer as createHttpServer } from 'node:http'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import pg from 'pg'
import { localConfig } from '../support/local.mjs'
import { passesCriteria, isNetworkFailure } from '../support/performance-metrics.mjs'

const ref = 'fcykqrlnofmdtmewlejr'
const args = process.argv.slice(2)
const local = args.includes('--local'), remote = args.includes('--remote')
const failSetup = args.includes('--fail-after-setup')
const interruptUser = args.includes('--interrupt-after-user')
const plan = { project: ref, users: 1, events: 1, items: 27, invitations: 50,
  load: '5 ondas de 50 requisições, espaçadas em pelo menos 5 s; 225 leituras e 25 escritas',
  initial_reservations: 50, max_guest_posts: 420, synchronization: '3 mudanças via UI, dois contextos independentes',
  gates: 'zero erros; p95 de leitura e escrita <= 2000 ms; cada atualização visual <= 7000 ms',
  cleanup: 'dados fictícios desta conta e hashes dos próprios tokens; cotas de IP/global preservadas' }
if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
  console.log(JSON.stringify({ mode: 'dry-run sem conexões ou credenciais', ...plan }, null, 2)); process.exit(0)
}
if (args.some(a => !['--local', '--remote', '--fail-after-setup', '--interrupt-after-user'].includes(a)) || local === remote || (remote && (failSetup || interruptUser)) ||
    (remote && process.env.CHADBB_PERF_REF !== ref)) {
  console.error('Use --local [--fail-after-setup] ou --remote com CHADBB_PERF_REF correto. Nada executado.'); process.exit(1)
}
const email = `perf-${randomUUID()}@example.test`
const tokens = new Set(), samples = [], sync = [], eventIds = [], invitationIds = []
const uiErrors = []
let uiMeasurementActive = true, uiCancellations = 0
let db, connected = false, browser, app, web, config, phase = 'configuração', failed = false, posts = 0
const cancellation = new AbortController()
const interrupt = () => {
  cancellation.abort()
  void browser?.close().catch(() => {})
}
process.on('SIGTERM', interrupt); process.on('SIGINT', interrupt)
const boundedFetch = (url, init = {}) => fetch(url, { ...init,
  signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(20000), ...(init.signal ? [init.signal] : [])]) })
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } }
const ok = r => { assert.equal(r.error, null); return r.data }
const track = token => { if (token) tokens.add(token); return token }
const sleep = ms => delay(ms, undefined, { signal: cancellation.signal })
function stats(action) {
  const values = samples.filter(s => s.action === action).map(s => s.ms).sort((a, b) => a - b)
  return { requests: values.length, errors: samples.filter(s => s.action === action && s.status !== 200).length,
    p95_ms: Math.ceil(values[Math.ceil(values.length * 0.95) - 1]), max_ms: Math.ceil(values.at(-1)) }
}
async function guest(token, action, payload = {}) {
  assert.ok(posts < plan.max_guest_posts, 'orçamento esgotado'); posts++
  const r = await boundedFetch(`${config.url}/functions/v1/guest`, { method: 'POST',
    headers: { apikey: config.key, 'Content-Type': 'application/json', Origin: config.site,
      ...(action === 'exchange' ? {} : { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ action, ...(action === 'exchange' ? { token } : { payload }) }), signal: AbortSignal.timeout(20000) })
  const data = await r.json(); if (action === 'exchange') track(data.session_token)
  return { status: r.status, data }
}
try {
  if (local) {
    const c = localConfig()
    config = { url: c.API_URL, key: c.PUBLISHABLE_KEY, secret: c.SERVICE_ROLE_KEY ?? c.SECRET_KEY, site: 'http://127.0.0.1:5173' }
    db = new pg.Client({ connectionString: c.DB_URL, connectionTimeoutMillis: 15000 })
    // Middleware evita o handler SIGTERM do Vite, que sairia antes da limpeza.
    app = await createServer({ server: { middlewareMode: true, hmr: false },
      define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(config.url), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(config.key) } })
    web = createHttpServer(app.middlewares)
    await new Promise((resolve, reject) => { web.once('error', reject); web.listen(5173, '127.0.0.1', resolve) })
  } else {
    const raw = JSON.parse(execFileSync('node_modules/.bin/supabase', ['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }))
    const keys = Array.isArray(raw) ? raw : raw.keys ?? []
    const key = keys.find(k => k.type === 'publishable' || k.name === 'publishable')?.api_key
    const secret = keys.find(k => k.type === 'secret' || k.name === 'secret')?.api_key
    assert.match(key ?? '', /^sb_publishable_/); assert.match(secret ?? '', /^sb_secret_/)
    config = { url: `https://${ref}.supabase.co`, key, secret, site: 'https://chadbb.pages.dev' }
    db = new pg.Client({ host: 'aws-0-sa-east-1.pooler.supabase.com', port: 5432, user: `postgres.${ref}`, database: 'postgres',
      password: readFileSync(join(homedir(), '.config/chadbb/chadbb-cha.db-password'), 'utf8').trim(),
      ssl: { ca: readFileSync(new URL('../../scripts/backup/supabase-ca.crt', import.meta.url), 'utf8'), rejectUnauthorized: true }, connectionTimeoutMillis: 15000 })
  }
  phase = 'pré-requisitos'
  // Só GET: nenhuma cota ou dado de convidado é criado nesta sonda.
  for (let i = 0; i < 5; i++) {
    const r = await boundedFetch(`${config.url}/functions/v1/guest`, { headers: { Origin: config.site }, signal: AbortSignal.timeout(5000) })
    assert.equal(r.status, 405); assert.equal((await r.json()).error, 'METHOD_NOT_ALLOWED')
    if (i < 4) await sleep(1000)
  }
  browser = await chromium.launch({ headless: true, handleSIGTERM: false, handleSIGINT: false })
  await db.connect(); connected = true
  if (remote) assert.equal(db.connection.stream.authorized, true)
  phase = 'preparação de conta, evento e 50 convites'
  const admin = createClient(config.url, config.secret, opts)
  const owner = createClient(config.url, config.key, opts)
  const password = randomUUID()
  ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
  if (interruptUser) {
    process.kill(process.pid, 'SIGTERM')
    await sleep(1000)
    throw new Error('signal was not handled')
  }
  ok(await owner.auth.signInWithPassword({ email, password }))
  const rpc = async (name, args) => ok(await owner.rpc(name, args).single())
  let event = await rpc('create_event', { p_title: 'Ensaio fictício T-B5' }); eventIds.push(event.id)
  event = await rpc('save_event', { p_event_id: event.id, p_version: event.version, p_title: event.title,
    p_public_description: 'Dados sintéticos de desempenho', p_starts_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    p_ends_at: new Date(Date.now() + 30 * 86400000 + 3600000).toISOString(), p_private_address: 'Local fictício', p_private_instructions: '', p_cover_path: null })
  assert.equal(ok(await owner.rpc('prepare_family_list', { p_event_id: event.id })), 27)
  await rpc('transition_event', { p_event_id: event.id, p_version: event.version, p_status: 'published' })
  const invitations = []
  for (let i = 0; i < 50; i++) {
    const invite = ok(await owner.rpc('organizer_invitations', { p_event_id: event.id, p_action: 'create',
      p_payload: { name: `Convidado fictício ${i}`, kind: 'individual', capacity: 1 } }))
    invitations.push(invite); invitationIds.push(invite.id); track(invite.token)
  }
  const guests = []
  // Preparação sequencial não participa do p95; o ensaio mede carga aquecida.
  for (const invite of invitations) {
    const access = await guest(invite.token, 'exchange'); assert.equal(access.status, 200)
    const item = access.data.snapshot.items.find(i => i.category === 'mimo')
    const r = await guest(access.data.session_token, 'reserve', { item_id: item.id, quantity: 1, version: null, request_id: randomUUID() })
    assert.equal(r.status, 200)
    guests.push({ token: access.data.session_token, item: item.id, version: 1 })
  }
  if (failSetup) { phase = 'falha injetada após preparação'; throw new Error('injected') }
  phase = 'carga de 50 convidados'
  for (let round = 0; round < 5; round++) {
    const wave = performance.now()
    await Promise.all(guests.map(async (g, index) => {
      const action = index % 10 === 0 ? 'reserve' : 'read', start = performance.now()
      let status = 0
      try {
        const r = await guest(g.token, action, action === 'reserve' ? { item_id: g.item, quantity: round + 2, version: g.version, request_id: randomUUID() } : {})
        status = r.status; if (status === 200 && action === 'reserve') g.version++
      } catch { /* Falha/timeout também entra na estatística, sem expor o erro. */ }
      samples.push({ action, status, ms: performance.now() - start })
    }))
    console.log(`Onda ${round + 1}/5 concluída.`)
    if (samples.some(s => s.status !== 200)) throw new Error('load failed')
    if (round < 4) await sleep(Math.max(0, 5000 - (performance.now() - wave)))
  }
  phase = 'sincronização visual entre duas sessões'
  const pages = []
  for (const invite of invitations.slice(0, 2)) {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const isGuestPost = req => req.method() === 'POST' && req.url() === `${config.url}/functions/v1/guest`
    ctx.on('response', response => {
      if (uiMeasurementActive && isGuestPost(response.request()) && response.status() !== 200) uiErrors.push(response.status())
    })
    ctx.on('requestfailed', req => {
      if (!uiMeasurementActive || !isGuestPost(req)) return
      let action
      try { action = req.postDataJSON()?.action } catch { /* Payload desconhecido reprova. */ }
      if (isNetworkFailure(req.failure()?.errorText, action)) uiErrors.push(0)
      else uiCancellations++
    })
    await ctx.route(`${config.url}/functions/v1/guest`, async route => {
      const req = route.request()
      if (req.method() === 'POST') {
        track(req.headers().authorization?.replace(/^Bearer /, ''))
        if (posts >= plan.max_guest_posts) { await route.abort(); return }
        posts++
      }
      await route.continue()
    })
    const page = await ctx.newPage(); pages.push(page)
    await page.goto(`${config.site}/convite#${invite.token}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click({ timeout: 15000 })
  }
  const article = page => page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P', exact: true }) })
  for (const page of pages) {
    assert.equal(await page.evaluate(() => globalThis.document.visibilityState), 'visible')
    await expect(article(page).getByText('6 de 6 disponíveis', { exact: true })).toBeVisible()
  }
  for (let qty = 1; qty <= 3; qty++) {
    await article(pages[0]).getByRole('spinbutton').fill(String(qty))
    // Início antes do clique: limite conservador, inclui envio/commit e renderização.
    const start = performance.now()
    await article(pages[0]).getByRole('button', { name: qty === 1 ? 'Escolher presente' : 'Atualizar quantidade', exact: true }).click()
    await expect(article(pages[1]).getByText(`${6 - qty} de 6 disponíveis`, { exact: true })).toBeVisible({ timeout: 10000 })
    sync.push(Math.ceil(performance.now() - start))
    // Textos do cartão do G3.1: reserva própria em "Sua reserva".
    await expect(article(pages[0]).getByText(`${qty} ${qty === 1 ? 'pacote' : 'pacotes'}`, { exact: true })).toBeVisible()
  }
  phase = 'critérios de aceite'
  assert.ok(passesCriteria({ readP95: stats('read').p95_ms, writeP95: stats('reserve').p95_ms, syncMs: sync,
    loadErrors: samples.filter(s => s.status !== 200).length, uiErrors: uiErrors.length }))
} catch {
  failed = true; console.error(`FAIL: ${cancellation.signal.aborted ? 'interrompido' : phase}`)
} finally {
  uiMeasurementActive = false
  // Fechar páginas antes da limpeza: nenhuma consulta continua durante exclusões.
  await browser?.close().catch(() => {})
  if (web) await new Promise(resolve => web.close(resolve))
  await app?.close().catch(() => {})
  if (uiErrors.length) failed = true
  console.log(JSON.stringify({ environment: local ? 'local' : 'remote', guest_posts: posts,
    read: stats('read'), reserve: stats('reserve'), sync_click_to_visible_ms: sync,
    ui_errors: uiErrors, ui_cancelled_reads: uiCancellations, measurements_passed: !failed }))
  if (connected) {
    try {
      await db.query('begin')
      const ids = (await db.query('select id from auth.users where email=$1', [email])).rows.map(r => r.id)
      const invitations = (await db.query('select i.id from private.invitations i join public.events e on e.id=i.event_id where e.owner_id=any($1::uuid[])', [ids])).rows.map(r => r.id)
      const invIds = [...new Set([...invitations, ...invitationIds])]
      for (const table of ['private.guest_requests', 'public.reservations', 'private.guest_sessions']) {
        await db.query(`delete from ${table} where invitation_id=any($1::uuid[])`, [invIds])
      }
      await db.query('delete from private.invitations where id=any($1::uuid[])', [invIds])
      await db.query('delete from public.event_items where event_id in (select id from public.events where owner_id=any($1::uuid[]))', [ids])
      await db.query('delete from public.events where owner_id=any($1::uuid[])', [ids])
      await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
      const hashes = [...tokens].map(t => createHash('sha256').update(`token:${t}`).digest('hex'))
      await db.query('delete from private.guest_rate where key_hash=any($1::text[])', [hashes])
      const counts = (await db.query(`select
        (select count(*)::int from auth.users where email=$1) users,
        (select count(*)::int from public.events where id=any($2::uuid[]) or owner_id=any($3::uuid[])) events,
        (select count(*)::int from public.event_items where event_id=any($2::uuid[])) items,
        (select count(*)::int from private.invitations where id=any($4::uuid[])) invitations,
        (select count(*)::int from private.guest_sessions where invitation_id=any($4::uuid[])) sessions,
        (select count(*)::int from public.reservations where invitation_id=any($4::uuid[])) reservations,
        (select count(*)::int from private.guest_requests where invitation_id=any($4::uuid[])) requests,
        (select count(*)::int from private.guest_rate where key_hash=any($5::text[])) token_rates`, [email, eventIds, ids, invIds, hashes])).rows[0]
      assert.ok(Object.values(counts).every(n => n === 0))
      await db.query('commit'); console.log('PASS: limpeza restrita; ' + JSON.stringify(counts))
    } catch {
      await db.query('rollback').catch(() => {}); failed = true
      console.error('FAIL: limpeza; investigar antes de repetir.')
    }
  }
  await db?.end().catch(() => {})
  process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt)
}
process.exitCode = failed ? 1 : 0
