// Smoke test pós-deploy do projeto do chá. Cria e remove dados fictícios no projeto remoto:
// só executar com aprovação explícita. Nunca imprime chaves, senha ou segredos.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fixture, edge, localDatabase } from '../support/local.mjs'

const EXPECTED_REF = 'fcykqrlnofmdtmewlejr'
const SITE_ORIGIN = 'https://chadbb.pages.dev'
let config, f, db, access
const tokens = new Set()

function remoteConfig() {
  const ref = process.env.CHADBB_SMOKE_REF
  if (ref !== EXPECTED_REF) throw new Error('CHADBB_SMOKE_REF ausente ou diferente do projeto do chá; nada foi executado.')
  const dbUrl = new URL(process.env.CHADBB_SMOKE_DB_URL ?? 'invalid:')
  const dbHostOk = dbUrl.hostname === `db.${ref}.supabase.co` || (dbUrl.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(dbUrl.username) === `postgres.${ref}`)
  if (dbUrl.protocol !== 'postgresql:' || !dbHostOk) throw new Error('CHADBB_SMOKE_DB_URL não aponta para o projeto do chá; nada foi executado.')
  let keys
  try {
    keys = JSON.parse(execFileSync('node_modules/.bin/supabase', ['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch { throw new Error('Não foi possível obter as chaves pelo CLI autenticado.') }
  const list = Array.isArray(keys) ? keys : keys.keys ?? []
  const find = (...names) => list.find(k => names.includes(k.name) || names.includes(k.type))?.api_key
  const PUBLISHABLE_KEY = find('publishable', 'anon'); const SECRET_KEY = find('secret', 'service_role')
  if (!PUBLISHABLE_KEY || !SECRET_KEY) throw new Error('Chaves do projeto não encontradas.')
  const API_URL = `https://${ref}.supabase.co`
  assert.equal(new URL(API_URL).hostname, `${ref}.supabase.co`)
  return { API_URL, PUBLISHABLE_KEY, SECRET_KEY, DB_URL: dbUrl.toString() }
}
const retentionSecret = () => readFileSync(join(homedir(), '.config/chadbb/retention-cron-secret'), 'utf8').trim()
const hash = value => createHash('sha256').update(value).digest('hex')
const call = (path, init = {}) => fetch(`${config.API_URL}${path}`, { ...init, headers: { apikey: config.PUBLISHABLE_KEY, ...init.headers } })
function track(token) { if (token) tokens.add(token); return token }

let rateBefore = new Map()
before(async () => {
  config = remoteConfig()
  db = await localDatabase(config)
  // Sem tráfego real no projeto, toda janela criada ou alterada durante o smoke (global, ip e token) é do teste.
  rateBefore = new Map((await db.query('select key_hash, window_start, requests from private.guest_rate')).rows
    .map(r => [r.key_hash, `${r.window_start.toISOString()}|${r.requests}`]))
  f = await fixture(config)
  track(f.invite.token)
})
after(async () => {
  try {
    if (!f) return
    const invitations = (await db.query('select id from private.invitations where event_id=$1', [f.event.id])).rows.map(r => r.id)
    await f.cleanup()
    const tokenKeys = new Set([...tokens].map(t => hash(`token:${t}`)))
    const created = (await db.query('select key_hash, window_start, requests from private.guest_rate')).rows
      .filter(r => tokenKeys.has(r.key_hash) || rateBefore.get(r.key_hash) !== `${r.window_start.toISOString()}|${r.requests}`)
      .map(r => r.key_hash)
    await db.query('delete from private.guest_rate where key_hash = any($1::text[])', [created])
    const left = (await db.query(`select
      (select count(*) from auth.users where id=$1) organizador,
      (select count(*) from public.events where id=$2 or owner_id=$1) evento,
      (select count(*) from public.event_items where event_id=$2) itens,
      (select count(*) from private.invitations where event_id=$2 or id=any($3::uuid[])) convites,
      (select count(*) from private.guest_sessions where invitation_id=any($3::uuid[])) sessoes,
      (select count(*) from public.reservations where invitation_id=any($3::uuid[])) reservas,
      (select count(*) from private.guest_requests where invitation_id=any($3::uuid[])) pedidos,
      (select count(*) from private.guest_rate where key_hash=any($4::text[])) guest_rate,
      (select count(*) from private.retention_audit where event_id=$2) auditoria`, [f.userId, f.event.id, invitations, created])).rows[0]
    console.log(`# zero sobras: ${JSON.stringify(left)}`)
    assert.deepEqual(Object.values(left).map(Number), Array(9).fill(0), 'smoke deixou dados fictícios')
  } finally { await db?.end() }
})

test('guest: CORS só para o site do chá, método restrito', async () => {
  const preflight = await call('/functions/v1/guest', { method: 'OPTIONS', headers: { Origin: SITE_ORIGIN } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), SITE_ORIGIN)
  for (const origin of ['https://mvp-familiar.chadbb.pages.dev', 'https://evil.example']) {
    assert.equal((await call('/functions/v1/guest', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"action":"read"}' })).status, 403)
  }
  assert.equal((await call('/functions/v1/guest', { method: 'GET' })).status, 405)
})

test('guest: cabeçalhos de IP enviados pelo cliente não escolhem a cota', async () => {
  const forged = ['203.0.113.99', '198.51.100.23']
  const token = track(randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''))
  for (const address of forged) {
    const response = await edge(config, token, 'exchange', {}, { 'X-Forwarded-For': address, 'CF-Connecting-IP': address })
    assert.equal(response.status, 401)
  }
  const used = await db.query('select count(*) n from private.guest_rate where key_hash = any($1::text[])', [forged.map(a => hash(`ip:${a}`))])
  assert.equal(used.rows[0].n, '0', 'endereço forjado não virou cota de IP')
})

test('guest: convite, presença, reserva idempotente, cancelamento e painel', async () => {
  assert.ok(f.event.ends_at, 'evento publicado com término')
  const exchange = await edge(config, f.invite.token, 'exchange', {}, { Origin: SITE_ORIGIN })
  assert.equal(exchange.status, 200); assert.equal(exchange.cache, 'no-store')
  access = exchange.data; track(access.session_token)
  assert.equal(access.snapshot.items.length, 27)
  assert.equal('owner_id' in access.snapshot.event, false); assert.equal('token_hash' in access.snapshot.invitation, false)
  assert.equal((await edge(config, access.session_token, 'read')).status, 200)
  const send = (action, payload) => edge(config, access.session_token, action, payload)
  assert.equal((await send('rsvp', { response: 'yes', attending: 2, version: 1, request_id: randomUUID() })).status, 200)
  const item = access.snapshot.items.find(i => i.diaper_size === 'P')
  const reserve = { item_id: item.id, quantity: 2, version: null, request_id: randomUUID() }
  assert.equal((await send('reserve', reserve)).status, 200)
  const replay = await send('reserve', reserve)
  assert.equal(replay.status, 200)
  assert.equal(replay.data.snapshot.items.find(i => i.id === item.id).committed, 2, 'replay não duplica')
  const dashboard = await f.call('organizer_invitations', { p_event_id: f.event.id })
  assert.equal(dashboard.invitations[0].attending, 2); assert.equal(dashboard.reservations.length, 1)
  const cancelled = await send('cancel', { item_id: item.id, version: 1, request_id: randomUUID() })
  assert.equal(cancelled.status, 200)
  assert.equal(cancelled.data.snapshot.items.find(i => i.id === item.id).committed, 0)
})

test('guest: revogação encerra a sessão existente', async () => {
  await f.call('organizer_invitations', { p_event_id: f.event.id, p_action: 'revoke', p_payload: { id: f.invite.id } })
  assert.equal((await edge(config, access.session_token, 'read')).status, 401)
})

test('anon não lê reservas, auditoria nem funções de retenção', async () => {
  assert.notEqual((await call('/rest/v1/reservations?select=id')).status, 200)
  assert.notEqual((await call('/rest/v1/retention_audit?select=id', { headers: { 'Accept-Profile': 'private' } })).status, 200)
  assert.notEqual((await call('/rest/v1/rpc/retention_run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200)
})

test('retention: exige segredo e não apaga evento que não venceu', async () => {
  assert.equal((await call('/functions/v1/retention', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
  const response = await call('/functions/v1/retention', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-retention-secret': retentionSecret() }, body: '{}' })
  assert.equal(response.status, 200)
  const current = (await db.query('select personal_data_purged_at, private_address from public.events where id=$1', [f.event.id])).rows[0]
  assert.equal(current.personal_data_purged_at, null); assert.notEqual(current.private_address, '')
  assert.equal(Number((await db.query('select count(*) n from private.invitations where event_id=$1', [f.event.id])).rows[0].n), 1)
})

test('cron: somente o job de retenção de 30 dias', async () => {
  const jobs = (await db.query("select jobname from cron.job where jobname in ('personal-data-retention','guest-data-retention') order by jobname")).rows.map(r => r.jobname)
  assert.deepEqual(jobs, ['personal-data-retention'])
})
