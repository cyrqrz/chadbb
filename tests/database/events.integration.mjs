import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import EmbeddedPostgres from 'embedded-postgres'

let server, admin, directory
const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'chadbb-test-db-'))
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  server = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), port, user: 'postgres', password: 'local-test-only',
    persistent: false, initdbFlags: ['--locale=C', '--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} })
  await server.initialise(); await server.start()
  admin = server.getPgClient(); await admin.connect()
  await admin.query(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'))
  const migrationDir = new URL('../../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
    await admin.query(await readFile(new URL(name, migrationDir), 'utf8'))
  }
  await admin.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [alice, 'alice@example.test', bob, 'bob@example.test'])
}, { timeout: 60_000 })
after(async () => { await admin?.end(); if (server) await server.stop(); if (directory) await rm(directory, { recursive: true, force: true }) })
async function connectAs(user, role = 'authenticated') {
  const client = server.getPgClient(); await client.connect()
  await client.query(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`)
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ''])
  return client
}
async function as(user, sql, values = [], role = 'authenticated') {
  const client = await connectAs(user, role)
  try { return await client.query(sql, values) } finally { await client.end() }
}
async function create(user = alice, title = 'Chá de bebê') {
  return (await as(user, 'select * from public.create_event($1)', [title])).rows[0]
}
async function save(event, user = alice, options = {}) {
  return (await as(user, 'select * from public.save_event($1,$2,$3,$4,$5,$6,$7,$8)',
    [event.id, event.version, options.title ?? event.title, options.description ?? '', options.date === undefined ? new Date(Date.now()+86400000).toISOString() : options.date,
      'Endereço privado', 'Instruções privadas', options.cover ?? null])).rows[0]
}
async function transition(event, status, user = alice) {
  return (await as(user, 'select * from public.transition_event($1,$2,$3)', [event.id, event.version, status])).rows[0]
}

test('migrations em banco limpo: schema privado e funções negados por padrão', async () => {
  for (const role of ['anon', 'authenticated']) {
    const { rows } = await admin.query("select has_schema_privilege($1,'private','usage') allowed", [role])
    assert.equal(rows[0].allowed, false)
  }
  await admin.query('create function public.test_ungranted() returns integer language sql as $$ select 1 $$')
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await admin.query("select has_function_privilege($1,'public.test_ungranted()','execute') allowed", [role])).rows[0].allowed, false)
  }
})
test('dois organizadores leem somente seus próprios eventos; anon não lê', async () => {
  const a = await create(); const b = await create(bob)
  assert.equal((await as(alice, 'select * from public.events where id=$1', [a.id])).rowCount, 1)
  assert.equal((await as(bob, 'select * from public.events where id=$1', [a.id])).rowCount, 0)
  assert.equal((await as(alice, 'select * from public.events where id=$1', [b.id])).rowCount, 0)
  await assert.rejects(as(null, 'select * from public.events', [], 'anon'), { code: '42501' })
})
test('inserção, troca de dono, status, edição e exclusão diretas são proibidas', async () => {
  const event = await create()
  for (const user of [alice, bob]) {
    await assert.rejects(as(user, 'insert into public.events(owner_id) values ($1)', [bob]), { code: '42501' })
    await assert.rejects(as(user, 'update public.events set owner_id=$1 where id=$2', [bob, event.id]), { code: '42501' })
    await assert.rejects(as(user, "update public.events set status='published' where id=$1", [event.id]), { code: '42501' })
    await assert.rejects(as(user, "update public.events set title='invadido' where id=$1", [event.id]), { code: '42501' })
    await assert.rejects(as(user, 'delete from public.events where id=$1', [event.id]), { code: '42501' })
  }
})
test('RPCs negam ID alheio e ator não autenticado', async () => {
  const event = await create()
  await assert.rejects(save(event, bob), /EVENT_NOT_FOUND/)
  await assert.rejects(transition(event, 'published', bob), /EVENT_NOT_FOUND/)
  await assert.rejects(create(null), /AUTH_REQUIRED/)
  await assert.rejects(as(null, "select public.create_event('x')", [], 'anon'), { code: '42501' })
})
test('publicação exige título e data futura também fora da interface', async () => {
  let event = await create(alice, '')
  await assert.rejects(transition(event, 'published'), /PUBLICATION_INVALID/)
  event = await save(event, alice, { title: '', date: new Date(Date.now()+86400000).toISOString() })
  await assert.rejects(transition(event, 'published'), /PUBLICATION_INVALID/)
  event = await save(event, alice, { title: 'Encontro', date: '2020-01-01T00:00:00Z' })
  await assert.rejects(transition(event, 'published'), /PUBLICATION_INVALID/)
  await assert.rejects(save(event, alice, { title: 'a'.repeat(121) }), { code: '23514' })
})
test('rascunho → publicado → encerrado; sem reabertura ou edição após encerrar', async () => {
  let event = await save(await create())
  await assert.rejects(transition(event, null), /INVALID_TRANSITION/)
  await assert.rejects(transition(event, 'closed'), /INVALID_TRANSITION/)
  event = await transition(event, 'published')
  await assert.rejects(save(event, alice, { title: '' }), /PUBLICATION_INVALID/)
  event = await transition(event, 'closed')
  await assert.rejects(save(event), /EVENT_CLOSED/)
  await assert.rejects(transition(event, 'published'), /INVALID_TRANSITION/)
})
test('duas edições concorrentes: apenas uma salva e outra recebe conflito', async () => {
  const event = await create()
  const results = await Promise.allSettled([save(event, alice, { title: 'A' }), save(event, alice, { title: 'B' })])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.match(results.find(r => r.status === 'rejected').reason.message, /VERSION_CONFLICT/)
})
test('encerramento espera bloqueio compartilhado do evento em conexão independente', async () => {
  const event = await transition(await save(await create()), 'published')
  const holder = server.getPgClient(); await holder.connect()
  const closer = await connectAs(alice)
  try {
    await holder.query('begin'); await holder.query('select * from public.events where id=$1 for share', [event.id])
    // timeout curto comprova que a operação foi bloqueada pelo FOR SHARE.
    await closer.query("set statement_timeout = '150ms'")
    await assert.rejects(closer.query("select public.transition_event($1,$2,'closed')", [event.id, event.version]), { code: '57014' })
    await holder.query('commit')
    await closer.query("set statement_timeout = '5s'")
    const result = await closer.query("select * from public.transition_event($1,$2,'closed')", [event.id, event.version])
    assert.equal(result.rows[0].status, 'closed')
  } finally { await holder.query('rollback'); await holder.end(); await closer.end() }
})
test('imagens: proprietário, bucket privado, extensão, caminho e troca de objeto', async () => {
  const event = await create()
  const path = `${alice}/${event.id}/cover.png`
  await as(alice, "insert into storage.objects(bucket_id,name) values ('event-private',$1)", [path])
  assert.equal((await as(bob, 'select * from storage.objects where name=$1', [path])).rowCount, 0)
  assert.equal((await as(null, 'select * from storage.objects where name=$1', [path], 'anon')).rowCount, 0)
  await assert.rejects(as(bob, "insert into storage.objects(bucket_id,name) values ('event-public',$1)", [path]), { code: '42501' })
  await assert.rejects(as(alice, "insert into storage.objects(bucket_id,name) values ('event-public',$1)", [`${alice}/${event.id}/evil.svg`]), { code: '42501' })
  await assert.rejects(save(event, alice, { cover: path }), /INVALID_COVER/)
  await as(alice, "insert into storage.objects(bucket_id,name) values ('event-public',$1)", [path])
  const updated = await save(event, alice, { cover: path })
  assert.equal(updated.cover_path, path)
  assert.equal((await as(bob, 'delete from storage.objects where name=$1', [path])).rowCount, 0)
  assert.equal((await as(alice, "update storage.objects set name='tampered' where name=$1", [path])).rowCount, 0)
  assert.equal((await as(alice, 'delete from storage.objects where name=$1', [path])).rowCount, 0)
  const buckets = (await admin.query('select * from storage.buckets')).rows
  assert.equal(buckets.find(b => b.id === 'event-private').public, false)
  assert.equal(buckets.find(b => b.id === 'event-public').file_size_limit, '5242880')
})

async function product(active = true, platform = 'manual') {
  return (await admin.query('insert into public.products(title,platform,external_reference,active) values ($1,$2,gen_random_uuid()::text,$3) returning *', ['Presente fictício', platform, active])).rows[0]
}
async function addGift(event, gift, quantity = 1, user = alice) {
  return (await as(user, 'select * from public.add_event_item($1,$2,$3)', [event.id, gift.id, quantity])).rows[0]
}
async function updateGift(item, quantity, user = alice, eventId = item.event_id) {
  return (await as(user, 'select * from public.set_event_item_quantity($1,$2,$3,$4)', [eventId, item.id, item.version, quantity])).rows[0]
}
test('catálogo: somente administração escreve; usuários leem produtos ativos; anon não lê', async () => {
  const gift = await product(); const inactive = await product(false)
  assert.equal((await as(alice, 'select * from public.products where id=$1', [gift.id])).rowCount, 1)
  assert.equal((await as(alice, 'select * from public.products where id=$1', [inactive.id])).rowCount, 0)
  for (const user of [alice, bob]) {
    await assert.rejects(as(user, "insert into public.products(title,platform,external_reference) values ('Ataque','manual','attack')"), { code: '42501' })
    await assert.rejects(as(user, 'update public.products set active=false where id=$1', [gift.id]), { code: '42501' })
    await assert.rejects(as(user, 'delete from public.products where id=$1', [gift.id]), { code: '42501' })
  }
  await assert.rejects(as(null, 'select * from public.products', [], 'anon'), { code: '42501' })
})
test('lista: leitura e mutações exigem proprietário e vínculo com evento', async () => {
  const event = await create(); const other = await create(bob); const ownOther = await create()
  const gift = await product(); const item = await addGift(event, gift, 2)
  assert.equal((await as(bob, 'select * from public.event_items where id=$1', [item.id])).rowCount, 0)
  assert.equal((await as(alice, 'select * from public.event_items where id=$1', [item.id])).rowCount, 1)
  await assert.rejects(addGift(other, gift), /EVENT_NOT_FOUND/)
  await assert.rejects(updateGift(item, 3, bob), /EVENT_NOT_FOUND/)
  await assert.rejects(updateGift(item, 3, alice, ownOther.id), /ITEM_NOT_FOUND/)
  await assert.rejects(as(null, 'select * from public.event_items', [], 'anon'), { code: '42501' })
  await assert.rejects(as(null, 'select public.add_event_item($1,$2,1)', [event.id, gift.id], 'anon'), { code: '42501' })
})
test('lista: nenhuma escrita direta, exclusão ou troca de produto/evento', async () => {
  const event = await create(); const gift = await product(); const item = await addGift(event, gift)
  for (const user of [alice, bob]) {
    await assert.rejects(as(user, 'insert into public.event_items(event_id,product_id,quantity_requested) values ($1,$2,1)', [event.id, gift.id]), { code: '42501' })
    await assert.rejects(as(user, 'update public.event_items set quantity_requested=10 where id=$1', [item.id]), { code: '42501' })
    await assert.rejects(as(user, 'update public.event_items set product_id=$1 where id=$2', [gift.id, item.id]), { code: '42501' })
    await assert.rejects(as(user, 'delete from public.event_items where id=$1', [item.id]), { code: '42501' })
  }
  assert.equal((await admin.query("select has_table_privilege('service_role','public.event_items','UPDATE') allowed")).rows[0].allowed, false)
  await assert.rejects(admin.query('delete from public.products where id=$1', [gift.id]), { code: '23503' })
})
test('quantidade: nulo, zero, negativo, excesso e fração são rejeitados pelo banco', async () => {
  const event = await create(); const gift = await product()
  for (const quantity of [null, 0, -1, 10001]) await assert.rejects(addGift(event, gift, quantity), /INVALID_QUANTITY/)
  await assert.rejects(addGift(event, gift, '1.5'), { code: '22P02' })
  const item = await addGift(event, gift, 5)
  for (const quantity of [null, 0, -1, 10001]) await assert.rejects(updateGift(item, quantity), /INVALID_QUANTITY/)
  assert.equal((await updateGift(item, 2)).quantity_requested, 2)
  await assert.rejects(admin.query('update public.event_items set quantity_requested=0 where id=$1', [item.id]), { code: '23514' })
})
test('adição concorrente do mesmo produto não duplica nem soma unidades', async () => {
  const event = await create(); const gift = await product()
  const results = await Promise.all([addGift(event, gift, 2), addGift(event, gift, 2)])
  assert.equal(results[0].id, results[1].id)
  assert.equal((await admin.query('select count(*) from public.event_items where event_id=$1', [event.id])).rows[0].count, '1')
  await assert.rejects(addGift(event, gift, 3), /ITEM_ALREADY_EXISTS/)
  assert.equal((await admin.query('select quantity_requested from public.event_items where id=$1', [results[0].id])).rows[0].quantity_requested, 2)
})
test('edição concorrente de quantidade exige versão e preserva exatamente uma alteração', async () => {
  const item = await addGift(await create(), await product(), 2)
  const results = await Promise.allSettled([updateGift(item, 3), updateGift(item, 4)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.match(results.find(r => r.status === 'rejected').reason.message, /ITEM_VERSION_CONFLICT/)
})
test('produto desativado permanece legível só nas listas dos proprietários e não pode ser adicionado', async () => {
  const gift = await product(); const event = await create(); const item = await addGift(event, gift)
  await admin.query('update public.products set active=false where id=$1', [gift.id])
  assert.equal((await as(alice, 'select * from public.products where id=$1', [gift.id])).rowCount, 1)
  assert.equal((await as(bob, 'select * from public.products where id=$1', [gift.id])).rowCount, 0)
  await assert.rejects(addGift(await create(bob), gift, 1, bob), /PRODUCT_UNAVAILABLE/)
  assert.equal((await updateGift(item, 3)).quantity_requested, 3)
})
test('encerramento impede adicionar/editar; edição respeita bloqueio evento antes do item', async () => {
  let event = await transition(await save(await create()), 'published')
  const gift = await product(); const item = await addGift(event, gift)
  const closer = await connectAs(alice); const writer = await connectAs(alice)
  try {
    await closer.query('begin')
    await closer.query("select public.transition_event($1,$2,'closed')", [event.id, event.version])
    await writer.query("set statement_timeout='150ms'")
    await assert.rejects(writer.query('select public.set_event_item_quantity($1,$2,$3,4)', [event.id, item.id, item.version]), { code: '57014' })
    await closer.query('commit')
    await assert.rejects(updateGift(item, 4), /EVENT_CLOSED/)
    await assert.rejects(addGift(event, await product()), /EVENT_CLOSED/)
  } finally { await closer.query('rollback'); await closer.end(); await writer.end() }
})
test('integração de reservas incompleta bloqueia edição em vez de assumir zero comprometido', async () => {
  const item = await addGift(await create(), await product(), 5)
  await admin.query('create table public.reservations (id uuid)')
  try { await assert.rejects(updateGift(item, 1), /RESERVATION_INTEGRATION_REQUIRED/) }
  finally { await admin.query('drop table public.reservations') }
})
test('links: host aprovado exato e HTTPS, sem credenciais, porta, fragmentos ou bypass', async () => {
  const gift = await product(true, 'amazon')
  const saveLink = url => admin.query("insert into private.product_links(product_id,url,approval_reference) values ($1,$2,'teste local') on conflict(product_id) do update set url=excluded.url", [gift.id, url])
  await assert.rejects(saveLink('https://shop.example.test/product'), /PARTNER_NOT_APPROVED/)
  await admin.query("insert into private.partner_hosts(platform,hostname,approval_reference) values ('amazon','shop.example.test','teste local fictício')")
  await saveLink('https://shop.example.test/product?affiliate=official-test')
  for (const url of ['http://shop.example.test/product', 'javascript:alert(1)', 'https://shop.example.test.evil.test/p',
    'https://shop.example.test@evil.test/p', 'https://user:pass@shop.example.test/p', 'https://shop.example.test:443/p',
    'https://shop.example.test/#token', 'https://shop.example.test/\nattack', 'https://shop.example.test\\@evil.test',
    'https://shop%2eexample.test/p', 'https://shop.example.test./p', 'https://SHOP.example.test/p']) {
    await assert.rejects(saveLink(url), /INVALID_PRODUCT_URL|PARTNER_NOT_APPROVED/)
  }
  await assert.rejects(admin.query("update public.products set platform='shopee' where id=$1", [gift.id]), /PRODUCT_IDENTITY_IMMUTABLE/)
  await assert.rejects(as(alice, 'select * from private.product_links'), { code: '42501' })
  await assert.rejects(as(bob, "insert into private.partner_hosts values ('amazon','evil.test','inventado')"), { code: '42501' })
})

async function family(event, names = ['Ana', 'Pedro'], user = alice) {
  return (await as(user, 'select public.create_family_invitation($1,$2,$3,null) value', [event.id, 'Família teste', names])).rows[0].value
}
async function guestSession(invitation) {
  const { rows } = await admin.query("select encode(sha256(convert_to($1,'UTF8')),'hex') token_hash, encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex') session_hash", [invitation.token])
  await admin.query('select public.exchange_guest_invitation($1,$2)', [rows[0].token_hash, rows[0].session_hash])
  return rows[0]
}
async function readInvitation(session) {
  return (await admin.query('select public.get_guest_invitation($1) value', [session.session_hash])).rows[0].value
}
async function respond(session, person, value) {
  return (await admin.query('select public.set_guest_rsvp($1,$2,$3,$4) value', [session.session_hash, person.id, value, person.version])).rows[0].value
}
test('convites: proprietário e família isolados; segredos e RPCs inacessíveis aos clientes', async () => {
  const event = await transition(await save(await create()), 'published')
  const invitation = await family(event)
  assert.equal(invitation.expires_at, null)
  assert.match(invitation.token, /^[a-f0-9]{64}$/)
  await assert.rejects(family(event, ['Outra pessoa'], bob), /EVENT_NOT_FOUND/)
  for (const table of ['invitations', 'invitation_people', 'rsvps']) {
    assert.equal((await as(bob, `select * from public.${table}`)).rowCount, 0)
    await assert.rejects(as(null, `select * from public.${table}`, [], 'anon'), { code: '42501' })
    await assert.rejects(as(alice, `delete from public.${table}`), { code: '42501' })
  }
  for (const role of ['anon', 'authenticated']) {
    for (const signature of ['exchange_guest_invitation(text,text)', 'get_guest_invitation(text)', 'set_guest_rsvp(text,uuid,text,integer)', 'allow_guest_request(text,text)']) {
      const { rows } = await admin.query('select has_function_privilege($1,$2,\'execute\') allowed', [role, `public.${signature}`])
      assert.equal(rows[0].allowed, false)
    }
  }
  const session = await guestSession(invitation)
  const view = await readInvitation(session)
  assert.deepEqual(view.people.map(person => person.name), ['Ana', 'Pedro'])
  const other = await readInvitation(await guestSession(await family(event, ['Luiza'])))
  await assert.rejects(respond(session, other.people[0], 'yes'), /PERSON_NOT_FOUND/)
  const changed = await respond(session, view.people[0], 'yes')
  assert.equal(changed.response, 'yes')
  await assert.rejects(respond(session, view.people[0], 'no'), /RSVP_VERSION_CONFLICT/)
  assert.equal((await respond(session, changed, 'maybe')).response, 'maybe')
  const reopened = await readInvitation(await guestSession(invitation))
  assert.deepEqual(reopened.people.map(person => person.response), ['maybe', 'pending'])
})
test('convites: início e encerramento bloqueiam escrita e preservam reabertura para consulta', async () => {
  const event = await transition(await save(await create()), 'published')
  const invitation = await family(event)
  const session = await guestSession(invitation)
  const view = await readInvitation(session)
  assert.equal(view.read_only, false)
  await admin.query("update public.events set starts_at=clock_timestamp()-interval '1 second' where id=$1", [event.id])
  await assert.rejects(respond(session, view.people[0], 'yes'), /RSVP_CLOSED/)
  assert.equal((await readInvitation(await guestSession(invitation))).read_only, true)
  await assert.rejects(family(event), /EVENT_NOT_PUBLISHED/)
  await transition(event, 'closed')
  assert.equal((await readInvitation(await guestSession(invitation))).read_only, true)
  await assert.rejects(respond(session, view.people[0], 'yes'), /RSVP_CLOSED/)
})
test('convites: revogação invalida sessões emitidas e impede reabertura', async () => {
  const event = await transition(await save(await create()), 'published')
  const invitation = await family(event)
  const session = await guestSession(invitation)
  const view = await readInvitation(session)
  await assert.rejects(as(bob, 'select public.revoke_family_invitation($1,$2)', [event.id, invitation.id]), /EVENT_NOT_FOUND/)
  await as(alice, 'select public.revoke_family_invitation($1,$2)', [event.id, invitation.id])
  await assert.rejects(readInvitation(session), /GUEST_SESSION_INVALID/)
  await assert.rejects(respond(session, view.people[0], 'yes'), /GUEST_SESSION_INVALID/)
  await assert.rejects(guestSession(invitation), /GUEST_SESSION_INVALID/)
})
test('convites: sessão expirada pode ser renovada usando o mesmo link', async () => {
  const invitation = await family(await transition(await save(await create()), 'published'))
  const session = await guestSession(invitation)
  await admin.query("update private.guest_sessions set expires_at=now()-interval '1 second' where session_hash=$1", [session.session_hash])
  await assert.rejects(readInvitation(session), /GUEST_SESSION_INVALID/)
  assert.equal((await readInvitation(await guestSession(invitation))).read_only, false)
})
test('convites: respostas concorrentes preservam uma única alteração por versão', async () => {
  const invitation = await family(await transition(await save(await create()), 'published'))
  const session = await guestSession(invitation)
  const person = (await readInvitation(session)).people[0]
  const clients = [server.getPgClient(), server.getPgClient()]
  await Promise.all(clients.map(client => client.connect()))
  try {
    const results = await Promise.allSettled(clients.map((client, index) => client.query('select public.set_guest_rsvp($1,$2,$3,$4)', [session.session_hash, person.id, index ? 'no' : 'yes', person.version])))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.match(results.find(result => result.status === 'rejected').reason.message, /RSVP_VERSION_CONFLICT/)
  } finally { await Promise.all(clients.map(client => client.end())) }
})
