import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { localConfig, localDatabase, fixture, edge } from '../support/local.mjs'

// Segredo fictício do ambiente local (supabase/functions/local-test.env), nunca o do projeto remoto.
const secret = readFileSync(new URL('../../supabase/functions/local-test.env', import.meta.url), 'utf8')
  .match(/^RETENTION_CRON_SECRET=(.+)$/m)[1].trim()
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
let config, db
const fixtures = []
before(async () => { config = localConfig(); db = await localDatabase(config) })
after(async () => {
  for (const f of fixtures) {
    for (const bucket of ['event-public', 'event-private']) {
      const { data } = await f.admin.storage.from(bucket).list(`${f.userId}/${f.event.id}`)
      if (data?.length) await f.admin.storage.from(bucket).remove(data.map(o => `${f.userId}/${f.event.id}/${o.name}`))
    }
    await db.query('delete from private.event_deletions where event_id=$1', [f.event.id])
    await f.cleanup()
  }
  await db?.end()
})

async function created() { const f = await fixture(config); fixtures.push(f); return f }
function remove(f, body, { token = f.session.access_token, method = 'POST', origin } = {}) {
  return fetch(`${config.API_URL}/functions/v1/delete-event`, { method,
    headers: { apikey: config.PUBLISHABLE_KEY, 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined })
    .then(async r => ({ status: r.status, cache: r.headers.get('cache-control'), data: await r.json().catch(() => null) }))
}
const retention = () => fetch(`${config.API_URL}/functions/v1/retention`, { method: 'POST',
  headers: { apikey: config.PUBLISHABLE_KEY, 'Content-Type': 'application/json', 'x-retention-secret': secret }, body: '{}' })
  .then(async r => ({ status: r.status, data: await r.json() }))
async function upload(f, bucket, name) {
  const path = `${f.userId}/${f.event.id}/${name}`
  const result = await f.owner.storage.from(bucket).upload(path, png, { contentType: 'image/png' })
  assert.equal(result.error, null)
  return path
}
async function stored(f) {
  const names = []
  for (const bucket of ['event-public', 'event-private']) {
    const { data, error } = await f.admin.storage.from(bucket).list(`${f.userId}/${f.event.id}`)
    assert.equal(error, null)
    names.push(...data.map(o => `${bucket}/${o.name}`))
  }
  return names.sort()
}
// Evento encerrado com capa pública, arquivo privado, presença e reserva.
async function closedWithData(f) {
  const cover = await upload(f, 'event-public', 'capa.png')
  await upload(f, 'event-private', 'documento.png')
  const e = f.event
  f.event = await f.call('save_event', { p_event_id: e.id, p_version: e.version, p_title: e.title, p_public_description: e.public_description,
    p_starts_at: e.starts_at, p_ends_at: e.ends_at, p_private_address: e.private_address, p_private_instructions: e.private_instructions, p_cover_path: cover })
  const access = (await edge(config, f.invite.token, 'exchange')).data
  const send = (action, payload) => edge(config, access.session_token, action, { ...payload, request_id: randomUUID() })
  assert.equal((await send('rsvp', { response: 'yes', attending: 2, version: 1 })).status, 200)
  const item = access.snapshot.items.find(i => i.diaper_size === 'P')
  assert.equal((await send('reserve', { item_id: item.id, quantity: 2, version: null })).status, 200)
  f.event = await f.call('transition_event', { p_event_id: f.event.id, p_version: f.event.version, p_status: 'closed' })
  return access.session_token
}
async function rows(eventId) {
  const n = async sql => Number((await db.query(sql, [eventId])).rows[0].n)
  const scope = 'where invitation_id in (select id from private.invitations where event_id=$1)'
  return [await n('select count(*) n from public.events where id=$1'), await n('select count(*) n from public.event_items where event_id=$1'),
    await n('select count(*) n from private.invitations where event_id=$1'), await n(`select count(*) n from public.reservations ${scope}`)]
}
const deletion = async eventId => (await db.query(`select previous_status, items_removed, invitations_removed, guest_requests_removed,
  reservations_removed, guest_sessions_removed, storage_prefix, storage_objects_removed, storage_failures, storage_cleaned_at is not null cleaned
  from private.event_deletions where event_id=$1`, [eventId])).rows[0]

test('Edge delete-event: método, origem, payload e sessão', async () => {
  const f = await created()
  const body = { event_id: f.event.id, version: f.event.version }
  assert.equal((await remove(f, body, { method: 'GET' })).status, 405)
  assert.deepEqual((await remove(f, body, { origin: 'https://example.test' })).data, { error: 'ORIGIN_DENIED' })
  const anonymous = await remove(f, body, { token: null })
  assert.deepEqual([anonymous.status, anonymous.data], [401, { error: 'AUTH_REQUIRED' }])
  assert.deepEqual((await remove(f, body, { token: 'nao-e-um-jwt' })).data, { error: 'AUTH_REQUIRED' })
  for (const invalid of [{}, { event_id: 'x', version: 1 }, { event_id: f.event.id }, { event_id: f.event.id, version: '1' }]) {
    const result = await remove(f, invalid)
    assert.deepEqual([result.status, result.data], [400, { error: 'INVALID_PAYLOAD' }], JSON.stringify(invalid))
  }
  assert.deepEqual(await rows(f.event.id), [1, 27, 1, 0])
})

test('Edge delete-event: recusa publicado, versão antiga e evento alheio sem apagar nada', async () => {
  const f = await created(); const other = await created()
  const published = await remove(f, { event_id: f.event.id, version: f.event.version })
  assert.deepEqual([published.status, published.data, published.cache], [409, { error: 'EVENT_NOT_DELETABLE' }, 'no-store'])
  await closedWithData(f)
  assert.deepEqual((await remove(f, { event_id: f.event.id, version: f.event.version - 1 })).data, { error: 'EVENT_VERSION_CONFLICT' })
  const foreign = await remove(other, { event_id: f.event.id, version: f.event.version })
  assert.deepEqual([foreign.status, foreign.data], [404, { error: 'EVENT_NOT_FOUND' }])
  assert.deepEqual((await remove(f, { event_id: randomUUID(), version: 1 })).data, { error: 'EVENT_NOT_FOUND' })
  assert.deepEqual(await rows(f.event.id), [1, 27, 1, 1])
  assert.deepEqual(await stored(f), ['event-private/documento.png', 'event-public/capa.png'])
  assert.equal(await deletion(f.event.id), undefined)
})

test('Edge delete-event: exclui encerrado, remove capa e arquivos e invalida o convidado', async () => {
  const f = await created()
  const session = await closedWithData(f)
  const result = await remove(f, { event_id: f.event.id, version: f.event.version })
  assert.equal(result.status, 200, JSON.stringify(result.data))
  assert.deepEqual(result.data, { event_id: f.event.id, items_removed: 27, invitations_removed: 1, reservations_removed: 1, storage_cleanup: 'done' })
  assert.deepEqual(await rows(f.event.id), [0, 0, 0, 0])
  assert.deepEqual(await stored(f), [])
  const cover = await fetch(`${config.API_URL}/storage/v1/object/public/event-public/${f.userId}/${f.event.id}/capa.png`)
  assert.equal(cover.status >= 400, true, 'capa pública deixa de ser servida')
  await cover.body?.cancel()
  assert.equal((await edge(config, session, 'read')).status, 401)
  assert.equal((await edge(config, f.invite.token, 'exchange')).status, 401)
  assert.deepEqual(await deletion(f.event.id), { previous_status: 'closed', items_removed: 27, invitations_removed: 1, guest_requests_removed: 2,
    reservations_removed: 1, guest_sessions_removed: 1, storage_prefix: null, storage_objects_removed: 2, storage_failures: 0, cleaned: true })
  const again = await remove(f, { event_id: f.event.id, version: f.event.version })
  assert.deepEqual([again.status, again.data], [404, { error: 'EVENT_NOT_FOUND' }])
  const owner = await f.owner.from('events').select('id').eq('id', f.event.id)
  assert.deepEqual(owner.data, [], 'painel não encontra o evento')
})

test('Edge delete-event: falha ao concluir a limpeza fica pendente e a retention conclui', async () => {
  const f = await created()
  await closedWithData(f)
  try {
    await db.query('revoke execute on function public.event_deletion_storage_done(uuid,integer) from service_role')
    const result = await remove(f, { event_id: f.event.id, version: f.event.version })
    assert.equal(result.status, 200, JSON.stringify(result.data))
    assert.equal(result.data.storage_cleanup, 'pending')
    assert.deepEqual(await rows(f.event.id), [0, 0, 0, 0], 'banco concluído mesmo com a pendência')
    const pending = await deletion(f.event.id)
    assert.deepEqual([pending.storage_prefix, pending.storage_failures, pending.cleaned], [`${f.userId}/${f.event.id}`, 1, false])
  } finally {
    await db.query('grant execute on function public.event_deletion_storage_done(uuid,integer) to service_role')
  }
  const run = await retention()
  assert.equal(run.status, 200, JSON.stringify(run.data))
  assert.ok(run.data.deleted_events_cleaned >= 1)
  assert.deepEqual(await stored(f), [])
  const done = await deletion(f.event.id)
  assert.deepEqual([done.storage_prefix, done.storage_failures, done.cleaned], [null, 1, true])
})
