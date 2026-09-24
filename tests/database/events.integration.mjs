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
  const date = options.date === undefined ? new Date(Date.now()+86400000).toISOString() : options.date
  const ends = options.ends !== undefined ? options.ends : date === null ? null : new Date(new Date(date).getTime()+4*3600000).toISOString()
  return (await as(user, 'select * from public.save_event($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [event.id, event.version, options.title ?? event.title, options.description ?? '', date, ends,
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
  event = await save(event, alice, { title: 'Encontro', ends: null })
  await assert.rejects(transition(event, 'published'), /PUBLICATION_INVALID/)
  const start = new Date(Date.now()+86400000).toISOString()
  await assert.rejects(save(event, alice, { title: 'Encontro', date: start, ends: start }), /EVENT_ENDS_BEFORE_START/)
  await assert.rejects(save(event, alice, { title: 'Encontro', date: null, ends: start }), /EVENT_ENDS_BEFORE_START/)
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

async function product(active = true, platform = 'manual', size = null) {
  return (await admin.query('insert into public.products(title,platform,external_reference,active,category,diaper_size) values ($1,$2,gen_random_uuid()::text,$3,$4,$5) returning *',
    [size ? `Fraldas tamanho ${size}` : 'Mimo fictício', platform, active, size ? 'fralda' : 'mimo', size])).rows[0]
}
async function diaper(size = 'P', active = true) { return product(active, 'manual', size) }
// Fralda exige limite; mimo nunca tem limite. O padrão segue a categoria do produto.
async function addGift(event, gift, quantity = gift.category === 'fralda' ? 1 : null, user = alice) {
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
  const gift = await diaper(); const item = await addGift(event, gift, 2)
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
  const event = await create(); const gift = await diaper('M')
  for (const quantity of [0, -1, 10001]) await assert.rejects(addGift(event, gift, quantity), /INVALID_QUANTITY/)
  await assert.rejects(addGift(event, gift, '1.5'), { code: '22P02' })
  const item = await addGift(event, gift, 5)
  for (const quantity of [0, -1, 10001]) await assert.rejects(updateGift(item, quantity), /INVALID_QUANTITY/)
  assert.equal((await updateGift(item, 2)).quantity_requested, 2)
  await assert.rejects(admin.query('update public.event_items set quantity_requested=0 where id=$1', [item.id]), { code: '23514' })
})
test('adição concorrente do mesmo produto não duplica nem soma unidades', async () => {
  const event = await create(); const gift = await diaper('G')
  const results = await Promise.all([addGift(event, gift, 2), addGift(event, gift, 2)])
  assert.equal(results[0].id, results[1].id)
  assert.equal((await admin.query('select count(*) from public.event_items where event_id=$1', [event.id])).rows[0].count, '1')
  await assert.rejects(addGift(event, gift, 3), /ITEM_ALREADY_EXISTS/)
  assert.equal((await admin.query('select quantity_requested from public.event_items where id=$1', [results[0].id])).rows[0].quantity_requested, 2)
})
test('edição concorrente de quantidade exige versão e preserva exatamente uma alteração', async () => {
  const item = await addGift(await create(), await diaper('XG'), 2)
  const results = await Promise.allSettled([updateGift(item, 3), updateGift(item, 4)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.match(results.find(r => r.status === 'rejected').reason.message, /ITEM_VERSION_CONFLICT/)
})
test('produto desativado permanece legível só nas listas dos proprietários e não pode ser adicionado', async () => {
  const gift = await diaper(); const event = await create(); const item = await addGift(event, gift)
  await admin.query('update public.products set active=false where id=$1', [gift.id])
  assert.equal((await as(alice, 'select * from public.products where id=$1', [gift.id])).rowCount, 1)
  assert.equal((await as(bob, 'select * from public.products where id=$1', [gift.id])).rowCount, 0)
  await assert.rejects(addGift(await create(bob), gift, 1, bob), /PRODUCT_UNAVAILABLE/)
  assert.equal((await updateGift(item, 3)).quantity_requested, 3)
})
test('encerramento impede adicionar/editar; edição respeita bloqueio evento antes do item', async () => {
  let event = await transition(await save(await create()), 'published')
  const gift = await diaper(); const item = await addGift(event, gift)
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
test('integração de reservas calcula zero quando não há comprometimento', async () => {
  const item = await addGift(await create(), await diaper(), 5)
  assert.equal((await updateGift(item, 1)).quantity_requested, 1)
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

test('evento: qualquer escrita avança versão e updated_at; identidade é imutável', async () => {
  const event = await create()
  // O updated_at enviado pela escrita é descartado: o relógio é o da transação.
  await admin.query("update public.events set title='ajuste administrativo', updated_at='2000-01-01T00:00:00Z' where id=$1", [event.id])
  const after = (await admin.query('select * from public.events where id=$1', [event.id])).rows[0]
  assert.equal(after.version, event.version + 1)
  assert.ok(after.updated_at >= event.updated_at && after.updated_at.getUTCFullYear() > 2000)
  // A aba que leu a versão anterior não sobrescreve silenciosamente a correção.
  await assert.rejects(save(event), /VERSION_CONFLICT/)
  await assert.rejects(admin.query('update public.events set owner_id=$1 where id=$2', [bob, event.id]), /EVENT_IDENTITY_IMMUTABLE/)
  await assert.rejects(admin.query("update public.events set type='casamento' where id=$1", [event.id]), /EVENT_IDENTITY_IMMUTABLE/)
  await assert.rejects(admin.query('update public.events set created_at=now() where id=$1', [event.id]), /EVENT_IDENTITY_IMMUTABLE/)
  // Versão não retrocede nem quando a escrita pede explicitamente um número menor.
  await admin.query('update public.events set version=1 where id=$1', [event.id])
  assert.equal((await admin.query('select version from public.events where id=$1', [event.id])).rows[0].version, after.version + 1)
})
test('item: escrita direta avança versão e vínculos são imutáveis', async () => {
  const event = await create(); const gift = await diaper(); const item = await addGift(event, gift, 2)
  await admin.query("update public.event_items set quantity_requested=7, updated_at='2000-01-01T00:00:00Z' where id=$1", [item.id])
  const after = (await admin.query('select * from public.event_items where id=$1', [item.id])).rows[0]
  assert.equal(after.version, item.version + 1)
  assert.ok(after.updated_at >= item.updated_at && after.updated_at.getUTCFullYear() > 2000)
  await assert.rejects(updateGift(item, 3), /ITEM_VERSION_CONFLICT/)
  await assert.rejects(admin.query('update public.event_items set product_id=$1 where id=$2', [(await product()).id, item.id]), /ITEM_IDENTITY_IMMUTABLE/)
  await assert.rejects(admin.query('update public.event_items set event_id=$1 where id=$2', [(await create()).id, item.id]), /ITEM_IDENTITY_IMMUTABLE/)
})
test('produto revisado registra updated_at e mantém identidade e data de cadastro', async () => {
  const gift = await product()
  await admin.query("update public.products set title='Presente revisado', updated_at='2000-01-01T00:00:00Z' where id=$1", [gift.id])
  const after = (await admin.query('select * from public.products where id=$1', [gift.id])).rows[0]
  assert.ok(after.updated_at >= gift.updated_at && after.updated_at.getUTCFullYear() > 2000)
  await assert.rejects(admin.query('update public.products set created_at=now() where id=$1', [gift.id]), /PRODUCT_IDENTITY_IMMUTABLE/)
  await assert.rejects(admin.query("update public.products set external_reference='outro' where id=$1", [gift.id]), /PRODUCT_IDENTITY_IMMUTABLE/)
})
test('lista paginada do evento é servida por índice, sem ordenação adicional', async () => {
  const event = await create()
  // Em tabela pequena o planejador prefere varredura; desabilitar as alternativas
  // comprova que existe caminho indexado capaz de entregar a ordem já pronta.
  await admin.query('set enable_seqscan = off; set enable_bitmapscan = off')
  const explained = await admin.query('explain (format json) select * from public.event_items where event_id=$1 order by created_at, id limit 12', [event.id])
  await admin.query('reset enable_seqscan; reset enable_bitmapscan')
  const plan = JSON.stringify(explained.rows[0]['QUERY PLAN'])
  assert.match(plan, /event_items_event_created_idx/)
  assert.doesNotMatch(plan, /"Node Type": ?"Sort"/)
})
test('chave de servidor lê, mas não escreve, eventos e itens', async () => {
  for (const [table, privilege] of [['events', 'INSERT'], ['events', 'UPDATE'], ['events', 'DELETE'],
    ['event_items', 'INSERT'], ['event_items', 'UPDATE'], ['event_items', 'DELETE']]) {
    const { rows } = await admin.query('select has_table_privilege($1,$2,$3) allowed', ['service_role', `public.${table}`, privilege])
    assert.equal(rows[0].allowed, false, `service_role não deve ter ${privilege} em ${table}`)
  }
  for (const table of ['events', 'event_items', 'products']) {
    const { rows } = await admin.query('select has_table_privilege($1,$2,$3) allowed', ['service_role', `public.${table}`, 'SELECT'])
    assert.equal(rows[0].allowed, true, `service_role precisa ler ${table}`)
  }
})

test('categoria e tamanho vêm do cadastro e são imutáveis depois dele', async () => {
  const sized = await diaper(); const treat = await product()
  assert.equal(sized.category, 'fralda'); assert.equal(sized.diaper_size, 'P')
  assert.equal(treat.category, 'mimo'); assert.equal(treat.diaper_size, null)
  await assert.rejects(admin.query("update public.products set category='mimo', diaper_size=null where id=$1", [sized.id]), /PRODUCT_IDENTITY_IMMUTABLE/)
  await assert.rejects(admin.query("update public.products set diaper_size='G' where id=$1", [sized.id]), /PRODUCT_IDENTITY_IMMUTABLE/)
  // Categoria não se infere pelo título: "Toalha fralda" é mimo.
  const named = (await admin.query("insert into public.products(title,platform,external_reference,category) values ('Toalha fralda','manual',gen_random_uuid()::text,'mimo') returning *")).rows[0]
  assert.equal(named.category, 'mimo'); assert.equal(named.diaper_size, null)
  await assert.rejects(admin.query("insert into public.products(title,platform,external_reference,category) values ('Sem tamanho','manual',gen_random_uuid()::text,'fralda')"), { code: '23514' })
  await assert.rejects(admin.query("insert into public.products(title,platform,external_reference,category,diaper_size) values ('Mimo com tamanho','manual',gen_random_uuid()::text,'mimo','P')"), { code: '23514' })
})
test('um tamanho de fralda ocupa um único item por evento', async () => {
  const event = await create()
  await addGift(event, await diaper(), 6)
  // Dois produtos "P" no mesmo evento criariam dois saldos para o mesmo limite.
  await assert.rejects(addGift(event, await diaper(), 6), /DIAPER_SIZE_ALREADY_LISTED/)
  // O mesmo tamanho em outro evento é um limite legítimo e independente.
  assert.equal((await addGift(await create(), await diaper(), 6)).diaper_size, 'P')
  const item = await addGift(event, await product(), null)
  await assert.rejects(admin.query("update public.event_items set diaper_size='M', category='fralda' where id=$1", [item.id]), /ITEM_IDENTITY_IMMUTABLE/)
})
test('mimo nunca tem limite; fralda sempre tem limite por tamanho', async () => {
  const event = await create(); const treat = await product(); const size = await diaper('M')
  const free = await addGift(event, treat, null)
  assert.equal(free.quantity_requested, null)
  assert.equal(free.category, 'mimo')
  // Repetir a inclusão sem limite devolve a mesma linha em vez de conflitar com NULL.
  assert.equal((await addGift(event, treat, null)).id, free.id)
  // Número num mimo viraria cota fantasma e apareceria como esgotado ao convidado.
  await assert.rejects(addGift(event, treat, 3), /TREAT_HAS_NO_LIMIT/)
  await assert.rejects(updateGift(free, 3), /TREAT_HAS_NO_LIMIT/)
  await assert.rejects(admin.query('update public.event_items set quantity_requested=3 where id=$1', [free.id]), { code: '23514' })
  await assert.rejects(addGift(event, size, null), /DIAPER_LIMIT_REQUIRED/)
  const limited = await addGift(event, size, 19)
  assert.equal(limited.quantity_requested, 19)
  await assert.rejects(updateGift(limited, null), /DIAPER_LIMIT_REQUIRED/)
  await assert.rejects(admin.query('update public.event_items set quantity_requested=null where id=$1', [limited.id]), { code: '23514' })
  assert.equal((await updateGift(limited, 18)).quantity_requested, 18)
})
test('cada tamanho de fralda tem um limite próprio e independente dos mimos', async () => {
  const event = await create()
  const sizes = { P: 6, M: 19, G: 19, XG: 6 }
  const items = {}
  for (const [size, limit] of Object.entries(sizes)) items[size] = await addGift(event, await diaper(size), limit)
  const treat = await addGift(event, await product())
  assert.equal((await updateGift(items.M, 18)).quantity_requested, 18)
  const { rows } = await admin.query(`select p.diaper_size, i.quantity_requested from public.event_items i
    join public.products p on p.id = i.product_id where i.event_id=$1 and p.category='fralda' order by p.diaper_size`, [event.id])
  assert.deepEqual(rows, [{ diaper_size: 'G', quantity_requested: 19 }, { diaper_size: 'M', quantity_requested: 18 },
    { diaper_size: 'P', quantity_requested: 6 }, { diaper_size: 'XG', quantity_requested: 6 }])
  // Mimo na mesma lista não tem limite e não interfere em nenhum tamanho.
  assert.equal((await admin.query('select quantity_requested from public.event_items where id=$1', [treat.id])).rows[0].quantity_requested, null)
})

async function organizerAction(event, action, payload = {}, user = alice) {
  return (await as(user, 'select public.organizer_invitations($1,$2,$3) data', [event.id, action, payload])).rows[0].data
}
async function guestAction(token, action, payload = {}, client = admin) {
  return (await client.query('select public.guest_action($1,$2,$3) data', [token, action, payload])).rows[0].data
}
async function familyFixture(capacity = 3) {
  const event = await transition(await save(await create(), alice, { date: new Date(Date.now()+30*86400000).toISOString() }), 'published')
  assert.equal((await as(alice, 'select public.prepare_family_list($1) n', [event.id])).rows[0].n, 27)
  assert.equal((await as(alice, 'select public.prepare_family_list($1) n', [event.id])).rows[0].n, 0)
  const invite = await organizerAction(event, 'create', { name: 'Família fictícia', kind: capacity === 1 ? 'individual' : 'family', capacity })
  const access = await guestAction(invite.token, 'exchange')
  return { event, invite, token: access.session_token, snapshot: access.snapshot }
}
function request(payload) { return { ...payload, request_id: crypto.randomUUID() } }

test('M3: IDs de outro convite/evento não permitem editar, revogar ou trocar link', async () => {
  const f = await familyFixture(); const other = await familyFixture()
  const before = await organizerAction(f.event, 'list')
  for (const action of ['update', 'revoke', 'rotate']) {
    const payload = { id: f.invite.id, version: 1, name: 'Alteração indevida', kind: 'individual', capacity: 1 }
    await assert.rejects(organizerAction(f.event, action, payload, bob), /EVENT_NOT_FOUND/)
    await assert.rejects(organizerAction(other.event, action, payload), /INVITATION_NOT_FOUND/)
  }
  assert.deepEqual(await organizerAction(f.event, 'list'), before)
  assert.ok((await guestAction(f.invite.token, 'exchange')).session_token)
})

test('M3: reabrir link após expirar sessão preserva RSVP e reserva sem duplicar', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  await guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 2, version: 1 }))
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 2, version: null }))
  await admin.query("update private.guest_sessions set expires_at=clock_timestamp()-interval '1 second' where invitation_id=$1", [f.invite.id])
  await assert.rejects(guestAction(f.token, 'read'), /GUEST_SESSION_INVALID/)
  const reopened = await guestAction(f.invite.token, 'exchange')
  assert.notEqual(reopened.session_token, f.token)
  assert.equal(reopened.snapshot.invitation.attending, 2)
  assert.equal(reopened.snapshot.invitation.version, 2)
  assert.equal(reopened.snapshot.items.find(i => i.id === item.id).own.quantity, 2)
  assert.equal(reopened.snapshot.items.find(i => i.id === item.id).committed, 2)
  assert.equal((await organizerAction(f.event, 'list')).reservations.length, 1)
})

test('M3: convite expirado bloqueia link, leitura e escrita de sessão já aberta', async () => {
  const f = await familyFixture()
  await admin.query("update private.invitations set expires_at=clock_timestamp()-interval '1 second' where id=$1", [f.invite.id])
  await assert.rejects(guestAction(f.invite.token, 'exchange'), /GUEST_SESSION_INVALID/)
  await assert.rejects(guestAction(f.token, 'read'), /GUEST_SESSION_INVALID/)
  await assert.rejects(guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 1, version: 1 })), /GUEST_SESSION_INVALID/)
  assert.equal((await organizerAction(f.event, 'list')).invitations[0].response, 'pending')
})

test('M3: respostas mudam contagem de pessoas sem alterar o outro convite', async () => {
  const f = await familyFixture()
  const second = await organizerAction(f.event, 'create', { name: 'Pessoa fictícia', kind: 'individual', capacity: 1 })
  const token = (await guestAction(second.token, 'exchange')).session_token
  await guestAction(token, 'rsvp', request({ response: 'yes', attending: 1, version: 1 }))
  let version = 1
  for (const [response, attending, total] of [['yes', 3, 4], ['yes', 2, 3], ['no', 0, 1], ['yes', 1, 2]]) {
    const payload = request({ response, attending, version, invitation_id: second.id })
    await guestAction(f.token, 'rsvp', payload)
    await guestAction(f.token, 'rsvp', payload)
    version++
    const dashboard = await organizerAction(f.event, 'list')
    assert.equal(dashboard.invitations.length, 2)
    assert.equal(dashboard.invitations.reduce((sum, i) => sum + i.attending, 0), total)
    assert.equal(dashboard.invitations.find(i => i.id === f.invite.id).version, version)
    const untouched = dashboard.invitations.find(i => i.id === second.id)
    assert.equal(untouched.attending, 1); assert.equal(untouched.version, 2)
    assert.equal(dashboard.reservations.length, 0)
  }
})

test('lista familiar: quatro cotas, 23 mimos ilimitados; preparação repetida não duplica', async () => {
  const f = await familyFixture()
  assert.equal(f.snapshot.items.length, 27)
  assert.deepEqual(Object.fromEntries(f.snapshot.items.filter(i => i.category === 'fralda').map(i => [i.diaper_size, i.limit])), { G: 19, M: 19, P: 6, XG: 6 })
  assert.equal(f.snapshot.items.filter(i => i.category === 'mimo' && i.limit === null).length, 23)
  await assert.rejects(organizerAction(f.event, 'list', {}, bob), /EVENT_NOT_FOUND/)
  const listed = await organizerAction(f.event, 'list')
  assert.equal(JSON.stringify(listed).includes(f.invite.token), false)
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await admin.query("select has_function_privilege($1,'public.guest_action(text,text,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed, false)
    assert.equal((await admin.query("select has_table_privilege($1,'public.reservations','SELECT') allowed", [role])).rows[0].allowed, false)
  }
})
test('RSVP: limites familiares, resposta atual e total do painel, sem multiplicar presentes', async () => {
  const f = await familyFixture()
  await assert.rejects(guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 4, version: 1 })), /ATTENDING_ABOVE_CAPACITY/)
  const payload = request({ response: 'yes', attending: 3, version: 1 })
  const confirmed = await guestAction(f.token, 'rsvp', payload)
  const replay = await guestAction(f.token, 'rsvp', payload)
  assert.deepEqual(replay.result, confirmed.result)
  assert.equal(confirmed.snapshot.invitation.attending, 3)
  assert.equal(confirmed.snapshot.items.every(i => i.committed === 0), true)
  await assert.rejects(guestAction(f.token, 'rsvp', request({ response: 'no', attending: 0, version: 1 })), /RESPONSE_VERSION_CONFLICT/)
  await guestAction(f.token, 'rsvp', request({ response: 'no', attending: 0, version: 2 }))
  assert.equal((await organizerAction(f.event, 'list')).invitations[0].attending, 0)
  const individual = await familyFixture(1)
  await assert.rejects(guestAction(individual.token, 'rsvp', request({ response: 'yes', attending: 2, version: 1 })), /ATTENDING_ABOVE_CAPACITY/)
})
test('mimos sem limite: repetição idempotente, compras e cancelamentos não alteram fraldas', async () => {
  const f = await familyFixture()
  const item = f.snapshot.items.find(i => i.title === 'Aspirador nasal bebê')
  const payload = request({ item_id: item.id, quantity: 12, version: null })
  const first = await guestAction(f.token, 'reserve', payload)
  assert.deepEqual((await guestAction(f.token, 'reserve', payload)).result, first.result)
  await assert.rejects(guestAction(f.token, 'reserve', { ...payload, quantity: 13 }), /IDEMPOTENCY_CONFLICT/)
  const purchased = await guestAction(f.token, 'purchase', request({ item_id: item.id, version: 1 }))
  assert.equal(purchased.snapshot.items.find(i => i.id === item.id).committed, 12)
  const cancelled = await guestAction(f.token, 'cancel', request({ item_id: item.id, version: 2 }))
  assert.equal(cancelled.snapshot.items.find(i => i.id === item.id).committed, 0)
  assert.equal(cancelled.snapshot.items.filter(i => i.category === 'fralda').every(i => i.committed === 0), true)
})
test('fraldas: pedidos simultâneos disputam última unidade sem excesso', async () => {
  const f = await familyFixture()
  const second = await organizerAction(f.event, 'create', { name: 'Outra pessoa', kind: 'individual', capacity: 1 })
  const token2 = (await guestAction(second.token, 'exchange')).session_token
  const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  const stock = (await admin.query('select * from public.event_items where id=$1', [item.id])).rows[0]
  await updateGift(stock, 1)
  const c1 = server.getPgClient(); const c2 = server.getPgClient(); const blocker = server.getPgClient()
  await Promise.all([c1.connect(), c2.connect(), blocker.connect()])
  try {
    await blocker.query('begin'); await blocker.query('select 1 from public.event_items where id=$1 for update', [item.id])
    const attempts = Promise.allSettled([
      guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 1, version: null }), c1),
      guestAction(token2, 'reserve', request({ item_id: item.id, quantity: 1, version: null }), c2),
    ])
    await blocker.query('commit')
    const results = await attempts
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.match(results.find(r => r.status === 'rejected').reason.message, /INSUFFICIENT_QUANTITY/)
    assert.equal((await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id).committed, 1)
  } finally { await blocker.query('rollback'); await Promise.all([c1.end(), c2.end(), blocker.end()]) }
})
test('reserva impede redução abaixo do comprometido e acesso entre eventos', async () => {
  const f = await familyFixture(); const other = await familyFixture()
  const item = f.snapshot.items.find(i => i.diaper_size === 'M')
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 3, version: null }))
  await assert.rejects(guestAction(other.token, 'reserve', request({ item_id: item.id, quantity: 1, version: null })), /ITEM_NOT_FOUND/)
  const stored = (await admin.query('select * from public.event_items where id=$1', [item.id])).rows[0]
  await assert.rejects(updateGift(stored, 2), /QUANTITY_BELOW_COMMITTED/)
  await transition(f.event, 'closed')
  await assert.rejects(guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 4, version: 1 })), /EVENT_CLOSED/)
  const cancelled = await guestAction(f.token, 'cancel', request({ item_id: item.id, version: 1 }))
  assert.equal(cancelled.snapshot.items.find(i => i.id === item.id).committed, 0)
})
test('revogação/rotação preservam respostas e invalidam tokens e sessões anteriores', async () => {
  const f = await familyFixture()
  await guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 2, version: 1 }))
  await organizerAction(f.event, 'revoke', { id: f.invite.id })
  await assert.rejects(guestAction(f.token, 'read'), /GUEST_SESSION_INVALID/)
  await assert.rejects(guestAction(f.invite.token, 'exchange'), /GUEST_SESSION_INVALID/)
  const newInvite = await organizerAction(f.event, 'rotate', { id: f.invite.id })
  assert.equal((await guestAction(newInvite.token, 'exchange')).snapshot.invitation.attending, 2)
  await assert.rejects(guestAction(f.invite.token, 'exchange'), /GUEST_SESSION_INVALID/)
  await admin.query("update private.invitations set expires_at=now()-interval '1 second' where id=$1", [f.invite.id])
  await assert.rejects(guestAction(newInvite.token, 'exchange'), /GUEST_SESSION_INVALID/)
})

test('troca de tamanho é atômica: destino esgotado preserva origem; sucesso transfere', async () => {
  const f = await familyFixture()
  const from = f.snapshot.items.find(i => i.diaper_size === 'M')
  const to = f.snapshot.items.find(i => i.diaper_size === 'P')
  await guestAction(f.token, 'reserve', request({ item_id: from.id, quantity: 7, version: null }))
  await assert.rejects(guestAction(f.token, 'swap', request({ from_item_id: from.id, item_id: to.id, version: 1, destination_version: null })), /INSUFFICIENT_QUANTITY/)
  let current = (await guestAction(f.token, 'read')).snapshot
  assert.equal(current.items.find(i => i.id === from.id).committed, 7)
  assert.equal(current.items.find(i => i.id === to.id).committed, 0)
  await guestAction(f.token, 'reserve', request({ item_id: from.id, quantity: 3, version: 1 }))
  const payload = request({ from_item_id: from.id, item_id: to.id, version: 2, destination_version: null })
  const moved = await guestAction(f.token, 'swap', payload)
  assert.deepEqual((await guestAction(f.token, 'swap', payload)).result, moved.result)
  current = moved.snapshot
  assert.equal(current.items.find(i => i.id === from.id).committed, 0)
  assert.equal(current.items.find(i => i.id === to.id).committed, 3)
})

test('1: quantidade técnica 1–1000 vale para RPC, escrita direta e troca atômica', async () => {
  const f = await familyFixture()
  const item = f.snapshot.items.find(i => i.category === 'mimo')
  for (const quantity of [0, -1, 1001, 2147483647, 1.5, '2', null]) {
    await assert.rejects(guestAction(f.token, 'reserve', request({ item_id: item.id, quantity, version: null })), /INVALID_GIFT_QUANTITY/)
  }
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 1000, version: null }))
  await assert.rejects(admin.query('update public.reservations set quantity=1001 where item_id=$1', [item.id]), { code: '23514' })
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 1, version: 1 }))
  const from = f.snapshot.items.find(i => i.diaper_size === 'M')
  const to = f.snapshot.items.find(i => i.diaper_size === 'P')
  await admin.query('update public.event_items set quantity_requested=2000 where id=any($1::uuid[])', [[from.id, to.id]])
  for (const id of [from.id, to.id]) await guestAction(f.token, 'reserve', request({ item_id: id, quantity: 600, version: null }))
  await assert.rejects(guestAction(f.token, 'swap', request({ from_item_id: from.id, item_id: to.id, version: 1, destination_version: 1 })), /INVALID_GIFT_QUANTITY/)
  const snapshot = (await guestAction(f.token, 'read')).snapshot
  assert.equal(snapshot.items.find(i => i.id === from.id).committed, 600)
  assert.equal(snapshot.items.find(i => i.id === to.id).committed, 600)
})

test('2: edição preserva confirmações, verifica versão, tipo, limite e proprietário', async () => {
  const f = await familyFixture()
  await guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 3, version: 1 }))
  const payload = { id: f.invite.id, version: 2, name: 'Nome revisado', kind: 'family', capacity: 4 }
  await assert.rejects(organizerAction(f.event, 'update', payload, bob), /EVENT_NOT_FOUND/)
  await assert.rejects(organizerAction(f.event, 'update', { ...payload, version: 1 }), /INVITATION_VERSION_CONFLICT/)
  await assert.rejects(organizerAction(f.event, 'update', { ...payload, capacity: 2 }), /CAPACITY_BELOW_ATTENDING/)
  await assert.rejects(organizerAction(f.event, 'update', { ...payload, kind: 'individual' }), /INVALID_INVITATION/)
  await assert.rejects(organizerAction(f.event, 'update', { ...payload, kind: 'individual', capacity: 1 }), /CAPACITY_BELOW_ATTENDING/)
  assert.equal((await organizerAction(f.event, 'update', payload)).version, 3)
  const listed = (await organizerAction(f.event, 'list')).invitations[0]
  assert.equal(listed.version, 3); assert.equal(listed.attending, 3); assert.equal(listed.name, payload.name)
  await assert.rejects(guestAction(f.token, 'rsvp', request({ response: 'no', attending: 0, version: 2 })), /RESPONSE_VERSION_CONFLICT/)
  await guestAction(f.token, 'rsvp', request({ response: 'no', attending: 0, version: 3 }))
  await organizerAction(f.event, 'update', { ...payload, version: 4, kind: 'individual', capacity: 1 })
  await transition(f.event, 'closed')
  await assert.rejects(organizerAction(f.event, 'update', { ...payload, version: 5 }), /EVENT_NOT_PUBLISHED/)
})

test('2: edição concorrente com RSVP não sobrescreve a mesma versão', async () => {
  const f = await familyFixture()
  const owner = await connectAs(alice); const guest = server.getPgClient(); await guest.connect()
  const blocker = server.getPgClient(); await blocker.connect()
  try {
    await blocker.query('begin'); await blocker.query('select 1 from private.invitations where id=$1 for update', [f.invite.id])
    const attempts = Promise.allSettled([
      owner.query("select public.organizer_invitations($1,'update',$2)", [f.event.id, { id: f.invite.id, version: 1, name: 'Revisado', kind: 'family', capacity: 2 }]),
      guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 3, version: 1 }), guest),
    ])
    await blocker.query('commit')
    const results = await attempts
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.match(results.find(r => r.status === 'rejected').reason.message, /VERSION_CONFLICT|ATTENDING_ABOVE_CAPACITY/)
    const inv = (await guestAction(f.token, 'read')).snapshot.invitation
    assert.equal(inv.version, 2); assert.ok(inv.attending <= inv.capacity)
  } finally { await blocker.query('rollback'); await Promise.all([owner.end(), guest.end(), blocker.end()]) }
})

test('3: RSVP rejeita resposta pendente/inválida e quantidade ausente sem erro SQL cru', async () => {
  const f = await familyFixture()
  for (const fields of [{ response: 'pending', attending: 0 }, { response: 'other', attending: 0 },
    { attending: 1 }, { response: 'yes' }, { response: 'yes', attending: null },
    { response: 'yes', attending: 0 }, { response: 'no', attending: 1 },
    { response: 'yes', attending: 1.5 }, { response: 'yes', attending: '2' }]) {
    await assert.rejects(guestAction(f.token, 'rsvp', request({ ...fields, version: 1 })), /RSVP_INVALID_RESPONSE/)
  }
  await assert.rejects(guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 4, version: 1 })), /ATTENDING_ABOVE_CAPACITY/)
  assert.equal((await guestAction(f.token, 'read')).snapshot.invitation.version, 1)
  assert.equal((await admin.query('select count(*) n from private.guest_requests where invitation_id=$1', [f.invite.id])).rows[0].n, '0')
  await guestAction(f.token, 'rsvp', request({ response: 'maybe', reminder_email: 'guest@example.test', attending: 0, version: 1 }))
})

const count = async (sql, values) => Number((await admin.query(sql, values)).rows[0].n)
async function guestData(eventId) {
  const scope = 'where invitation_id in (select id from private.invitations where event_id=$1)'
  return {
    invitations: await count('select count(*) n from private.invitations where event_id=$1', [eventId]),
    guest_requests: await count(`select count(*) n from private.guest_requests ${scope}`, [eventId]),
    reservations: await count(`select count(*) n from public.reservations ${scope}`, [eventId]),
    guest_sessions: await count(`select count(*) n from private.guest_sessions ${scope}`, [eventId]),
  }
}
// Evento com dois convites, respostas, reservas, sessões e capa.
async function populatedEvent() {
  const f = await familyFixture()
  const path = `${alice}/${f.event.id}/capa.png`
  await as(alice, "insert into storage.objects(bucket_id,name) values ('event-public',$1)", [path])
  f.event = await save(f.event, alice, { cover: path })
  await guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 2, version: 1 }))
  const p = f.snapshot.items.find(i => i.diaper_size === 'P')
  await guestAction(f.token, 'reserve', request({ item_id: p.id, quantity: 2, version: null }))
  const second = await organizerAction(f.event, 'create', { name: 'Segunda família', kind: 'family', capacity: 2 })
  const token2 = (await guestAction(second.token, 'exchange')).session_token
  await guestAction(token2, 'reserve', request({ item_id: p.id, quantity: 1, version: null }))
  return { ...f, second, token2, p }
}
async function endAt(eventId, sql) {
  await admin.query(`update public.events set ends_at=${sql}, starts_at=${sql}-interval '4 hours' where id=$1`, [eventId])
  return (await admin.query('select * from public.events where id=$1', [eventId])).rows[0]
}
const purge = async (eventId, client = admin) => (await client.query('select private.purge_event_personal_data($1,null) r', [eventId])).rows[0].r
const auditColumns = ['id', 'event_id', 'ran_at', 'status', 'invitations_removed', 'guest_requests_removed',
  'reservations_removed', 'guest_sessions_removed', 'storage_objects_removed']

test('retenção: prazo único em dias de calendário no fuso de São Paulo', async () => {
  const due = async value => (await admin.query('select private.retention_due_at($1) d', [value])).rows[0].d?.toISOString() ?? null
  assert.equal(await due('2026-11-01T23:30:00-03:00'), new Date('2026-12-01T23:30:00-03:00').toISOString())
  // 30/10 23:30 em São Paulo (31/10 em UTC) vence em 29/11 23:30 em São Paulo, não em 30/11.
  assert.equal(await due('2026-10-31T02:30:00Z'), new Date('2026-11-30T02:30:00Z').toISOString())
  assert.equal(await due(null), null)
})
test('retenção: antes dos 30 dias nada é apagado (borda de 1 minuto)', async () => {
  const f = await populatedEvent()
  const before = await guestData(f.event.id)
  const event = await endAt(f.event.id, "now()-interval '30 days'+interval '1 minute'")
  assert.equal(await purge(f.event.id), 'not_due')
  assert.equal((await admin.query('select * from public.retention_run() where event_id=$1', [f.event.id])).rowCount, 0)
  assert.deepEqual(await guestData(f.event.id), before)
  const after = (await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0]
  assert.deepEqual(after, event)
  assert.equal(await count('select count(*) n from private.retention_audit where event_id=$1', [f.event.id]), 0)
})
test('retenção: após 30 dias apaga dados pessoais, preserva evento, conta e itens; repetição é segura', async () => {
  const f = await populatedEvent(); const other = await populatedEvent()
  const otherBefore = await guestData(other.event.id)
  const event = await endAt(f.event.id, "now()-interval '30 days'-interval '1 minute'")
  const before = await guestData(f.event.id)
  assert.deepEqual(before, { invitations: 2, guest_requests: 3, reservations: 2, guest_sessions: 2 })
  const items = await count('select count(*) n from public.event_items where event_id=$1', [f.event.id])
  assert.deepEqual((await admin.query('select * from public.retention_run() where event_id=$1', [f.event.id])).rows, [{ event_id: f.event.id, owner_id: alice }])
  assert.equal((await admin.query('select public.retention_purge_event($1,$2) r', [f.event.id, 3])).rows[0].r, 'purged')
  assert.deepEqual(await guestData(f.event.id), { invitations: 0, guest_requests: 0, reservations: 0, guest_sessions: 0 })
  const purged = (await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0]
  assert.equal(purged.private_address, ''); assert.equal(purged.private_instructions, ''); assert.equal(purged.cover_path, null)
  for (const field of ['id', 'owner_id', 'title', 'starts_at', 'ends_at', 'status', 'created_at']) assert.deepEqual(purged[field], event[field], field)
  assert.ok(purged.personal_data_purged_at)
  assert.equal(await count('select count(*) n from auth.users where id=$1', [alice]), 1, 'conta do organizador permanece')
  assert.equal(await count('select count(*) n from public.event_items where event_id=$1', [f.event.id]), items)
  assert.deepEqual(await guestData(other.event.id), otherBefore, 'outro evento intacto')
  const columns = (await admin.query("select column_name from information_schema.columns where table_schema='private' and table_name='retention_audit' order by ordinal_position")).rows.map(r => r.column_name)
  assert.deepEqual(columns, auditColumns)
  const [audit] = (await admin.query('select * from private.retention_audit where event_id=$1', [f.event.id])).rows
  assert.deepEqual({ status: audit.status, invitations: audit.invitations_removed, guest_requests: audit.guest_requests_removed,
    reservations: audit.reservations_removed, guest_sessions: audit.guest_sessions_removed, storage: audit.storage_objects_removed },
    { status: 'purged', invitations: 2, guest_requests: 3, reservations: 2, guest_sessions: 2, storage: 3 })
  // Segunda execução: sem erro e sem alteração.
  assert.equal(await purge(f.event.id), 'already_purged')
  assert.deepEqual((await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0], purged)
  assert.equal((await admin.query('select * from public.retention_run() where event_id=$1', [f.event.id])).rowCount, 0)
  assert.deepEqual((await admin.query('select status from private.retention_audit where event_id=$1 order by id', [f.event.id])).rows.map(r => r.status), ['purged', 'already_purged'])
})
test('retenção: falha no meio desfaz tudo e a marca continua nula', async () => {
  const f = await populatedEvent()
  await endAt(f.event.id, "now()-interval '31 days'")
  const before = await guestData(f.event.id)
  const blocker = server.getPgClient(); const worker = server.getPgClient()
  await Promise.all([blocker.connect(), worker.connect()])
  try {
    await blocker.query('begin')
    await blocker.query('select 1 from public.reservations where invitation_id=$1 for update', [f.invite.id])
    await worker.query("set lock_timeout='200ms'")
    await assert.rejects(purge(f.event.id, worker), { code: '55P03' })
    assert.deepEqual(await guestData(f.event.id), before)
    const event = (await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0]
    assert.equal(event.personal_data_purged_at, null); assert.equal(event.private_address, 'Endereço privado')
    assert.equal(await count('select count(*) n from private.retention_audit where event_id=$1', [f.event.id]), 0)
    await blocker.query('commit')
    assert.equal(await purge(f.event.id, worker), 'purged')
  } finally { await blocker.query('rollback'); await Promise.all([blocker.end(), worker.end()]) }
})
test('retenção: evento expurgado recusa dados pessoais novos', async () => {
  const f = await populatedEvent()
  await endAt(f.event.id, "now()-interval '31 days'")
  assert.equal(await purge(f.event.id), 'purged')
  const event = (await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0]
  await assert.rejects(organizerAction(event, 'create', { name: 'Nova', kind: 'individual', capacity: 1 }), /EVENT_PURGED/)
  await assert.rejects(save(event), /EVENT_PURGED/)
  await assert.rejects(transition(event, 'closed'), /EVENT_PURGED/)
  await assert.rejects(as(alice, 'select public.prepare_family_list($1)', [event.id]), /EVENT_PURGED/)
  assert.equal((await organizerAction(event, 'list')).invitations.length, 0)
})
test('retenção: pedido do titular apaga um convite e libera a quantidade', async () => {
  const f = await populatedEvent()
  await admin.query('select private.erase_invitation($1)', [f.invite.id])
  assert.equal(await count('select count(*) n from private.invitations where id=$1', [f.invite.id]), 0)
  const data = await guestData(f.event.id)
  assert.deepEqual(data, { invitations: 1, guest_requests: 1, reservations: 1, guest_sessions: 1 })
  assert.equal((await guestAction(f.token2, 'read')).snapshot.items.find(i => i.id === f.p.id).committed, 1)
  const [audit] = (await admin.query('select * from private.retention_audit where event_id=$1', [f.event.id])).rows
  assert.deepEqual([audit.status, audit.invitations_removed, audit.guest_requests_removed, audit.reservations_removed, audit.guest_sessions_removed],
    ['invitation_erased', 1, 2, 1, 1])
  assert.equal(JSON.stringify(audit).includes(f.invite.id), false)
  await assert.rejects(admin.query('select private.erase_invitation($1)', [f.invite.id]), /INVITATION_NOT_FOUND/)
})
test('retenção: substitui o expurgo de 90 dias e restringe as funções', async () => {
  const f = await familyFixture()
  assert.equal((await admin.query("select to_regprocedure('private.cleanup_guest_data()') f")).rows[0].f, null)
  const old = crypto.randomUUID()
  await admin.query("insert into private.guest_requests(invitation_id,request_id,payload,result,created_at) values ($1,$2,'{}','{}',now()-interval '91 days')", [f.invite.id, old])
  await admin.query("insert into private.guest_sessions values ('expired-test',$1,now()-interval '1 second')", [f.invite.id])
  await admin.query("insert into private.guest_rate values ('old-window-test',now()-interval '1 hour',1)")
  await admin.query('select * from public.retention_run()')
  assert.equal(await count("select count(*) n from private.guest_sessions where token_hash='expired-test'"), 0)
  assert.equal(await count("select count(*) n from private.guest_rate where key_hash='old-window-test'"), 0)
  assert.equal(await count('select count(*) n from private.guest_requests where request_id=$1', [old]), 1, 'pedidos saem apenas com o evento')
  assert.equal(await count('select count(*) n from private.guest_sessions where invitation_id=$1', [f.invite.id]), 1, 'sessão válida preservada')
  const allowed = async (role, fn) => (await admin.query("select has_function_privilege($1,$2,'EXECUTE') a", [role, fn])).rows[0].a
  for (const fn of ['public.retention_run()', 'public.retention_referenced_paths(uuid,text[])', 'public.retention_purge_event(uuid,integer)', 'public.retention_record_failure(uuid,text,integer)']) {
    for (const role of ['anon', 'authenticated']) assert.equal(await allowed(role, fn), false, `${role} ${fn}`)
    assert.equal(await allowed('service_role', fn), true, fn)
  }
  for (const fn of ['private.retention_due_at(timestamptz)', 'private.purge_event_personal_data(uuid,integer)', 'private.erase_invitation(uuid)', 'private.cleanup_guest_technical()', 'private.invoke_retention()']) {
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await allowed(role, fn), false, `${role} ${fn}`)
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await admin.query("select has_table_privilege($1,'private.retention_audit','SELECT') a", [role])).rows[0].a, false)
  }
  await assert.rejects(admin.query("select public.retention_record_failure($1,'purged',null)", [f.event.id]), /INVALID_RETENTION_STATUS/)
})

test('5: agregação de saldos isola eventos e soma reservas/compras, excluindo cancelamentos', async () => {
  const f = await familyFixture(); const other = await familyFixture()
  const item = f.snapshot.items.find(i => i.category === 'mimo')
  const invite = await organizerAction(f.event, 'create', { name: 'Outra família', kind: 'individual', capacity: 1 })
  const token = (await guestAction(invite.token, 'exchange')).session_token
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 3, version: null }))
  await guestAction(token, 'reserve', request({ item_id: item.id, quantity: 7, version: null }))
  await guestAction(token, 'purchase', request({ item_id: item.id, version: 1 }))
  assert.equal((await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id).committed, 10)
  assert.equal((await organizerAction(f.event, 'list')).items.find(i => i.id === item.id).committed, 10)
  assert.ok((await guestAction(other.token, 'read')).snapshot.items.every(i => i.committed === 0))
  await guestAction(f.token, 'cancel', request({ item_id: item.id, version: 1 }))
  const current = (await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id)
  assert.equal(current.committed, 7); assert.equal(current.own.status, 'cancelled')
})

test('6: defaults configuráveis afetam apenas novas listas e preservam regra de mimos', async () => {
  const old = await familyFixture()
  try {
    await admin.query("update private.family_list_defaults set quantity=8 where diaper_size='P'")
    const fresh = await familyFixture()
    assert.equal(fresh.snapshot.items.find(i => i.diaper_size === 'P').limit, 8)
    assert.equal((await guestAction(old.token, 'read')).snapshot.items.find(i => i.diaper_size === 'P').limit, 6)
    const treat = fresh.snapshot.items.find(i => i.category === 'mimo')
    await assert.rejects(admin.query('update public.event_items set quantity_requested=3 where id=$1', [treat.id]), { code: '23514' })
    await assert.rejects(as(alice, 'select * from private.family_list_defaults'), { code: '42501' })
    await admin.query("delete from private.family_list_defaults where diaper_size='P'")
    const empty = await create()
    await assert.rejects(as(alice, 'select public.prepare_family_list($1)', [empty.id]), /DIAPER_DEFAULT_REQUIRED/)
    assert.equal((await admin.query('select count(*) n from public.event_items where event_id=$1', [empty.id])).rows[0].n, '0')
    await transition(fresh.event, 'closed')
    await assert.rejects(as(alice, 'select public.prepare_family_list($1)', [fresh.event.id]), { code: '22023', message: 'EVENT_CLOSED' })
  } finally { await admin.query("insert into private.family_list_defaults values ('P',6) on conflict(diaper_size) do update set quantity=6") }
})

test('regra confirmada: cota é global por tamanho, sem teto comercial de pacotes por convite', async () => {
  const f = await familyFixture(1)
  const other = await organizerAction(f.event, 'create', { name: 'Outro convite', kind: 'family', capacity: 4 })
  const second = (await guestAction(other.token, 'exchange')).session_token
  for (const [size, quantity] of Object.entries({ P: 6, M: 19, G: 19, XG: 6 })) {
    const item = f.snapshot.items.find(i => i.diaper_size === size)
    await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity, version: null }))
    await assert.rejects(guestAction(second, 'reserve', request({ item_id: item.id, quantity: 1, version: null })), /INSUFFICIENT_QUANTITY/)
  }
  const snapshot = (await guestAction(f.token, 'read')).snapshot
  assert.equal(snapshot.items.filter(i => i.category === 'fralda').reduce((n, i) => n + i.own.quantity, 0), 50)
  assert.equal(snapshot.invitation.attending, 0, 'reservas não dependem do RSVP nem do limite de pessoas')
  const p = snapshot.items.find(i => i.diaper_size === 'P')
  await guestAction(f.token, 'cancel', request({ item_id: p.id, version: 1 }))
  const after = (await guestAction(second, 'reserve', request({ item_id: p.id, quantity: 6, version: null }))).snapshot
  assert.deepEqual(Object.fromEntries(after.items.filter(i => i.category === 'fralda').map(i => [i.diaper_size, i.committed])), { G: 19, M: 19, P: 6, XG: 6 })
})

test('M4: encerramento bloqueia novas mutações, preserva leitura e replay confirmado', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  const destination = f.snapshot.items.find(i => i.diaper_size === 'M')
  const payload = request({ item_id: item.id, quantity: 2, version: null })
  const confirmed = await guestAction(f.token, 'reserve', payload)
  await transition(f.event, 'closed')
  const reopened = await guestAction(f.invite.token, 'exchange')
  assert.equal(reopened.snapshot.event.status, 'closed')
  assert.equal((await guestAction(f.token, 'read')).snapshot.event.status, 'closed')
  const replay = await guestAction(reopened.session_token, 'reserve', payload)
  assert.deepEqual(replay.result, confirmed.result)
  assert.equal(replay.snapshot.items.find(i => i.id === item.id).committed, 2)
  for (const [action, body] of [
    ['reserve', { item_id: destination.id, quantity: 1, version: null }],
    ['reserve', { item_id: item.id, quantity: 3, version: 1 }],
    ['swap', { from_item_id: item.id, item_id: destination.id, version: 1, destination_version: null }],
    ['rsvp', { response: 'yes', attending: 1, version: 1 }],
  ]) await assert.rejects(guestAction(reopened.session_token, action, request(body)), /EVENT_CLOSED/)
  const dashboard = await organizerAction(f.event, 'list')
  assert.equal(dashboard.reservations.length, 1)
  assert.equal(dashboard.invitations[0].response, 'pending')
  assert.equal((await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === destination.id).committed, 0)
})

test('M4: compra e cancelamento após encerrar preservam saldo e idempotência', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 2, version: null }))
  await transition(f.event, 'closed')
  const buy = request({ item_id: item.id, version: 1 })
  const purchased = await guestAction(f.token, 'purchase', buy)
  assert.deepEqual((await guestAction(f.token, 'purchase', buy)).result, purchased.result)
  const own = purchased.snapshot.items.find(i => i.id === item.id)
  assert.equal(own.own.status, 'purchase_declared'); assert.equal(own.committed, 2)
  const cancel = request({ item_id: item.id, version: 2 })
  const cancelled = await guestAction(f.token, 'cancel', cancel)
  assert.deepEqual((await guestAction(f.token, 'cancel', cancel)).result, cancelled.result)
  assert.equal(cancelled.snapshot.items.find(i => i.id === item.id).committed, 0)
  await assert.rejects(guestAction(f.token, 'purchase', request({ item_id: item.id, version: 3 })), /INVALID_RESERVATION_STATE/)
  assert.equal(cancelled.snapshot.items.find(i => i.id === item.id).own.status, 'cancelled')
  assert.equal((await organizerAction(f.event, 'list')).reservations.length, 0)
})

test('M4: validade pós-evento vem do início mais 7 dias e limita todas as ações', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  const validity = (await admin.query("select expires_at = $2::timestamptz + interval '7 days' correct from private.invitations where id=$1", [f.invite.id, f.event.starts_at])).rows[0]
  assert.equal(validity.correct, true)
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 2, version: null }))
  await transition(f.event, 'closed')
  await admin.query("update private.invitations set expires_at=clock_timestamp()+interval '1 minute' where id=$1", [f.invite.id])
  const access = await guestAction(f.invite.token, 'exchange')
  const expiry = (await admin.query('select expires_at from private.invitations where id=$1', [f.invite.id])).rows[0].expires_at
  assert.equal(new Date(access.expires_at).getTime(), expiry.getTime())
  const buy = request({ item_id: item.id, version: 1 })
  await guestAction(access.session_token, 'purchase', buy)
  await admin.query("update private.invitations set expires_at=clock_timestamp()-interval '1 second' where id=$1", [f.invite.id])
  for (const [token, action, body] of [
    [f.invite.token, 'exchange', {}], [access.session_token, 'read', {}],
    [access.session_token, 'purchase', buy],
    [access.session_token, 'cancel', request({ item_id: item.id, version: 2 })],
  ]) await assert.rejects(guestAction(token, action, body), /GUEST_SESSION_INVALID/)
  assert.equal((await organizerAction(f.event, 'list')).reservations[0].status, 'purchase_declared')
})

test('M4: cancelamento simultâneo com mesma chave libera o saldo uma única vez', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  await guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 6, version: null }))
  const clients = [server.getPgClient(), server.getPgClient()]
  await Promise.all(clients.map(c => c.connect()))
  try {
    const payload = request({ item_id: item.id, version: 1 })
    const results = await Promise.all(clients.map(c => guestAction(f.token, 'cancel', payload, c)))
    assert.deepEqual(results[0].result, results[1].result)
    assert.equal(results[0].result.version, 2)
    assert.equal((await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id).committed, 0)
  } finally { await Promise.all(clients.map(c => c.end())) }
})

test('M4: encerramento que obtém o bloqueio primeiro impede reserva concorrente', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  const owner = await connectAs(alice); const guest = server.getPgClient(); await guest.connect()
  try {
    await owner.query('begin')
    await owner.query("select public.transition_event($1,$2,'closed')", [f.event.id, f.event.version])
    const attempt = assert.rejects(guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 1, version: null }), guest), /EVENT_CLOSED/)
    await owner.query('commit'); await attempt
    assert.equal((await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id).committed, 0)
  } finally { await owner.query('rollback'); await Promise.all([owner.end(), guest.end()]) }
})

test('M4: redução de cota e reserva concorrentes preservam o saldo persistido', async () => {
  const f = await familyFixture(); const item = f.snapshot.items.find(i => i.diaper_size === 'P')
  const stored = (await admin.query('select * from public.event_items where id=$1', [item.id])).rows[0]
  const owner = await connectAs(alice); const guest = server.getPgClient(); await guest.connect()
  try {
    const results = await Promise.allSettled([
      owner.query('select public.set_event_item_quantity($1,$2,$3,$4)', [f.event.id, item.id, stored.version, 1]),
      guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 6, version: null }), guest),
    ])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.match(results.find(r => r.status === 'rejected').reason.message, /INSUFFICIENT_QUANTITY|QUANTITY_BELOW_COMMITTED/)
    const actual = (await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id)
    assert.ok(actual.committed <= actual.limit)
  } finally { await Promise.all([owner.end(), guest.end()]) }
})

test('revisão 2: adiar o evento publicado move a validade de todos os convites', async () => {
  const f = await familyFixture()
  const revoked = await organizerAction(f.event, 'create', { name: 'Revogado', kind: 'individual', capacity: 1 })
  await organizerAction(f.event, 'revoke', { id: revoked.id })
  await admin.query("update private.invitations set expires_at=now()-interval '1 minute' where event_id=$1", [f.event.id])
  await assert.rejects(guestAction(f.invite.token, 'exchange'), /GUEST_SESSION_INVALID/, 'validade antiga já passou')
  const current = (await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0]
  const postponed = new Date(Date.now() + 40 * 86400000).toISOString()
  const saved = await save(current, alice, { date: postponed })
  const rows = (await admin.query("select id, revoked, expires_at = $2::timestamptz + interval '7 days' as follows from private.invitations where event_id=$1", [f.event.id, saved.starts_at])).rows
  assert.equal(rows.length, 2); assert.ok(rows.every(r => r.follows), 'validade = novo início + 7 dias')
  assert.equal(rows.find(r => r.id === revoked.id).revoked, true, 'revogação preservada')
  assert.ok((await guestAction(f.invite.token, 'exchange')).session_token, 'convite volta a abrir após o adiamento')
  const unchanged = await save(saved, alice, { title: 'Mesmo horário', date: saved.starts_at.toISOString() })
  assert.equal(unchanged.title, 'Mesmo horário')
})
test('revisão 3: compra informada não volta a reservada por quantidade ou troca de tamanho', async () => {
  const f = await familyFixture()
  const p = f.snapshot.items.find(i => i.diaper_size === 'P'); const m = f.snapshot.items.find(i => i.diaper_size === 'M')
  await guestAction(f.token, 'reserve', request({ item_id: p.id, quantity: 2, version: null }))
  await guestAction(f.token, 'purchase', request({ item_id: p.id, version: 1 }))
  await assert.rejects(guestAction(f.token, 'reserve', request({ item_id: p.id, quantity: 3, version: 2 })), /PURCHASE_ALREADY_DECLARED/)
  await assert.rejects(guestAction(f.token, 'swap', request({ from_item_id: p.id, item_id: m.id, version: 2, destination_version: null })), /PURCHASE_ALREADY_DECLARED/)
  await guestAction(f.token, 'reserve', request({ item_id: m.id, quantity: 1, version: null }))
  await assert.rejects(guestAction(f.token, 'swap', request({ from_item_id: m.id, item_id: p.id, version: 1, destination_version: 2 })), /PURCHASE_ALREADY_DECLARED/)
  const snapshot = (await guestAction(f.token, 'read')).snapshot
  assert.deepEqual([snapshot.items.find(i => i.id === p.id).own.status, snapshot.items.find(i => i.id === p.id).committed], ['purchase_declared', 2])
  assert.equal(snapshot.items.find(i => i.id === m.id).own.status, 'reserved')
  const cancelled = await guestAction(f.token, 'cancel', request({ item_id: p.id, version: 2 }))
  assert.equal(cancelled.snapshot.items.find(i => i.id === p.id).own.status, 'cancelled', 'cancelar continua permitido')
})
test('revisão 4: rascunho com data passada nunca é expurgado; evento vencido não muda de data', async () => {
  const draft = await save(await create(), alice, { title: 'Rascunho com ano errado', date: '2020-01-01T15:00:00Z' })
  assert.equal(draft.status, 'draft')
  assert.equal((await admin.query('select * from public.retention_run() where event_id=$1', [draft.id])).rowCount, 0)
  assert.equal(await purge(draft.id), 'not_due')
  const fixed = await save(draft, alice, { title: 'Rascunho corrigido', date: new Date(Date.now() + 86400000).toISOString() })
  assert.equal(fixed.private_address, 'Endereço privado'); assert.equal(fixed.personal_data_purged_at, null)
  const f = await familyFixture()
  const due = await endAt(f.event.id, "now()-interval '31 days'")
  await assert.rejects(save(due, alice, { date: new Date(Date.now() + 86400000).toISOString() }), /EVENT_RETENTION_DUE/)
  assert.equal((await admin.query('select * from public.retention_run() where event_id=$1', [f.event.id])).rowCount, 1)
})

const deleteEvent = (event, version = event.version, client) => client
  ? client.query('select public.delete_event($1,$2) data', [event.id, version]).then(r => r.rows[0].data)
  : as(alice, 'select public.delete_event($1,$2) data', [event.id, version]).then(r => r.rows[0].data)
const eventRows = async eventId => ({
  events: await count('select count(*) n from public.events where id=$1', [eventId]),
  items: await count('select count(*) n from public.event_items where event_id=$1', [eventId]),
  ...await guestData(eventId),
})
const deletion = async eventId => (await admin.query('select * from private.event_deletions where event_id=$1', [eventId])).rows[0]

test('exclusão: reserva em curso termina antes e entra na contagem da exclusão', async () => {
  const f = await populatedEvent()
  const closed = await transition((await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0], 'closed')
  const m = f.snapshot.items.find(i => i.diaper_size === 'M')
  const guest = server.getPgClient(); const owner = await connectAs(alice); await guest.connect()
  try {
    await guest.query('begin')
    await guestAction(f.token, 'purchase', request({ item_id: f.p.id, version: 1 }), guest)
    const pending = deleteEvent(closed, closed.version, owner)
    await new Promise(resolve => setTimeout(resolve, 150))
    await guest.query('commit')
    const result = await pending
    assert.deepEqual(result, { event_id: f.event.id, items_removed: 27, invitations_removed: 2, reservations_removed: 2, storage_cleanup: 'pending' })
    assert.deepEqual(await eventRows(f.event.id), { events: 0, items: 0, invitations: 0, guest_requests: 0, reservations: 0, guest_sessions: 0 })
    const audit = await deletion(f.event.id)
    assert.deepEqual([audit.previous_status, audit.guest_requests_removed, audit.guest_sessions_removed, audit.storage_prefix],
      ['closed', 4, 2, `${alice}/${f.event.id}`])
    await assert.rejects(guestAction(f.token, 'read'), /GUEST_SESSION_INVALID/)
    await assert.rejects(guestAction(f.token, 'reserve', request({ item_id: m.id, quantity: 1, version: null })), /GUEST_SESSION_INVALID/)
  } finally { await guest.query('rollback'); await Promise.all([guest.end(), owner.end()]) }
})

test('exclusão: quando obtém o bloqueio primeiro, ação do convidado recebe sessão inválida', async () => {
  const f = await populatedEvent()
  const closed = await transition((await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0], 'closed')
  const owner = await connectAs(alice); const guest = server.getPgClient(); const late = server.getPgClient()
  await Promise.all([guest.connect(), late.connect()])
  try {
    await owner.query('begin')
    await deleteEvent(closed, closed.version, owner)
    const attempts = Promise.allSettled([
      guestAction(f.token, 'cancel', request({ item_id: f.p.id, version: 1 }), guest),
      guestAction(f.invite.token, 'exchange', {}, late),
    ])
    await new Promise(resolve => setTimeout(resolve, 150))
    await owner.query('commit')
    for (const result of await attempts) {
      assert.equal(result.status, 'rejected')
      assert.match(result.reason.message, /GUEST_SESSION_INVALID/)
    }
    assert.deepEqual(await eventRows(f.event.id), { events: 0, items: 0, invitations: 0, guest_requests: 0, reservations: 0, guest_sessions: 0 })
  } finally { await owner.query('rollback'); await Promise.all([owner.end(), guest.end(), late.end()]) }
})

test('exclusão: evento expurgado e encerrado pode ser excluído; publicado nunca', async () => {
  const f = await populatedEvent()
  let event = await transition((await admin.query('select * from public.events where id=$1', [f.event.id])).rows[0], 'closed')
  event = await endAt(event.id, "now()-interval '31 days'")
  assert.equal(await purge(event.id), 'purged')
  event = (await admin.query('select * from public.events where id=$1', [event.id])).rows[0]
  const result = await deleteEvent(event)
  assert.deepEqual([result.invitations_removed, result.reservations_removed, result.items_removed], [0, 0, 27])
  const other = await familyFixture()
  await assert.rejects(deleteEvent(other.event), /EVENT_NOT_DELETABLE/)
  await assert.rejects(as(bob, 'select public.delete_event($1,$2)', [other.event.id, other.event.version]), /EVENT_NOT_FOUND/)
  assert.equal((await eventRows(other.event.id)).events, 1)
})

async function customTreat(event, title, client = null) {
  const sql = 'select * from public.add_custom_treat($1,$2)'
  return (await (client ? client.query(sql, [event.id, title]) : as(alice, sql, [event.id, title]))).rows[0]
}
async function namedProduct(title, size = null) {
  const gift = await product(true, 'manual', size)
  return (await admin.query('update public.products set title=$2 where id=$1 returning *', [gift.id, title])).rows[0]
}
async function waitBlocked(client, blocker) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const { rows } = await admin.query('select $2::integer = any(pg_blocking_pids($1)) blocked', [client.processID, blocker.processID])
    if (rows[0].blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail('a operação não chegou ao bloqueio esperado')
}
const outcome = promise => promise.then(value => ({ value }), error => ({ error }))

test('R2: mimo próprio e catálogo homônimos são recusados nas duas ordens; replay preservado', async () => {
  for (const customFirst of [true, false]) {
    const event = await create(); const gift = await namedProduct('  Livro DE PANO  ')
    let original
    if (customFirst) {
      original = await customTreat(event, ' livro de pano ')
      await assert.rejects(addGift(event, gift), /ITEM_ALREADY_EXISTS/)
    } else {
      original = await addGift(event, gift)
      await assert.rejects(customTreat(event, ' livro de pano '), /ITEM_ALREADY_EXISTS/)
    }
    const replay = await addGift(event, { id: original.product_id, category: 'mimo' })
    assert.deepEqual(replay, original)
    assert.equal((await admin.query('select count(*) from public.event_items where event_id=$1', [event.id])).rows[0].count, '1')
  }
})

test('R2: produtos distintos do catálogo com mesmo nome não duplicam; eventos são independentes', async () => {
  const event = await create(); const first = await namedProduct('Mimo homonimo'); const second = await namedProduct(' MIMO HOMONIMO ')
  await addGift(event, first)
  await assert.rejects(addGift(event, second), /ITEM_ALREADY_EXISTS/)
  assert.equal((await addGift(await create(), second)).product_id, second.id)
  assert.ok(await customTreat(event, 'Outro mimo'))
})

test('R2: homônimo entre mimo e fralda é simétrico; fraldas diferentes continuam por tamanho', async () => {
  const gift = await namedProduct('Nome compartilhado', 'P')
  const first = await create(); await customTreat(first, 'Nome compartilhado')
  await assert.rejects(addGift(first, gift), /ITEM_ALREADY_EXISTS/)
  const second = await create(); await addGift(second, gift)
  await assert.rejects(customTreat(second, 'Nome compartilhado'), /ITEM_ALREADY_EXISTS/)
  assert.ok(await addGift(second, await namedProduct('Nome compartilhado', 'M')))
})

test('R2: lista pronta pula homônimo e preserva item, reservas e cotas existentes', async () => {
  const event = await transition(await save(await create()), 'published')
  const item = await customTreat(event, '  TOALHA COM CAPUZ  ')
  const limited = await addGift(event, await diaper('P'), 9)
  const invite = await organizerAction(event, 'create', { name: 'Pessoa fictícia', kind: 'individual', capacity: 1 })
  const access = await guestAction(invite.token, 'exchange')
  await guestAction(access.session_token, 'reserve', request({ item_id: item.id, quantity: 1, version: null }))
  assert.equal((await as(alice, 'select public.prepare_family_list($1) n', [event.id])).rows[0].n, 25)
  assert.equal((await as(alice, 'select public.prepare_family_list($1) n', [event.id])).rows[0].n, 0)
  assert.deepEqual((await admin.query('select * from public.event_items where id=$1', [item.id])).rows[0], item)
  assert.deepEqual((await admin.query('select * from public.event_items where id=$1', [limited.id])).rows[0], limited)
  const snapshot = (await guestAction(access.session_token, 'read')).snapshot
  assert.equal(snapshot.items.length, 27)
  assert.equal(snapshot.items.find(i => i.id === item.id).committed, 1)
})

test('R2: catálogo aguarda criação concorrente de mimo próprio e recusa o homônimo', async () => {
  const event = await create(); const gift = await namedProduct('Concorrente')
  const maker = await connectAs(alice); const adder = await connectAs(alice)
  let pending
  try {
    await adder.query("set statement_timeout='8s'")
    await maker.query('begin')
    const item = await customTreat(event, 'Concorrente', maker)
    pending = outcome(adder.query('select * from public.add_event_item($1,$2,null)', [event.id, gift.id]))
    await waitBlocked(adder, maker)
    await maker.query('commit')
    assert.match((await pending).error?.message ?? '', /ITEM_ALREADY_EXISTS/)
    assert.deepEqual((await admin.query('select id from public.event_items where event_id=$1', [event.id])).rows, [{ id: item.id }])
  } finally {
    await maker.query('rollback'); await pending
    await Promise.all([maker.end(), adder.end()])
  }
})

test('R3: inclusão pausada antes do item e remoção concorrente terminam sem deadlock', async () => {
  const event = await create(); const item = await customTreat(event, 'Mimo concorrente')
  const gate = server.getPgClient(); await gate.connect()
  const adder = await connectAs(alice); const remover = await connectAs(alice)
  let adding, removing
  try {
    // Barreira apenas no banco descartável: pausa a RPC real depois do produto,
    // antes da inserção/conflito no item. Não inventa locks de produto fora da RPC.
    await admin.query(`create function public.test_pause_item_insert() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock(92222); return new; end $$;
      create trigger test_pause_item_insert before insert on public.event_items
      for each row when (new.event_id='${event.id}'::uuid) execute function public.test_pause_item_insert()`)
    await gate.query('select pg_advisory_lock(92222)')
    await adder.query("set statement_timeout='8s'")
    await remover.query("set statement_timeout='8s'")
    adding = outcome(adder.query('select * from public.add_event_item($1,$2,null)', [event.id, item.product_id]))
    await waitBlocked(adder, gate)
    removing = outcome(remover.query('select * from public.remove_event_item($1,$2,$3)', [event.id, item.id, item.version]))
    await waitBlocked(remover, adder)
    await gate.query('select pg_advisory_unlock(92222)')
    const results = await Promise.all([adding, removing])
    assert.deepEqual(results.map(r => r.error?.code ?? 'ok'), ['ok', 'ok'])
    assert.equal(results[0].value.rows[0].id, item.id)
    assert.equal(results[1].value.rows[0].id, item.id)
    assert.equal((await admin.query('select count(*) from public.products where id=$1', [item.product_id])).rows[0].count, '0')
    assert.equal((await admin.query('select count(*) from public.event_items where id=$1', [item.id])).rows[0].count, '0')
  } finally {
    await gate.query('select pg_advisory_unlock_all()')
    await Promise.all([adding, removing])
    await Promise.all([gate.end(), adder.end(), remover.end()])
    await admin.query('drop trigger if exists test_pause_item_insert on public.event_items; drop function if exists public.test_pause_item_insert()')
  }
})

test('R3: remoção primeiro faz inclusão concorrente recusar produto apagado', async () => {
  const event = await create(); const item = await customTreat(event, 'Mimo removido')
  const remover = await connectAs(alice); const adder = await connectAs(alice)
  let pending
  try {
    await adder.query("set statement_timeout='8s'")
    await remover.query('begin')
    await remover.query('select public.remove_event_item($1,$2,$3)', [event.id, item.id, item.version])
    pending = outcome(adder.query('select public.add_event_item($1,$2,null)', [event.id, item.product_id]))
    await waitBlocked(adder, remover)
    await remover.query('commit')
    assert.match((await pending).error?.message ?? '', /PRODUCT_UNAVAILABLE/)
  } finally {
    await remover.query('rollback'); await pending
    await Promise.all([remover.end(), adder.end()])
  }
})

test('R2: duplicata legada não impede replay nem permite novo homônimo', async () => {
  const event = await create(); const first = await namedProduct('Duplicata legada')
  const second = await namedProduct('Duplicata legada'); const third = await namedProduct('Duplicata legada')
  const original = await addGift(event, first)
  // Estado permitido pelas migrations anteriores; a correção não apaga dados.
  await admin.query("insert into public.event_items(event_id,product_id,category,quantity_requested) values ($1,$2,'mimo',null)", [event.id, second.id])
  assert.deepEqual(await addGift(event, first), original)
  await assert.rejects(addGift(event, third), /ITEM_ALREADY_EXISTS/)
  assert.equal((await admin.query('select count(*) from public.event_items where event_id=$1', [event.id])).rows[0].count, '2')
})

test('R2: dois produtos homônimos concorrentes resultam em apenas uma inclusão', async () => {
  const event = await create(); const first = await namedProduct('Concorrência catálogo'); const second = await namedProduct('Concorrência catálogo')
  const holder = await connectAs(alice); const waiter = await connectAs(alice)
  let pending
  try {
    await waiter.query("set statement_timeout='8s'")
    await holder.query('begin')
    const original = (await holder.query('select * from public.add_event_item($1,$2,null)', [event.id, first.id])).rows[0]
    pending = outcome(waiter.query('select public.add_event_item($1,$2,null)', [event.id, second.id]))
    await waitBlocked(waiter, holder)
    await holder.query('commit')
    assert.match((await pending).error?.message ?? '', /ITEM_ALREADY_EXISTS/)
    assert.deepEqual((await admin.query('select id from public.event_items where event_id=$1', [event.id])).rows, [{ id: original.id }])
  } finally {
    await holder.query('rollback'); await pending
    await Promise.all([holder.end(), waiter.end()])
  }
})

test('R3: reserva e remoção concorrentes respeitam quem bloqueou primeiro', async () => {
  for (const reserveFirst of [true, false]) {
    const f = await familyFixture(); const item = await customTreat(f.event, 'Mimo disputado')
    const owner = await connectAs(alice); const guest = server.getPgClient(); await guest.connect()
    let pending
    try {
      await owner.query("set statement_timeout='8s'"); await guest.query("set statement_timeout='8s'")
      const reserve = () => guestAction(f.token, 'reserve', request({ item_id: item.id, quantity: 1, version: null }), guest)
      const remove = () => owner.query('select public.remove_event_item($1,$2,$3)', [f.event.id, item.id, item.version])
      if (reserveFirst) {
        await guest.query('begin'); await reserve()
        pending = outcome(remove())
        await waitBlocked(owner, guest)
        await guest.query('commit')
        assert.match((await pending).error?.message ?? '', /ITEM_HAS_RESERVATIONS/)
        assert.equal((await guestAction(f.token, 'read')).snapshot.items.find(i => i.id === item.id).committed, 1)
        assert.equal((await admin.query('select count(*) from public.products where id=$1', [item.product_id])).rows[0].count, '1')
      } else {
        await owner.query('begin'); await remove()
        pending = outcome(reserve())
        await waitBlocked(guest, owner)
        await owner.query('commit')
        assert.match((await pending).error?.message ?? '', /ITEM_NOT_FOUND/)
        assert.equal((await admin.query('select count(*) from public.reservations where item_id=$1', [item.id])).rows[0].count, '0')
        assert.equal((await admin.query('select count(*) from public.products where id=$1', [item.product_id])).rows[0].count, '0')
      }
    } finally {
      // Libera o titular do lock antes de aguardar a conexão concorrente.
      await (reserveFirst ? guest : owner).query('rollback'); await pending
      await Promise.all([owner.end(), guest.end()])
    }
  }
})

test('R2/R3: helper privado e mutações da lista continuam restritos ao proprietário', async () => {
  const event = await create(); const item = await customTreat(event, 'Privado')
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await admin.query("select has_function_privilege($1,'private.event_item_title_conflicts(uuid,uuid,text,text)','EXECUTE') allowed", [role])).rows[0].allowed, false)
  }
  for (const [sql, values] of [
    ['select public.add_custom_treat($1,$2)', [event.id, 'Invasão']],
    ['select public.remove_event_item($1,$2,$3)', [event.id, item.id, item.version]],
    ['select public.prepare_family_list($1)', [event.id]],
  ]) {
    await assert.rejects(as(bob, sql, values), /EVENT_NOT_FOUND/)
    await assert.rejects(as(null, sql, values, 'anon'), { code: '42501' })
  }
  const other = await create(bob)
  await assert.rejects(addGift(other, { id: item.product_id, category: 'mimo' }, null, bob), /PRODUCT_UNAVAILABLE/)
  assert.deepEqual((await admin.query('select * from public.event_items where id=$1', [item.id])).rows[0], item)
})

test('T-B7: resumo vazio, respostas, revogação e isolamento calculados no servidor', async () => {
  const empty = await create()
  assert.deepEqual((await organizerAction(empty, 'list')).summary, {
    invitations: { total: 0, answered: 0, yes: 0, no: 0, maybe: 0, pending: 0, revoked: 0 },
    people_confirmed: 0, diapers: { committed: 0, limit: 0 },
  })
  const f = await familyFixture()
  await guestAction(f.token, 'rsvp', request({ response: 'yes', attending: 3, version: 1 }))
  for (const response of ['no', 'maybe', 'pending']) {
    const inv = await organizerAction(f.event, 'create', { name: 'Homônimo fictício', kind: 'individual', capacity: 1 })
    const token = (await guestAction(inv.token, 'exchange')).session_token
    if (response !== 'pending') await guestAction(token, 'rsvp', request({ response, attending: 0, version: 1, ...(response === 'maybe' ? { reminder_email: 'guest@example.test' } : {}) }))
  }
  await organizerAction(f.event, 'revoke', { id: f.invite.id })
  await admin.query("update private.invitations set expires_at=now()-interval '1 day' where id=$1", [f.invite.id])
  await familyFixture() // Outro evento não participa das contagens.
  const summary = (await organizerAction(f.event, 'list')).summary
  assert.deepEqual(summary, {
    invitations: { total: 4, answered: 3, yes: 1, no: 1, maybe: 1, pending: 1, revoked: 1 },
    people_confirmed: 3, diapers: { committed: 0, limit: 50 },
  })
  await assert.rejects(organizerAction(f.event, 'list', {}, bob), /EVENT_NOT_FOUND/)
  await organizerAction(f.event, 'rotate', { id: f.invite.id })
  assert.deepEqual((await organizerAction(f.event, 'list')).summary, { ...summary, invitations: { ...summary.invitations, revoked: 0 } })
})

test('T-B7: reservas têm IDs estáveis e saldo/progresso incluem compra e excluem cancelamento', async () => {
  const f = await familyFixture(); const p = f.snapshot.items.find(i => i.diaper_size === 'P')
  const mimo = f.snapshot.items.find(i => i.category === 'mimo')
  const second = await organizerAction(f.event, 'create', { name: 'Família fictícia', kind: 'individual', capacity: 1 })
  const token = (await guestAction(second.token, 'exchange')).session_token
  await guestAction(f.token, 'reserve', request({ item_id: p.id, quantity: 2, version: null }))
  await guestAction(f.token, 'purchase', request({ item_id: p.id, version: 1 }))
  await guestAction(token, 'reserve', request({ item_id: p.id, quantity: 4, version: null }))
  await guestAction(f.token, 'reserve', request({ item_id: mimo.id, quantity: 3, version: null }))
  let panel = await organizerAction(f.event, 'list')
  assert.deepEqual(panel.summary.diapers, { committed: 6, limit: 50 })
  assert.equal(panel.items.find(i => i.id === p.id).available, 0)
  assert.equal(panel.items.find(i => i.id === mimo.id).available, null)
  const stored = (await admin.query('select id, invitation_id from public.reservations where item_id=any($1::uuid[]) order by id', [[p.id, mimo.id]])).rows
  assert.deepEqual(panel.reservations.map(r => ({ id: r.id, invitation_id: r.invitation_id })).sort((a,b) => a.id.localeCompare(b.id)), stored)
  await organizerAction(f.event, 'update', { id: second.id, version: 1, name: 'Nome alterado', kind: 'individual', capacity: 1 })
  const renamed = (await organizerAction(f.event, 'list')).reservations.find(r => r.invitation_id === second.id)
  assert.equal(renamed.name, 'Nome alterado')
  assert.equal(renamed.id, stored.find(r => r.invitation_id === second.id).id)
  panel = await organizerAction(f.event, 'list')
  await organizerAction(f.event, 'revoke', { id: f.invite.id })
  assert.deepEqual((await organizerAction(f.event, 'list')).reservations, panel.reservations)
  await guestAction(token, 'cancel', request({ item_id: p.id, version: 1 }))
  panel = await organizerAction(f.event, 'list')
  const snapshot = (await guestAction(token, 'read')).snapshot
  assert.deepEqual(panel.summary.diapers, { committed: 2, limit: 50 })
  assert.equal(panel.reservations.length, 2)
  for (const item of panel.items) {
    assert.equal(item.available, item.category === 'mimo' ? null : item.limit - item.committed)
    assert.equal(snapshot.items.find(i => i.id === item.id).available, item.available)
  }
  // Identificadores dos outros convidados não entram na projeção pública.
  assert.equal(JSON.stringify(snapshot).includes(f.invite.id), false)
  const current = (await admin.query('select * from public.event_items where id=$1', [p.id])).rows[0]
  await updateGift(current, 8)
  const updated = await organizerAction(f.event, 'list')
  assert.deepEqual(updated.summary.diapers, { committed: 2, limit: 52 })
  assert.equal(updated.items.find(i => i.id === p.id).available, 6)
  assert.equal((await guestAction(token, 'read')).snapshot.items.find(i => i.id === p.id).available, 6)
  assert.equal((await admin.query('select private.item_available(1,2) n')).rows[0].n, '0')
})

test('lista pronta ajustável: pacotes por tamanho, omitido usa o padrão, valor inválido e dono alheio são recusados', async () => {
  const event = await transition(await save(await create(), alice, { date: new Date(Date.now()+30*86400000).toISOString() }), 'published')
  const prepare = (user, diapers) => as(user, 'select public.prepare_family_list($1,$2::jsonb) n', [event.id, diapers === undefined ? null : JSON.stringify(diapers)])
  for (const bad of [{ P: 0 }, { P: 10001 }, { P: 1.5 }, { P: '5' }, { P: -3 }, { Z: 5 }, [], 5])
    await assert.rejects(prepare(alice, bad), /INVALID_QUANTITY/, JSON.stringify(bad))
  await assert.rejects(prepare(bob, { P: 2 }), /EVENT_NOT_FOUND/)
  assert.equal((await as(alice, 'select count(*)::int n from public.event_items where event_id=$1', [event.id])).rows[0].n, 0)
  assert.equal((await prepare(alice, { P: 2, M: 3 })).rows[0].n, 27)
  const rows = (await as(alice, 'select diaper_size s, quantity_requested q from public.event_items where event_id=$1 and diaper_size is not null order by diaper_size', [event.id])).rows
  assert.deepEqual(Object.fromEntries(rows.map(r => [r.s, r.q])), { G: 19, M: 3, P: 2, XG: 6 })
  assert.equal((await prepare(alice, { P: 9 })).rows[0].n, 0)
  const defaults = (await as(alice, 'select public.family_list_defaults() d')).rows[0].d
  assert.deepEqual(defaults, { P: 6, M: 19, G: 19, XG: 6 })
  await assert.rejects(as(null, 'select public.family_list_defaults()', [], 'anon'), /permission denied/)
})
