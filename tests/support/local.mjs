import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
export function localConfig() {
  const config = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  for (const [value, port] of [[config.API_URL, '54321'], [config.DB_URL, '54322']]) {
    const url = new URL(value)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.equal(url.port, port)
  }
  return config
}
export async function localDatabase(config) {
  const client = new pg.Client({ connectionString: config.DB_URL })
  await client.connect()
  return client
}
export async function cleanupUsers(config, ids) {
  if (!ids.length) return
  const db = await localDatabase(config)
  try {
    await db.query('begin')
    await db.query('delete from private.guest_requests where invitation_id in (select id from private.invitations where event_id in (select id from public.events where owner_id=any($1::uuid[])))', [ids])
    await db.query('delete from public.reservations where invitation_id in (select id from private.invitations where event_id in (select id from public.events where owner_id=any($1::uuid[])))', [ids])
    await db.query('delete from private.invitations where event_id in (select id from public.events where owner_id=any($1::uuid[]))', [ids])
    await db.query('delete from public.event_items where event_id in (select id from public.events where owner_id=any($1::uuid[]))', [ids])
    await db.query('delete from private.retention_audit where event_id in (select id from public.events where owner_id=any($1::uuid[]))', [ids])
    await db.query('delete from public.events where owner_id=any($1::uuid[])', [ids])
    await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
    await db.query('commit')
  } catch (error) { await db.query('rollback'); throw error } finally { await db.end() }
}
export async function fixture(config) {
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY ?? config.SECRET_KEY, opts)
  const owner = createClient(config.API_URL, config.PUBLISHABLE_KEY, opts)
  const email = `test-${randomUUID()}@example.test`; const password = randomUUID()
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  assert.equal(created.error, null)
  const userId = created.data.user.id
  try {
    const login = await owner.auth.signInWithPassword({ email, password }); assert.equal(login.error, null)
    const call = async (name, body) => { const result = await owner.rpc(name, body); assert.equal(result.error, null, result.error?.message); return result.data }
    let event = (await call('create_event', { p_title: 'Chá de bebê — ensaio fictício' }))
    event = (await call('save_event', { p_event_id: event.id, p_version: event.version, p_title: event.title,
      p_public_description: 'Vamos celebrar essa chegada com muito carinho.', p_starts_at: new Date(Date.now() + 30 * 86400000).toISOString(), p_ends_at: new Date(Date.now() + 30 * 86400000 + 4 * 3600000).toISOString(),
      p_private_address: 'Jardim de teste, 123', p_private_instructions: 'Conteúdo fictício para ensaio.', p_cover_path: null }))
    await call('prepare_family_list', { p_event_id: event.id })
    event = (await call('transition_event', { p_event_id: event.id, p_version: event.version, p_status: 'published' }))
    const invite = await call('organizer_invitations', { p_event_id: event.id, p_action: 'create', p_payload: { name: 'Família de teste', kind: 'family', capacity: 3 } })
    return { owner, admin, event, invite, userId, session: login.data.session, call, cleanup: () => cleanupUsers(config, [userId]) }
  } catch (error) { await cleanupUsers(config, [userId]); throw error }
}
export async function edge(config, token, action, payload = {}, extraHeaders = {}) {
  const response = await fetch(`${config.API_URL}/functions/v1/guest`, { method: 'POST',
    headers: { apikey: config.PUBLISHABLE_KEY, 'Content-Type': 'application/json', ...(action === 'exchange' ? {} : { Authorization: `Bearer ${token}` }), ...extraHeaders },
    body: JSON.stringify({ action, ...(action === 'exchange' ? { token } : { payload }) }) })
  return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() }
}
