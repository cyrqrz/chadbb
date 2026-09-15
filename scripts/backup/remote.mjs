// Read-only backup of the event project. Outputs only encrypted archives.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const REF = 'fcykqrlnofmdtmewlejr'
const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.167'
const here = dirname(fileURLToPath(import.meta.url))
const config = join(homedir(), '.config/chadbb')
// Never relay child output by default: pg_dump errors can contain rows or connection details.
// CHADBB_BACKUP_DEBUG=1 keeps a redacted stderr tail, for operator diagnosis on a trusted terminal.
const debug = process.env.CHADBB_BACKUP_DEBUG === '1'
let secret = null
const redact = text => secret ? text.split(secret).join('***') : text
const run = (bin, args, env = process.env) => new Promise((resolveRun, reject) => {
  const p = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  let discardLine = false
  p.stdout.on('data', b => { stdout += b })
  if (debug) p.stderr.on('data', b => {
    let chunk = String(b)
    if (discardLine) {
      const newline = chunk.indexOf('\n')
      if (newline < 0) return
      chunk = chunk.slice(newline + 1)
      discardLine = false
    }
    stderr += chunk
    if (stderr.length > 4000) {
      const boundary = stderr.indexOf('\n', stderr.length - 4000)
      // Passwords cannot contain newlines; drop the whole cut line to avoid leaking a suffix.
      stderr = boundary < 0 ? '' : stderr.slice(boundary + 1)
      discardLine = boundary < 0
    }
  })
  else p.stderr.resume()
  p.on('error', () => reject(new Error(`Não foi possível iniciar ${bin}`)))
  p.on('close', code => code === 0
    ? resolveRun(stdout)
    : reject(new Error(`${bin} encerrou com código ${code}${debug && stderr ? `\n--- stderr ---\n${redact(stderr)}` : ''}`)))
})
const digest = async path => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const out = resolve(process.env.CHADBB_BACKUP_OUT ?? join(config, 'backups'))
const publicKey = resolve(process.env.CHADBB_BACKUP_PUBLIC_KEY_FILE ?? join(config, 'backup-public.asc'))
const directory = await mkdtemp(join(tmpdir(), 'chadbb-backup-'))
const bundle = join(directory, 'bundle')
let db, archive, complete = false, stage = 'configuração'
try {
  assert.equal(process.env.CHADBB_BACKUP_REF, REF, 'Projeto de backup não autorizado')
  const password = process.env.CHADBB_BACKUP_DB_PASSWORD ?? (await readFile(join(config, 'chadbb-cha.db-password'), 'utf8')).trim()
  assert.ok(password && !/[\r\n\0]/.test(password), 'Senha ausente ou formato inválido')
  secret = password
  const ca = await readFile(join(here, 'supabase-ca.crt'), 'utf8')
  const host = 'aws-0-sa-east-1.pooler.supabase.com'
  const user = `postgres.${REF}`
  await mkdir(bundle, { mode: 0o700 })
  await mkdir(out, { recursive: true, mode: 0o700 })
  const gnupg = join(directory, 'gnupg')
  await mkdir(gnupg, { mode: 0o700 })
  const gpgEnv = { ...process.env, GNUPGHOME: gnupg }
  await run('gpg', ['--batch', '--import', publicKey], gpgEnv)
  const keys = await run('gpg', ['--batch', '--with-colons', '--list-keys'], gpgEnv)
  const fingerprints = keys.split('\n').filter(l => l.startsWith('fpr:')).map(l => l.split(':')[9])
  assert.ok(fingerprints.length > 0, 'Chave pública de backup ausente')
  const recipient = fingerprints[0]
  if (process.env.CHADBB_BACKUP_RECIPIENT) assert.equal(recipient, process.env.CHADBB_BACKUP_RECIPIENT)
  stage = 'conexão TLS e snapshot'
  db = new pg.Client({ host, port: 5432, user, password, database: 'postgres', ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000 })
  await db.connect()
  assert.equal(db.connection.stream.authorized, true, 'TLS não validado')
  await db.query('begin isolation level repeatable read read only')
  const snapshot = (await db.query('select pg_export_snapshot() snapshot')).rows[0].snapshot
  assert.match(snapshot, /^[0-9A-Fa-f-]+$/)
  const capturedAt = (await db.query('select transaction_timestamp() time')).rows[0].time.toISOString()
  const migrationHistory = (await db.query('select version, statements, name from supabase_migrations.schema_migrations order by version')).rows
  const jobs = (await db.query('select jobname, schedule, command, active from cron.job order by jobname')).rows
  const objects = (await db.query('select o.bucket_id, o.name, o.metadata, b.public from storage.objects o join storage.buckets b on b.id=o.bucket_id order by o.bucket_id,o.name')).rows
  assert.ok(objects.every(o => o.bucket_id === 'event-public' && o.public), 'Existe Storage privado/não suportado; backup incompleto recusado')
  const counts = {}
  for (const table of ['auth.users','public.events','public.event_items','public.products','private.invitations','private.guest_sessions','public.reservations','private.guest_requests','private.guest_rate','private.retention_audit','storage.objects']) {
    counts[table] = Number((await db.query(`select count(*) n from ${table}`)).rows[0].n)
  }
  await writeFile(join(bundle, 'migrations.json'), JSON.stringify(migrationHistory), { mode: 0o600 })
  await writeFile(join(bundle, 'cron.json'), JSON.stringify(jobs), { mode: 0o600 })
  await copyFile(join(here, 'supabase-ca.crt'), join(directory, 'ca.crt'))
  const pgEnv = { PGHOST: host, PGPORT: '5432', PGUSER: user, PGPASSWORD: password, PGDATABASE: 'postgres', PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/backup/ca.crt', CHADBB_SNAPSHOT: snapshot, PGOPTIONS: '-c default_transaction_read_only=on' }
  await writeFile(join(directory, 'pg.env'), Object.entries(pgEnv).map(([k,v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 })
  for (const name of ['roles','schema','data']) {
    stage = `dump ${name}`
    await copyFile(join(here, `${name}.sh`), join(directory, `${name}.sh`))
    // Run as the host user: files written into the bind mount would otherwise be root-owned and the chmod below fails.
    await run('docker', ['run', '--rm', '--network', 'host', '--user', `${process.getuid()}:${process.getgid()}`, '--env-file', join(directory, 'pg.env'), '--mount', `type=bind,source=${directory},target=/backup`, '--entrypoint', 'bash', IMAGE, '-c', `bash /backup/${name}.sh > /backup/bundle/${name}.sql`])
    await chmod(join(bundle, `${name}.sql`), 0o600)
  }
  stage = 'cópia do Storage'
  await mkdir(join(bundle, 'storage'), { mode: 0o700 })
  const storage = []
  for (const [i, object] of objects.entries()) {
    // Numbered local names prevent object paths from escaping the backup directory.
    const file = `storage/${i}.bin`
    const path = object.name.split('/').map(encodeURIComponent).join('/')
    const response = await fetch(`https://${REF}.supabase.co/storage/v1/object/public/${encodeURIComponent(object.bucket_id)}/${path}`, { redirect: 'error', signal: AbortSignal.timeout(60000) })
    assert.equal(response.status, 200, 'Objeto do snapshot indisponível; backup recusado')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (object.metadata?.size !== undefined) assert.equal(bytes.length, Number(object.metadata.size), 'Tamanho do objeto mudou')
    await writeFile(join(bundle, file), bytes, { mode: 0o600 })
    storage.push({ bucket: object.bucket_id, name: object.name, metadata: object.metadata, file, sha256: await digest(join(bundle, file)) })
  }
  await db.query('commit')
  const files = {}
  for (const name of ['roles.sql','schema.sql','data.sql','migrations.json','cron.json']) files[name] = await digest(join(bundle, name))
  await writeFile(join(bundle, 'manifest.json'), JSON.stringify({ format: 1, project: REF, capturedAt, databaseVersion: (await db.query('show server_version')).rows[0].server_version, image: IMAGE, counts, files, storage, exclusions: ['Vault e senhas de roles', 'configuração e segredos de Auth/SMTP/Edge; reconfigurar na recuperação'], consistency: 'schema, dados, migrations, cron e inventário Storage no mesmo snapshot; objetos copiados por caminho imutável, falhando se ausentes' }, null, 2), { mode: 0o600 })
  stage = 'criptografia'
  const tarball = join(directory, 'backup.tar.gz')
  await run('tar', ['-czf', tarball, '-C', bundle, '.'])
  archive = join(out, `chadbb-${capturedAt.replace(/[:.]/g, '-')}.tar.gz.gpg`)
  await run('gpg', ['--batch', '--yes', '--trust-model', 'always', '--cipher-algo', 'AES256', '--recipient', recipient, '--output', archive, '--encrypt', tarball], gpgEnv)
  await chmod(archive, 0o600)
  complete = true
  console.log(JSON.stringify({ status: 'encrypted', capturedAt, project: REF, archive, sha256: await digest(archive), storageObjects: storage.length, migrations: migrationHistory.length }))
} catch (error) {
  console.error(`Backup falhou na etapa: ${stage}. Nenhuma cópia parcial deve ser publicada.`)
  if (debug) console.error(redact(String(error?.message ?? error)))
  process.exitCode = 1
} finally {
  await db?.end()
  if (!complete && archive) await rm(archive, { force: true })
  await rm(directory, { recursive: true, force: true })
}
