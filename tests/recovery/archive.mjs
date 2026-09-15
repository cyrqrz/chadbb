// Restore a trusted, encrypted remote backup into an isolated, disposable local Supabase.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

process.umask(0o077)
const started = Date.now()
const archive = process.argv[2]
assert.ok(archive, 'Uso: npm run test:recovery:archive -- /caminho/backup.tar.gz.gpg')
const cli = resolve('node_modules/.bin/supabase')
const directory = mkdtempSync(join(tmpdir(), 'chadbb-archive-recovery-'))
const project = `chadbb-archive-${Date.now()}`
const bundle = join(directory, 'bundle')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
let targetStarted = false, db, stage = 'descriptografia'
const run = (bin, args, input) => {
  try { return execFileSync(bin, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) }
  catch (error) {
    // SQL and CLI output may contain personal data; never send them to the terminal.
    const diagnostic = mkdtempSync(join(tmpdir(), 'chadbb-archive-diagnostic-'))
    writeFileSync(join(diagnostic, 'command-error.log'), `status=${error.status} signal=${error.signal}\n${error.stderr ?? ''}\n${error.stdout ?? ''}`, { mode: 0o600 })
    console.error(`Diagnóstico privado: ${diagnostic}/command-error.log`)
    throw new Error(`Falha em ${bin}; saída privada omitida`, { cause: error })
  }
}
try {
  const encryptedSha256 = digest(readFileSync(archive))
  run('gpg', ['--batch', '--homedir', process.env.CHADBB_BACKUP_GNUPGHOME ?? join(homedir(), '.config/chadbb/backup-gnupg'), '--output', join(directory, 'backup.tar.gz'), '--decrypt', resolve(archive)])
  mkdirSync(bundle)
  // Require regular files/directories, reject paths outside the bundle and all links.
  run('python3', ['-c', `import tarfile, pathlib, sys
with tarfile.open(sys.argv[1]) as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise ValueError('Unsafe archive member')
    archive.extractall(sys.argv[2], filter='data')`, join(directory, 'backup.tar.gz'), bundle])
  stage = 'integridade'
  const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json')))
  assert.equal(manifest.format, 1)
  assert.equal(manifest.project, 'fcykqrlnofmdtmewlejr')
  const names = ['roles.sql', 'schema.sql', 'data.sql', 'migrations.json', 'cron.json']
  assert.deepEqual(Object.keys(manifest.files).sort(), [...names].sort())
  for (const name of names) assert.equal(digest(readFileSync(join(bundle, name))), manifest.files[name], `SHA-256: ${name}`)
  for (const object of manifest.storage) {
    assert.match(object.file, /^storage\/\d+\.bin$/)
    assert.equal(object.bucket, 'event-public')
    assert.equal(digest(readFileSync(join(bundle, object.file))), object.sha256, 'SHA-256 Storage')
  }
  const migrations = JSON.parse(readFileSync(join(bundle, 'migrations.json')))
  const jobs = JSON.parse(readFileSync(join(bundle, 'cron.json')))
  stage = 'preparação do destino descartável'
  console.log('Integridade conferida; iniciando Supabase descartável nas portas 56321–56329.')
  mkdirSync(join(directory, 'supabase'))
  const config = readFileSync('supabase/config.toml', 'utf8')
    .replace('project_id = "chadbb"', `project_id = "${project}"`)
    .replace(/\b543(\d{2})\b/g, '563$1')
    .replace('inspector_port = 8083', 'inspector_port = 8183')
    .replace('sql_paths = ["./seed.sql"]', 'sql_paths = []')
  writeFileSync(join(directory, 'supabase/config.toml'), config)
  targetStarted = true
  run(cli, ['start', '--workdir', directory, '-x', 'studio,realtime,edge-runtime,logflare,vector'])
  const target = JSON.parse(run(cli, ['status', '--workdir', directory, '-o', 'json']))
  for (const [value, port] of [[target.DB_URL, '56322'], [target.API_URL, '56321']]) {
    const url = new URL(value)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    assert.equal(url.port, port)
  }
  const restoreStarted = Date.now()
  stage = 'importação SQL'
  // Disable cron during the rehearsal so restored commands cannot run against remote services.
  run('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], "ALTER SYSTEM SET cron.launch_active_jobs = off;\nSELECT pg_reload_conf();")
  let defaults = ''
  for (const role of ['postgres', 'supabase_admin']) for (const scope of ['', ' IN SCHEMA public']) {
    for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) defaults += `ALTER DEFAULT PRIVILEGES FOR ROLE ${role}${scope} REVOKE ALL ON ${kind} FROM PUBLIC, anon, authenticated, service_role;\n`
  }
  run('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--single-transaction'],
    readFileSync(join(bundle, 'roles.sql'), 'utf8') + '\n' + defaults + readFileSync(join(bundle, 'schema.sql'), 'utf8') + '\nSET session_replication_role = replica;\n' + readFileSync(join(bundle, 'data.sql'), 'utf8'))
  db = new pg.Client({ connectionString: target.DB_URL })
  await db.connect()
  assert.equal((await db.query('show cron.launch_active_jobs')).rows[0]['cron.launch_active_jobs'], 'off')
  stage = 'histórico e cron'
  await db.query('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)')
  assert.equal(Number((await db.query('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n), 0)
  await db.query('insert into supabase_migrations.schema_migrations select * from jsonb_populate_recordset(null::supabase_migrations.schema_migrations,$1)', [JSON.stringify(migrations)])
  assert.deepEqual((await db.query('select version, statements, name from supabase_migrations.schema_migrations order by version')).rows, migrations)
  for (const job of jobs) {
    const id = (await db.query('select cron.schedule($1,$2,$3) id', [job.jobname, job.schedule, job.command])).rows[0].id
    await db.query('select cron.alter_job($1, active := $2)', [id, job.active])
  }
  assert.deepEqual((await db.query('select jobname, schedule, command, active from cron.job order by jobname')).rows, jobs)
  stage = 'Storage e contagens'
  const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY ?? target.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const object of manifest.storage) {
    const bucket = admin.storage.from(object.bucket)
    assert.equal((await bucket.upload(object.name, readFileSync(join(bundle, object.file)), { upsert: true, contentType: object.metadata?.mimetype ?? 'application/octet-stream' })).error, null)
    const downloaded = await bucket.download(object.name)
    assert.equal(downloaded.error, null)
    assert.equal(digest(Buffer.from(await downloaded.data.arrayBuffer())), object.sha256)
  }
  const counts = {}
  for (const [table, expected] of Object.entries(manifest.counts)) {
    assert.match(table, /^(auth|public|private|storage)\.[a-z_]+$/)
    counts[table] = Number((await db.query(`select count(*) n from ${table}`)).rows[0].n)
    assert.equal(counts[table], expected, `Contagem: ${table}`)
  }
  assert.equal((await db.query("select has_schema_privilege('anon','private','usage') allowed")).rows[0].allowed, false)
  assert.equal((await db.query("select has_function_privilege('anon','public.retention_run()','execute') allowed")).rows[0].allowed, false)
  const timeouts = (await db.query("select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated','authenticator') order by rolname")).rows
  for (const role of timeouts) assert.ok(role.rolconfig.includes(`statement_timeout=${role.rolname === 'anon' ? '3s' : '8s'}`))
  console.log(JSON.stringify({ result: 'passed', encryptedSha256, capturedAt: manifest.capturedAt, restoredCounts: counts, migrations: migrations.length, cron: jobs.map(j => ({ name: j.jobname, schedule: j.schedule, active: j.active })), storageObjects: manifest.storage.length, restoreAndValidationSeconds: (Date.now() - restoreStarted) / 1000, totalSeconds: (Date.now() - started) / 1000 }))
} catch (error) {
  console.error(`Restauração falhou na etapa ${stage}: ${error.name}. Saída privada omitida.`)
  process.exitCode = 1
} finally {
  try { await db?.end() }
  finally {
    try { if (targetStarted) run(cli, ['stop', '--workdir', directory, '--no-backup']) }
    finally { rmSync(directory, { recursive: true, force: true }) }
  }
  console.log('Destino descartável e texto claro removidos.')
}
