// Ensaio local: origem Supabase local vazia e destino descartável em outras portas.
// Nunca acessa o projeto remoto. Dumps e tokens ficam fora do repositório.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { localConfig, localDatabase, fixture, edge } from '../support/local.mjs'

const started = Date.now()
const root = resolve('.')
const cli = resolve('node_modules/.bin/supabase')
const directory = mkdtempSync(join(tmpdir(), 'chadbb-recovery-'))
const project = `chadbb-recovery-${Date.now()}`
const secret = randomUUID()
const run = (bin, args, input) => {
  try { return execFileSync(bin, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }) }
  catch (error) {
    writeFileSync(join(tmpdir(), 'chadbb-recovery-error.log'), error.stderr ?? '', { mode: 0o600 })
    throw new Error(`Falha no comando ${bin} ${args.slice(0, 2).join(' ')}; diagnóstico privado em /tmp/chadbb-recovery-error.log`, { cause: error })
  }
}
const tables = ['auth.users', 'public.events', 'public.event_items', 'private.invitations', 'private.guest_sessions', 'public.reservations', 'private.guest_requests', 'private.retention_audit', 'storage.objects']
let sourceDb, targetDb, f, coverPath, rateBefore, targetStarted = false
const source = localConfig()
async function counts(db) {
  const out = {}
  for (const table of tables) out[table] = Number((await db.query(`select count(*) n from ${table}`)).rows[0].n)
  return out
}
try {
  sourceDb = await localDatabase(source)
  assert.ok(Object.values(await counts(sourceDb)).every(n => n === 0), 'origem local deve estar vazia')
  rateBefore = (await sourceDb.query('select key_hash, window_start, requests from private.guest_rate')).rows
  f = await fixture(source)
  assert.equal((await f.admin.auth.admin.updateUserById(f.userId, { password: secret })).error, null)
  const second = await f.call('organizer_invitations', { p_event_id: f.event.id, p_action: 'create', p_payload: { name: 'Segunda família fictícia', kind: 'family', capacity: 2 } })
  const access = (await edge(source, f.invite.token, 'exchange')).data
  const send = (action, payload) => edge(source, access.session_token, action, { ...payload, request_id: randomUUID() })
  assert.equal((await send('rsvp', { response: 'yes', attending: 2, version: 1 })).status, 200)
  const diaper = access.snapshot.items.find(i => i.diaper_size === 'P')
  const treat = access.snapshot.items.find(i => i.category === 'mimo')
  assert.equal((await send('reserve', { item_id: diaper.id, quantity: 2, version: null })).status, 200)
  assert.equal((await send('reserve', { item_id: treat.id, quantity: 1, version: null })).status, 200)
  assert.equal((await send('cancel', { item_id: treat.id, version: 1 })).status, 200)
  const secondAccess = (await edge(source, second.token, 'exchange')).data
  assert.equal((await edge(source, secondAccess.session_token, 'rsvp', { response: 'maybe', reminder_email: 'guest@example.test', attending: 0, version: 1, request_id: randomUUID() })).status, 200)
  const cover = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  coverPath = `${f.userId}/${f.event.id}/recovery.png`
  assert.equal((await f.admin.storage.from('event-public').upload(coverPath, cover, { contentType: 'image/png' })).error, null)
  await sourceDb.query('update public.events set cover_path=$1 where id=$2', [coverPath, f.event.id])
  const permissionSql = `select n.nspname schema, p.proname name, pg_get_function_identity_arguments(p.oid) args,
    has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') authenticated,
    has_function_privilege('service_role',p.oid,'execute') service_role
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') order by 1,2,3`
  const tablePermissionSql = `select n.nspname schema, c.relname name, c.relrowsecurity rls, c.relforcerowsecurity forced,
    r.role, v.privilege, has_table_privilege(r.role,c.oid,v.privilege) allowed
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
    where n.nspname in ('public','private') and c.relkind='r' order by 1,2,5,6`
  const expectedTablePermissions = (await sourceDb.query(tablePermissionSql)).rows
  const expectedPermissions = (await sourceDb.query(permissionSql)).rows
  const expected = await counts(sourceDb)
  const migrations = (await sourceDb.query('select version, statements, name from supabase_migrations.schema_migrations order by version')).rows
  writeFileSync(join(directory, 'migrations.json'), JSON.stringify(migrations), { mode: 0o600 })
  const jobs = (await sourceDb.query('select jobname, schedule, command from cron.job order by jobname')).rows
  writeFileSync(join(directory, 'cron.json'), JSON.stringify(jobs), { mode: 0o600 })
  const dashboard = await f.call('organizer_invitations', { p_event_id: f.event.id })
  const email = (await f.admin.auth.admin.getUserById(f.userId)).data.user.email
  const downloaded = await f.admin.storage.from('event-public').download(coverPath)
  assert.equal(downloaded.error, null)
  writeFileSync(join(directory, 'cover.png'), Buffer.from(await downloaded.data.arrayBuffer()), { mode: 0o600 })
  for (const [name, flags] of [['roles', ['--role-only']], ['schema', []], ['data', ['--data-only', '--use-copy']]]) {
    run(cli, ['db', 'dump', '--local', '--workdir', root, '-f', join(directory, `${name}.sql`), ...flags])
  }
  console.log('Backup local criado: roles, schema, dados e cópia separada da capa.')
  mkdirSync(join(directory, 'supabase'))
  let config = readFileSync('supabase/config.toml', 'utf8').replace('project_id = "chadbb"', `project_id = "${project}"`)
  config = config.replace(/\b543(\d{2})\b/g, '553$1').replace('inspector_port = 8083', 'inspector_port = 8183')
  config = config.replace('sql_paths = ["./seed.sql"]', 'sql_paths = []')
  writeFileSync(join(directory, 'supabase/config.toml'), config)
  targetStarted = true
  run(cli, ['start', '--workdir', directory, '-x', 'studio,realtime,edge-runtime,logflare,vector'])
  const target = JSON.parse(run(cli, ['status', '--workdir', directory, '-o', 'json']))
  assert.equal(new URL(target.API_URL).port, '55321')
  assert.equal(new URL(target.DB_URL).port, '55322')
  const restoreStarted = Date.now()
  const sql = ['roles', 'schema', 'data'].map(name => readFileSync(join(directory, `${name}.sql`), 'utf8'))
  // O destino Supabase já tem grants automáticos. Neutralizá-los antes de criar
  // objetos evita permissões extras que o dump (feito para banco limpo) não revoga.
  let defaults = ''
  for (const role of ['postgres', 'supabase_admin']) for (const scope of ['', ' IN SCHEMA public']) {
    for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) defaults += `ALTER DEFAULT PRIVILEGES FOR ROLE ${role}${scope} REVOKE ALL ON ${kind} FROM PUBLIC, anon, authenticated, service_role;\n`
  }
  run('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--single-transaction'], sql[0] + '\n' + defaults + sql[1] + '\nSET session_replication_role = replica;\n' + sql[2])
  targetDb = await localDatabase(target)
  await targetDb.query('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)')
  assert.equal(Number((await targetDb.query('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n), 0)
  await targetDb.query('insert into supabase_migrations.schema_migrations select * from jsonb_populate_recordset(null::supabase_migrations.schema_migrations,$1)', [readFileSync(join(directory, 'migrations.json'), 'utf8')])
  assert.deepEqual((await targetDb.query('select version, statements, name from supabase_migrations.schema_migrations order by version')).rows, migrations)
  // pg_cron e arquivos Storage são restaurados explicitamente; Vault não é copiado.
  for (const job of jobs) await targetDb.query('select cron.schedule($1,$2,$3)', [job.jobname, job.schedule, job.command])
  await targetDb.query("notify pgrst, 'reload schema'")
  assert.deepEqual(await counts(targetDb), expected)
  assert.deepEqual((await targetDb.query(permissionSql)).rows, expectedPermissions, 'permissões de todas as funções públicas/privadas preservadas')
  assert.deepEqual((await targetDb.query(tablePermissionSql)).rows, expectedTablePermissions, 'RLS e grants de tabelas preservados')
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY ?? target.SECRET_KEY, opts)
  const owner = createClient(target.API_URL, target.PUBLISHABLE_KEY ?? target.ANON_KEY, opts)
  assert.equal((await owner.auth.signInWithPassword({ email, password: secret })).error, null)
  const restored = await owner.rpc('organizer_invitations', { p_event_id: f.event.id })
  assert.equal(restored.error, null)
  assert.deepEqual(restored.data, dashboard)
  assert.equal((await admin.storage.from('event-public').upload(coverPath, readFileSync(join(directory, 'cover.png')), { contentType: 'image/png', upsert: true })).error, null)
  const restoredCover = await admin.storage.from('event-public').download(coverPath)
  assert.equal(restoredCover.error, null)
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  assert.equal(digest(Buffer.from(await restoredCover.data.arrayBuffer())), digest(cover))
  const action = async (token, name, payload = {}) => (await targetDb.query('select public.guest_action($1,$2,$3) result', [token, name, payload])).rows[0].result
  const guest = await action(f.invite.token, 'exchange')
  const reservation = guest.snapshot.items.find(i => i.id === diaper.id).own
  await action(guest.session_token, 'cancel', { item_id: diaper.id, version: reservation.version, request_id: randomUUID() })
  const changed = await action(guest.session_token, 'reserve', { item_id: diaper.id, quantity: 3, version: reservation.version + 1, request_id: randomUUID() })
  assert.equal(changed.snapshot.items.find(i => i.id === diaper.id).committed, 3)
  assert.deepEqual((await targetDb.query('select jobname from cron.job order by jobname')).rows.map(r => r.jobname), ['personal-data-retention'])
  assert.equal((await targetDb.query("select has_schema_privilege('anon','private','usage') allowed")).rows[0].allowed, false)
  assert.equal((await targetDb.query("select has_function_privilege('anon','public.retention_run()','execute') allowed")).rows[0].allowed, false)
  const anon = createClient(target.API_URL, target.PUBLISHABLE_KEY ?? target.ANON_KEY, opts)
  assert.ok((await anon.from('reservations').select('id')).error)
  console.log(JSON.stringify({ result: 'passed', restoredCounts: expected, restoreAndValidationSeconds: (Date.now() - restoreStarted) / 1000, totalSeconds: (Date.now() - started) / 1000, checks: ['login com senha restaurada', 'painel e versões idênticos', 'capa SHA-256 idêntica', 'convite, cancelamento e nova reserva por RPC SQL', '20 migrations', 'cron', 'RLS, grants e isolamento anon'] }))
} catch (error) {
  // Não imprimir buffers do CLI, dumps, senhas ou tokens em falhas.
  console.error('Ensaio falhou:', error.code ?? error.name, error.stdout ? 'comando externo falhou; saída privada omitida' : error.message)
  process.exitCode = 1
} finally {
  try {
    await targetDb?.end()
    if (f) {
      try {
        if (coverPath) assert.equal((await f.admin.storage.from('event-public').remove([coverPath])).error, null)
      } finally { await f.cleanup() }
      // A origem local fica sem tráfego concorrente durante o ensaio.
      await sourceDb.query('delete from private.guest_rate where not (key_hash = any($1::text[]))', [rateBefore.map(r => r.key_hash)])
      for (const row of rateBefore) await sourceDb.query('insert into private.guest_rate(key_hash,window_start,requests) values($1,$2,$3) on conflict(key_hash) do update set window_start=excluded.window_start, requests=excluded.requests', [row.key_hash, row.window_start, row.requests])
      const remaining = await counts(sourceDb)
      console.log('Contagens locais após limpeza:', JSON.stringify(remaining))
      assert.ok(Object.values(remaining).every(n => n === 0))
      const rates = (await sourceDb.query('select key_hash, window_start, requests from private.guest_rate order by key_hash')).rows
      assert.deepEqual(rates, [...rateBefore].sort((a, b) => a.key_hash.localeCompare(b.key_hash)))
      console.log('Cotas técnicas locais restauradas ao estado anterior.')
    }
  } finally {
    await sourceDb?.end()
    try { if (targetStarted) run(cli, ['stop', '--workdir', directory, '--no-backup']) }
    finally { rmSync(directory, { recursive: true, force: true }) }
  }
}
