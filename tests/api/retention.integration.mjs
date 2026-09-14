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
    const { data } = await f.admin.storage.from('event-public').list(`${f.userId}/${f.event.id}`)
    if (data?.length) await f.admin.storage.from('event-public').remove(data.map(o => `${f.userId}/${f.event.id}/${o.name}`))
    await f.cleanup()
  }
  await db?.end()
})

async function created() { const f = await fixture(config); fixtures.push(f); return f }
function retention(headers = { 'x-retention-secret': secret }, method = 'POST') {
  return fetch(`${config.API_URL}/functions/v1/retention`, { method, headers: { apikey: config.PUBLISHABLE_KEY, 'Content-Type': 'application/json', ...headers },
    body: method === 'POST' ? '{}' : undefined }).then(async r => ({ status: r.status, data: await r.json() }))
}
async function upload(f, name) {
  const path = `${f.userId}/${f.event.id}/${name}`
  const result = await f.owner.storage.from('event-public').upload(path, png, { contentType: 'image/png' })
  assert.equal(result.error, null)
  return path
}
async function stored(f) {
  const { data, error } = await f.admin.storage.from('event-public').list(`${f.userId}/${f.event.id}`)
  assert.equal(error, null)
  return data.map(o => o.name).sort()
}
async function withGuestData(f) {
  const access = (await edge(config, f.invite.token, 'exchange')).data
  const send = (action, payload) => edge(config, access.session_token, action, { ...payload, request_id: randomUUID() })
  assert.equal((await send('rsvp', { response: 'yes', attending: 2, version: 1 })).status, 200)
  const item = access.snapshot.items.find(i => i.diaper_size === 'P')
  assert.equal((await send('reserve', { item_id: item.id, quantity: 2, version: null })).status, 200)
}
const expire = eventId => db.query("update public.events set ends_at=now()-interval '31 days', starts_at=now()-interval '31 days 4 hours' where id=$1", [eventId])
const event = async id => (await db.query('select * from public.events where id=$1', [id])).rows[0]
async function guestData(eventId) {
  const scope = 'where invitation_id in (select id from private.invitations where event_id=$1)'
  const n = async sql => Number((await db.query(sql, [eventId])).rows[0].n)
  return [await n('select count(*) n from private.invitations where event_id=$1'), await n(`select count(*) n from private.guest_requests ${scope}`),
    await n(`select count(*) n from public.reservations ${scope}`), await n(`select count(*) n from private.guest_sessions ${scope}`)]
}
const audit = async eventId => (await db.query('select status, storage_objects_removed from private.retention_audit where event_id=$1 order by id', [eventId])).rows

test('Edge retention: exige segredo e aceita somente POST', async () => {
  assert.equal((await retention({})).status, 401)
  assert.equal((await retention({ 'x-retention-secret': 'x'.repeat(secret.length) })).status, 401)
  assert.equal((await retention({ 'x-retention-secret': secret }, 'GET')).status, 405)
})

test('Edge retention: remove arquivos exclusivos, preserva compartilhados, dados do evento e conta', async () => {
  const a = await created(); const b = await created()
  const exclusive = await upload(a, 'capa.png')
  const shared = await upload(a, 'compartilhada.png')
  await db.query('update public.events set cover_path=$1 where id=$2', [exclusive, a.event.id])
  await db.query('update public.events set cover_path=$1 where id=$2', [shared, b.event.id])
  await withGuestData(a)
  await expire(a.event.id)
  const before = await event(a.event.id); const bBefore = await event(b.event.id)

  const first = await retention()
  assert.equal(first.status, 200, JSON.stringify(first.data))
  assert.ok(first.data.purged >= 1)
  assert.deepEqual(await stored(a), ['compartilhada.png'], 'exclusivo removido, referenciado por outro evento preservado')
  assert.deepEqual(await guestData(a.event.id), [0, 0, 0, 0])
  const after = await event(a.event.id)
  assert.deepEqual([after.private_address, after.private_instructions, after.cover_path], ['', '', null])
  for (const field of ['id', 'title', 'starts_at', 'ends_at', 'status']) assert.deepEqual(after[field], before[field], field)
  assert.ok(after.personal_data_purged_at)
  assert.equal((await a.admin.auth.admin.getUserById(a.userId)).data.user?.id, a.userId, 'conta do organizador permanece')
  assert.deepEqual(await audit(a.event.id), [{ status: 'purged', storage_objects_removed: 1 }])
  assert.deepEqual(await event(b.event.id), bBefore, 'outro evento intacto')
  assert.equal((await guestData(b.event.id))[0], 1)

  const second = await retention()
  assert.equal(second.status, 200)
  assert.deepEqual(await event(a.event.id), after, 'segunda execução não altera nada')
  assert.deepEqual(await stored(a), ['compartilhada.png'])
  assert.deepEqual(await audit(a.event.id), [{ status: 'purged', storage_objects_removed: 1 }])
})

test('Edge retention: Storage apagado e falha no banco é concluído na execução seguinte', async () => {
  const c = await created()
  await upload(c, 'capa.png')
  await withGuestData(c)
  await expire(c.event.id)
  try {
    await db.query('revoke execute on function public.retention_purge_event(uuid,integer) from service_role')
    const failed = await retention()
    assert.equal(failed.status, 200)
    assert.ok(failed.data.db_failed >= 1)
    assert.deepEqual(await stored(c), [], 'arquivos já removidos')
    assert.equal((await event(c.event.id)).personal_data_purged_at, null, 'marca só após o banco concluir')
    assert.deepEqual(await guestData(c.event.id), [1, 2, 1, 1], 'banco intacto após a falha')
    assert.deepEqual(await audit(c.event.id), [{ status: 'db_failed', storage_objects_removed: 1 }])
  } finally {
    await db.query('grant execute on function public.retention_purge_event(uuid,integer) to service_role')
  }
  const recovered = await retention()
  assert.equal(recovered.status, 200, JSON.stringify(recovered.data))
  assert.deepEqual(await stored(c), [])
  assert.deepEqual(await guestData(c.event.id), [0, 0, 0, 0])
  assert.ok((await event(c.event.id)).personal_data_purged_at)
  assert.deepEqual(await audit(c.event.id), [{ status: 'db_failed', storage_objects_removed: 1 }, { status: 'purged', storage_objects_removed: 0 }])
})
