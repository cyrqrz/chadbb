import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { cleanupUsers, localConfig } from '../support/local.mjs'

// Somente a stack local do CLI: nenhuma URL ou credencial remota é aceita.
let admin, alice, bob, guest, event, aliceId, bobId
const userIds = []
const objects = []
before(async () => {
  const config = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const url = new URL(config.API_URL)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'API de teste precisa ser local')
  assert.equal(url.port, '54321', 'usar apenas a porta da stack local do projeto')
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  admin = createClient(url.origin, config.SERVICE_ROLE_KEY ?? config.SECRET_KEY, options)
  const publicKey = config.PUBLISHABLE_KEY ?? config.ANON_KEY
  guest = createClient(url.origin, publicKey, options)
  async function organizer() {
    const email = `test-${randomUUID()}@example.test`
    const password = randomUUID()
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.equal(created.error, null); userIds.push(created.data.user.id)
    const client = createClient(url.origin, publicKey, options)
    const login = await client.auth.signInWithPassword({ email, password })
    assert.equal(login.error, null)
    return [client, created.data.user.id]
  }
  ;[alice, aliceId] = await organizer(); [bob, bobId] = await organizer()
})
after(async () => {
  if (!admin) return
  if (objects.length) {
    for (const bucket of ['event-public', 'event-private']) await admin.storage.from(bucket).remove(objects)
  }
  if (userIds.length) {
    await cleanupUsers(localConfig(), userIds)
  }
})
test('API real: organizador cria evento e RLS impede leitura e escritas cruzadas', async () => {
  const created = await alice.rpc('create_event', { p_title: 'Ensaio fictício' }).single()
  assert.equal(created.error, null); event = created.data
  assert.equal(event.owner_id, aliceId)
  assert.equal((await alice.from('events').select('*').eq('id', event.id)).data.length, 1)
  assert.deepEqual((await bob.from('events').select('*').eq('id', event.id)).data, [])
  assert.ok((await guest.from('events').select('*')).error)
  assert.ok((await bob.from('events').insert({ owner_id: aliceId })).error)
  assert.ok((await alice.from('events').update({ owner_id: bobId }).eq('id', event.id)).error)
  assert.ok((await bob.from('events').delete().eq('id', event.id)).error)
  assert.ok((await bob.rpc('transition_event', { p_event_id: event.id, p_version: 1, p_status: 'published' })).error)
})
test('Storage real: upload, limite, tipo e acesso privado entre proprietários', async () => {
  const path = `${aliceId}/${event.id}/${randomUUID()}.png`; objects.push(path)
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64')
  assert.equal((await alice.storage.from('event-private').upload(path, bytes, { contentType: 'image/png' })).error, null)
  assert.equal((await alice.storage.from('event-private').download(path)).error, null)
  assert.ok((await bob.storage.from('event-private').download(path)).error)
  assert.ok((await guest.storage.from('event-private').download(path)).error)
  assert.ok((await bob.storage.from('event-public').upload(path, bytes, { contentType: 'image/png' })).error)
  assert.ok((await alice.storage.from('event-public').upload(`${aliceId}/${event.id}/invalid.svg`, '<svg/>', { contentType: 'image/svg+xml' })).error)
  assert.ok((await alice.storage.from('event-public').upload(`${aliceId}/${event.id}/oversized.png`, Buffer.alloc(5242881), { contentType: 'image/png' })).error)
  assert.equal((await alice.storage.from('event-public').upload(path, bytes, { contentType: 'image/png' })).error, null)
})
test('API real: salva, publica, encerra; edição encerrada rejeitada', async () => {
  const args = { p_event_id: event.id, p_version: event.version, p_title: event.title, p_public_description: 'Prévia',
    p_starts_at: new Date(Date.now() + 86400000).toISOString(), p_private_address: 'Rua fictícia', p_private_instructions: '', p_cover_path: objects[0] }
  const saved = await alice.rpc('save_event', args).single(); assert.equal(saved.error, null)
  const published = await alice.rpc('transition_event', { p_event_id: event.id, p_version: saved.data.version, p_status: 'published' }).single(); assert.equal(published.error, null)
  const closed = await alice.rpc('transition_event', { p_event_id: event.id, p_version: published.data.version, p_status: 'closed' }).single(); assert.equal(closed.error, null)
  assert.equal(closed.data.status, 'closed')
  assert.equal((await alice.rpc('save_event', { ...args, p_version: closed.data.version })).error?.message, 'EVENT_CLOSED')
})
