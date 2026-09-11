import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// Somente a stack local do CLI: nenhuma URL ou credencial remota é aceita.
let admin, alice, bob, functionsUrl, publicKey, databaseUrl
let aliceEvent, bobEvent
let aliceInvitation, bobInvitation
const userIds = []
const ALLOWED_ORIGIN = 'http://localhost:5173'

async function publishEvent(client) {
  const created = await client.rpc('create_event', { p_title: 'Chá fictício' }).single()
  assert.equal(created.error, null)
  const saved = await client.rpc('save_event', {
    p_event_id: created.data.id, p_version: created.data.version, p_title: 'Chá fictício',
    p_public_description: '', p_starts_at: new Date(Date.now() + 10 * 86400000).toISOString(),
    p_private_address: '', p_private_instructions: '', p_cover_path: null,
  }).single()
  assert.equal(saved.error, null)
  const published = await client.rpc('transition_event', { p_event_id: created.data.id, p_version: saved.data.version, p_status: 'published' }).single()
  assert.equal(published.error, null)
  return published.data
}

function call(body, { origin = ALLOWED_ORIGIN, credential, method = 'POST', contentType = 'application/json' } = {}) {
  const headers = { Origin: origin }
  if (contentType) headers['Content-Type'] = contentType
  if (credential) headers.Authorization = `Bearer ${credential}`
  return fetch(`${functionsUrl}/guest`, {
    method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
}

before(async () => {
  const config = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const url = new URL(config.API_URL)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'API de teste precisa ser local')
  assert.equal(url.port, '54321', 'usar apenas a porta da stack local do projeto')
  const db = new URL(config.DB_URL)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname))
  assert.equal(db.port, '54322')
  databaseUrl = config.DB_URL
  functionsUrl = config.FUNCTIONS_URL
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  admin = createClient(url.origin, config.SERVICE_ROLE_KEY ?? config.SECRET_KEY, options)
  publicKey = config.PUBLISHABLE_KEY ?? config.ANON_KEY
  async function organizer() {
    const email = `test-${randomUUID()}@example.test`
    const password = randomUUID()
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.equal(created.error, null); userIds.push(created.data.user.id)
    const client = createClient(url.origin, publicKey, options)
    const login = await client.auth.signInWithPassword({ email, password })
    assert.equal(login.error, null)
    return client
  }
  alice = await organizer(); bob = await organizer()
  aliceEvent = await publishEvent(alice)
  bobEvent = await publishEvent(bob)
  const aliceCreated = await alice.rpc('create_family_invitation', { p_event_id: aliceEvent.id, p_label: 'Família Alice', p_names: ['Ana', 'Beto'], p_expires_at: null })
  assert.equal(aliceCreated.error, null); aliceInvitation = aliceCreated.data
  const bobCreated = await bob.rpc('create_family_invitation', { p_event_id: bobEvent.id, p_label: 'Família Bob', p_names: ['Caio'], p_expires_at: null })
  assert.equal(bobCreated.error, null); bobInvitation = bobCreated.data
})
after(async () => {
  if (!admin || !userIds.length) return
  const connection = new pg.Client({ connectionString: databaseUrl })
  await connection.connect()
  try {
    await connection.query('delete from public.invitations where event_id in (select id from public.events where owner_id = any($1::uuid[]))', [userIds])
    await connection.query('delete from public.events where owner_id = any($1::uuid[])', [userIds])
  } finally { await connection.end() }
  for (const id of userIds) await admin.auth.admin.deleteUser(id)
})

test('Edge function real: preflight e origem não autorizada', async () => {
  const preflight = await call(undefined, { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)
  const denied = await call({ action: 'read' }, { origin: 'https://evil.example' })
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).error, 'ORIGIN_DENIED')
})

test('Edge function real: método, content-type e payload inválidos', async () => {
  const wrongMethod = await call(undefined, { method: 'GET' })
  assert.equal(wrongMethod.status, 405)
  const wrongContentType = await call({ action: 'read' }, { contentType: 'text/plain' })
  assert.equal(wrongContentType.status, 400)
  const oversized = await call({ action: 'read', padding: 'x'.repeat(5000) })
  assert.equal(oversized.status, 400)
  const malformedCredential = await call({ action: 'read' }, { credential: 'nao-e-um-hash' })
  assert.equal(malformedCredential.status, 401, 'credencial fora do formato nunca chega à leitura do convite')
  const extraField = await call({ action: 'read', extra: true }, { credential: 'a'.repeat(64) })
  assert.equal(extraField.status, 400, 'payload com campo extra é rejeitado mesmo com credencial bem formada')
  assert.equal((await extraField.json()).error, 'INVALID_REQUEST')
})

test('Edge function real: token inválido não abre sessão', async () => {
  const response = await call({ action: 'exchange', token: 'f'.repeat(64) })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error, 'GUEST_SESSION_INVALID')
})

test('Edge function real: troca de token, leitura e RSVP de ponta a ponta', async () => {
  const exchanged = await call({ action: 'exchange', token: aliceInvitation.token })
  assert.equal(exchanged.status, 200)
  const { session, expires_at } = await exchanged.json()
  assert.ok(/^[a-f0-9]{64}$/.test(session))
  assert.ok(new Date(expires_at).getTime() > Date.now())

  const read = await call({ action: 'read' }, { credential: session })
  assert.equal(read.status, 200)
  const invitation = await read.json()
  assert.equal(invitation.label, 'Família Alice')
  assert.equal(invitation.people.length, 2)

  const person = invitation.people[0]
  const rsvp = await call({ action: 'rsvp', person_id: person.id, response: 'yes', version: person.version }, { credential: session })
  assert.equal(rsvp.status, 200)
  const updated = await rsvp.json()
  assert.equal(updated.response, 'yes')
  assert.equal(updated.version, person.version + 1)

  const stale = await call({ action: 'rsvp', person_id: person.id, response: 'no', version: person.version }, { credential: session })
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).error, 'RSVP_VERSION_CONFLICT')
})

test('Edge function real: sessão de um convite não altera pessoa de outro convite', async () => {
  const exchanged = await call({ action: 'exchange', token: bobInvitation.token })
  assert.equal(exchanged.status, 200)
  const { session } = await exchanged.json()
  const aliceRead = await call({ action: 'read' }, { credential: session })
  const aliceInvitationLabel = (await aliceRead.json()).label
  assert.notEqual(aliceInvitationLabel, 'Família Alice')

  const alicePeople = await alice.from('invitations').select('invitation_people(id)').eq('id', aliceInvitation.id).single()
  assert.equal(alicePeople.error, null)
  const alicePersonId = alicePeople.data.invitation_people[0].id
  const crossRsvp = await call({ action: 'rsvp', person_id: alicePersonId, response: 'yes', version: 1 }, { credential: session })
  assert.equal(crossRsvp.status, 403)
  assert.equal((await crossRsvp.json()).error, 'PERSON_NOT_FOUND')
})

test('Edge function real: revogação encerra a sessão já emitida', async () => {
  const exchanged = await call({ action: 'exchange', token: aliceInvitation.token })
  const { session } = await exchanged.json()
  assert.equal((await call({ action: 'read' }, { credential: session })).status, 200)

  const revoked = await alice.rpc('revoke_family_invitation', { p_event_id: aliceEvent.id, p_invitation_id: aliceInvitation.id })
  assert.equal(revoked.error, null)

  const afterRevoke = await call({ action: 'read' }, { credential: session })
  assert.equal(afterRevoke.status, 401)
  assert.equal((await afterRevoke.json()).error, 'GUEST_SESSION_INVALID')

  const reopen = await call({ action: 'exchange', token: aliceInvitation.token })
  assert.equal(reopen.status, 401)
})
