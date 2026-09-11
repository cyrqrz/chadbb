import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// Somente a stack local do CLI: nenhuma URL ou credencial remota é aceita.
let admin, alice, bob, guest, event, aliceId, bobId, databaseUrl
const userIds = []
const objects = []
before(async () => {
  const config = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const url = new URL(config.API_URL)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'API de teste precisa ser local')
  assert.equal(url.port, '54321', 'usar apenas a porta da stack local do projeto')
  const db = new URL(config.DB_URL)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname))
  assert.equal(db.port, '54322')
  databaseUrl = config.DB_URL
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
    const connection = new pg.Client({ connectionString: databaseUrl })
    await connection.connect()
    try {
      await connection.query('delete from public.event_items where event_id in (select id from public.events where owner_id = any($1::uuid[]))', [userIds])
      await connection.query('delete from public.events where owner_id = any($1::uuid[])', [userIds])
    } finally { await connection.end() }
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
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

test('API real: catálogo e lista preservam propriedade, versão e encerramento', async () => {
  const catalog = await alice.from('products').select('id,title').eq('platform', 'manual').eq('external_reference', 'demo:manta').single()
  assert.equal(catalog.error, null, 'catálogo fictício local precisa estar carregado')
  const product = catalog.data
  assert.ok((await guest.from('products').select('id')).error)
  assert.ok((await alice.from('products').update({ title: 'Alteração indevida' }).eq('id', product.id)).error)
  const created = await alice.rpc('create_event', { p_title: 'Teste de lista fictícia' }).single()
  assert.equal(created.error, null)
  const listEvent = created.data
  const args = { p_event_id: listEvent.id, p_product_id: product.id, p_quantity: 2 }
  assert.ok((await bob.rpc('add_event_item', args)).error)
  const added = await alice.rpc('add_event_item', args).single()
  assert.equal(added.error, null)
  const item = added.data
  const own = await alice.from('event_items').select('id,quantity_requested,product:products(id,title)').eq('id', item.id).single()
  assert.equal(own.error, null)
  assert.equal(own.data.product.title, product.title)
  assert.equal(own.data.quantity_requested, 2)
  const other = await bob.from('event_items').select('*').eq('id', item.id)
  assert.equal(other.error, null)
  assert.deepEqual(other.data, [])
  assert.ok((await guest.from('event_items').select('*')).error)
  assert.ok((await alice.from('event_items').update({ quantity_requested: 99 }).eq('id', item.id)).error)
  assert.ok((await alice.from('event_items').delete().eq('id', item.id)).error)
  const update = { p_event_id: listEvent.id, p_item_id: item.id, p_version: item.version, p_quantity: 3 }
  assert.ok((await bob.rpc('set_event_item_quantity', update)).error)
  const changed = await alice.rpc('set_event_item_quantity', update).single()
  assert.equal(changed.error, null)
  assert.equal(changed.data.quantity_requested, 3)
  assert.equal((await alice.rpc('set_event_item_quantity', update)).error?.message, 'ITEM_VERSION_CONFLICT')
  const saved = await alice.rpc('save_event', { p_event_id: listEvent.id, p_version: listEvent.version, p_title: listEvent.title, p_public_description: '', p_starts_at: new Date(Date.now() + 86400000).toISOString(), p_private_address: '', p_private_instructions: '', p_cover_path: null }).single()
  assert.equal(saved.error, null)
  const published = await alice.rpc('transition_event', { p_event_id: listEvent.id, p_version: saved.data.version, p_status: 'published' }).single()
  assert.equal(published.error, null)
  const closed = await alice.rpc('transition_event', { p_event_id: listEvent.id, p_version: published.data.version, p_status: 'closed' }).single()
  assert.equal(closed.error, null)
  assert.equal((await alice.rpc('set_event_item_quantity', { ...update, p_version: changed.data.version })).error?.message, 'EVENT_CLOSED')
  assert.equal((await alice.rpc('add_event_item', args)).error?.message, 'EVENT_CLOSED')
})
