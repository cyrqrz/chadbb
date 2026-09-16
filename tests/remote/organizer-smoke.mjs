// Dry-run por padrão. Execução remota exige aprovação humana e ref explícito.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { localConfig } from '../support/local.mjs'

const ref = 'fcykqrlnofmdtmewlejr'
const args = process.argv.slice(2)
const local = args.includes('--local')
const remote = args.includes('--remote')
const injectFailure = args.includes('--fail-after-list')
const plan = {
  project: ref, users: 2, events: 1, items: 27,
  operations: ['create', 'save', 'prepare_family_list', 'set_event_item_quantity', 'publish', 'cross_user_denial'],
  cleanup: 'somente contas @example.test exclusivas desta execução e seus eventos/itens',
  excluded: ['email', 'Storage', 'guest', 'retention', 'rate limits', 'dados reais'],
}
if (!args.length || (args.length === 1 && args[0] === '--dry-run')) {
  console.log(JSON.stringify({ mode: 'dry-run, sem conexões ou leitura de credenciais', ...plan }, null, 2))
  process.exit(0)
}
if (args.some(a => !['--local', '--remote', '--fail-after-list'].includes(a)) || local === remote || (remote && injectFailure)) {
  console.error('Use --dry-run, --local [--fail-after-list] ou --remote.'); process.exit(1)
}
if (remote && process.env.CHADBB_SMOKE_REF !== ref) {
  console.error('Projeto remoto não confirmado; nada executado.'); process.exit(1)
}

let db, connected = false, phase = 'configuração', failed = false
const emails = Array.from({ length: 2 }, () => `smoke-organizer-${randomUUID()}@example.test`)
const eventIds = []
const clients = []
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const ok = response => { assert.equal(response.error, null); return response.data }
try {
  let config
  if (local) {
    const c = localConfig()
    config = { url: c.API_URL, key: c.PUBLISHABLE_KEY, secret: c.SERVICE_ROLE_KEY ?? c.SECRET_KEY }
    db = new pg.Client({ connectionString: c.DB_URL, connectionTimeoutMillis: 15000 })
  } else {
    const root = join(homedir(), '.config/chadbb')
    const raw = JSON.parse(execFileSync('node_modules/.bin/supabase', ['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }))
    const keys = Array.isArray(raw) ? raw : raw.keys ?? []
    const key = keys.find(k => k.type === 'publishable' || k.name === 'publishable')?.api_key
    const secret = keys.find(k => k.type === 'secret' || k.name === 'secret')?.api_key
    assert.match(key ?? '', /^sb_publishable_/); assert.match(secret ?? '', /^sb_secret_/)
    config = { url: `https://${ref}.supabase.co`, key, secret }
    db = new pg.Client({ host: 'aws-0-sa-east-1.pooler.supabase.com', port: 5432,
      user: `postgres.${ref}`, database: 'postgres',
      password: readFileSync(join(root, 'chadbb-cha.db-password'), 'utf8').trim(),
      ssl: { ca: readFileSync(new URL('../../scripts/backup/supabase-ca.crt', import.meta.url), 'utf8'), rejectUnauthorized: true },
      connectionTimeoutMillis: 15000 })
  }
  await db.connect(); connected = true
  if (remote) assert.equal(db.connection.stream.authorized, true)
  const admin = createClient(config.url, config.secret, opts)
  const rpc = async (client, name, body) => ok(await client.rpc(name, body).single())
  phase = 'criação e login de duas contas fictícias'
  for (const email of emails) {
    const password = randomUUID()
    ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
    const client = createClient(config.url, config.key, opts); clients.push(client)
    ok(await client.auth.signInWithPassword({ email, password }))
  }
  const [owner, other] = clients
  phase = 'criar e editar rascunho'
  let event = await rpc(owner, 'create_event', { p_title: 'Ensaio fictício T-B4' })
  eventIds.push(event.id)
  assert.equal(event.status, 'draft')
  const saveArgs = { p_event_id: event.id, p_version: event.version, p_title: 'Ensaio fictício T-B4 editado',
    p_public_description: 'Dados sintéticos', p_starts_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    p_ends_at: new Date(Date.now() + 30 * 86400000 + 3600000).toISOString(),
    p_private_address: 'Endereço fictício', p_private_instructions: 'Ensaio', p_cover_path: null }
  event = await rpc(owner, 'save_event', saveArgs)
  assert.equal(event.title, saveArgs.p_title); assert.ok(event.version > saveArgs.p_version)
  phase = 'montar e editar lista'
  assert.equal(ok(await owner.rpc('prepare_family_list', { p_event_id: event.id })), 27)
  const items = ok(await owner.from('event_items').select('*').eq('event_id', event.id))
  assert.equal(items.length, 27)
  const item = items.find(i => i.diaper_size === 'P')
  const quantityArgs = { p_event_id: event.id, p_item_id: item.id, p_version: item.version, p_quantity: 5 }
  const changed = await rpc(owner, 'set_event_item_quantity', quantityArgs)
  assert.equal(changed.quantity_requested, 5); assert.ok(changed.version > item.version)
  if (injectFailure) { phase = 'falha injetada após lista'; throw new Error('injected') }
  phase = 'acesso cruzado antes da publicação'
  assert.deepEqual(ok(await other.from('events').select('id').eq('id', event.id)), [])
  assert.deepEqual(ok(await other.from('event_items').select('id').eq('event_id', event.id)), [])
  for (const [name, payload, expected] of [
    ['save_event', { ...saveArgs, p_version: event.version, p_title: 'Tentativa cruzada' }, 'EVENT_NOT_FOUND'],
    ['transition_event', { p_event_id: event.id, p_version: event.version, p_status: 'published' }, 'EVENT_NOT_FOUND'],
    ['set_event_item_quantity', { ...quantityArgs, p_version: changed.version, p_quantity: 4 }, 'EVENT_NOT_FOUND'],
  ]) assert.equal((await other.rpc(name, payload)).error?.message, expected)
  phase = 'publicação e estado final'
  const published = await rpc(owner, 'transition_event', { p_event_id: event.id, p_version: event.version, p_status: 'published' })
  assert.equal(published.status, 'published'); assert.ok(published.version > event.version)
  assert.equal(published.title, saveArgs.p_title)
  const persisted = ok(await owner.from('event_items').select('*').eq('id', item.id).single())
  assert.equal(persisted.quantity_requested, 5); assert.equal(persisted.version, changed.version)
  assert.deepEqual(ok(await other.from('events').select('id').eq('id', event.id)), [])
  assert.deepEqual(ok(await other.from('event_items').select('id').eq('event_id', event.id)), [])
  console.log('PASS: criar, editar, montar lista, publicar e negar acesso cruzado.')
} catch {
  failed = true
  // SDK/pg podem incluir credenciais ou payloads em erros; não imprimir exceção.
  console.error(`FAIL: ${phase}`)
} finally {
  if (connected) {
    try {
      await db.query('begin')
      // E-mails UUID foram gerados antes das chamadas: cobre resposta perdida na criação.
      const ids = (await db.query('select id from auth.users where email=any($1::text[])', [emails])).rows.map(r => r.id)
      await db.query('delete from public.event_items where event_id in (select id from public.events where owner_id=any($1::uuid[]))', [ids])
      await db.query('delete from public.events where owner_id=any($1::uuid[])', [ids])
      await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
      const counts = (await db.query(`select
        (select count(*)::int from auth.users where email=any($1::text[])) users,
        (select count(*)::int from public.events where owner_id=any($2::uuid[]) or id=any($3::uuid[])) events,
        (select count(*)::int from public.event_items where event_id=any($3::uuid[])) items`, [emails, ids, eventIds])).rows[0]
      assert.deepEqual(counts, { users: 0, events: 0, items: 0 })
      await db.query('commit')
      console.log('PASS: limpeza restrita confirmada — users=0 events=0 items=0.')
    } catch {
      await db.query('rollback').catch(() => {})
      failed = true; console.error('FAIL: limpeza; não repetir execução antes de investigar dados fictícios remanescentes.')
    }
  }
  await db?.end().catch(() => {})
}
process.exitCode = failed ? 1 : 0
