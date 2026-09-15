// Publish only a completed encrypted backup, then verify a fresh download from R2.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

process.umask(0o077)
let directory
const digest = async path => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
try {
  const endpoint = new URL(process.env.R2_ENDPOINT)
  assert.match(endpoint.hostname, /^[a-f0-9]{32}(\.(eu|fedramp|us))?\.r2\.cloudflarestorage\.com$/)
  assert.equal(endpoint.protocol, 'https:')
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && !endpoint.port)
  assert.equal(endpoint.pathname, '/')
  const bucket = process.env.R2_BUCKET
  assert.match(bucket ?? '', /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
  assert.ok(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY, 'Credenciais R2 ausentes')
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'))
  assert.equal(report.status, 'encrypted')
  assert.equal(report.project, 'fcykqrlnofmdtmewlejr')
  const name = basename(report.archive)
  assert.match(name, /^chadbb-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.tar\.gz\.gpg$/)
  assert.equal(await digest(report.archive), report.sha256, 'Arquivo local diverge do relatório')
  const destination = `s3://${bucket}/${name}`
  const aws = args => execFileSync('aws', [...args, '--endpoint-url', endpoint.origin, '--region', 'auto'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_EC2_METADATA_DISABLED: 'true', AWS_PAGER: '' },
  })
  directory = await mkdtemp(join(tmpdir(), 'chadbb-r2-verify-'))
  aws(['s3', 'cp', report.archive, destination, '--only-show-errors'])
  const downloaded = join(directory, name)
  aws(['s3', 'cp', destination, downloaded, '--only-show-errors'])
  assert.equal(await digest(downloaded), report.sha256, 'Download R2 diverge do arquivo original')
  console.log(JSON.stringify({ status: 'published-and-verified', key: name, sha256: report.sha256 }))
} catch {
  // AWS errors may contain request details. Keep diagnostic output out of Actions logs.
  console.error('Publicação/verificação R2 falhou. Backup externo não confirmado.')
  process.exitCode = 1
} finally {
  if (directory) await rm(directory, { recursive: true, force: true })
}
