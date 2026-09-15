// Verificações de produção somente leitura. Sai diferente de zero se alguma falhar.
import { execFileSync } from 'node:child_process'

const REF = 'fcykqrlnofmdtmewlejr'
const SITE = 'https://chadbb.pages.dev'
const GUEST = `https://${REF}.supabase.co/functions/v1/guest`
const MAX_BACKUP_AGE_HOURS = Number(process.env.CHADBB_MAX_BACKUP_AGE_HOURS ?? 36)

const results = []
const record = (name, ok, detail, skipped = false) => {
  results.push({ name, ok, detail, skipped })
  console.log(`${skipped ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const get = async (url, headers = {}) => {
  const response = await fetch(url, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) })
  return { status: response.status, text: await response.text() }
}
// O index.html fica em cache na borda da Cloudflare: sem furar esse cache, uma verificação
// logo após um deploy lê o HTML antigo e acusa falha onde não há.
const getFresh = url => get(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`,
  { 'Cache-Control': 'no-cache', Pragma: 'no-cache' })

// 1. A Edge guest responde e continua recusando origem não autorizada.
try {
  const allowed = await get(GUEST, { Origin: SITE })
  const denied = await get(GUEST, { Origin: 'https://origem-nao-autorizada.invalid' })
  const okAllowed = allowed.status === 405 && JSON.parse(allowed.text)?.error === 'METHOD_NOT_ALLOWED'
  const okDenied = denied.status === 403 && JSON.parse(denied.text)?.error === 'ORIGIN_DENIED'
  record('edge guest responde', okAllowed, `origem do site -> ${allowed.status}`)
  record('edge guest recusa origem estranha', okDenied, `origem inválida -> ${denied.status}`)
} catch {
  record('edge guest responde', false, 'sonda não completou')
}

// 2. O bundle publicado tem a configuração pública e nenhum segredo.
try {
  const page = await getFresh(SITE)
  const asset = page.text.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
  if (!asset) throw new Error('bundle não localizado')
  const bundle = (await get(`${SITE}${asset}`)).text
  const configured = new RegExp(`https://${REF}\\.supabase\\.co`).test(bundle) && /sb_publishable_[A-Za-z0-9_-]+/.test(bundle)
  const leaked = /sb_secret_|service_role/.test(bundle)
  record('frontend configurado', configured, configured ? asset : `${asset} sem URL/chave pública — variáveis do Pages ausentes`)
  record('frontend sem segredo', !leaked, leaked ? 'CHAVE SECRETA NO BUNDLE' : 'nenhum sb_secret_/service_role')
} catch {
  record('frontend configurado', false, 'site não respondeu como esperado')
}

// 3. O backup mais recente no R2 está dentro da janela de RPO.
const endpoint = process.env.R2_ENDPOINT, bucket = process.env.R2_BUCKET
if (!endpoint || !bucket || !process.env.AWS_ACCESS_KEY_ID) {
  record('backup recente no R2', true, 'credenciais R2 ausentes nesta execução', true)
} else {
  try {
    const raw = execFileSync('aws', ['s3api', 'list-objects-v2', '--bucket', bucket, '--endpoint-url', endpoint,
      '--region', 'auto', '--query', 'sort_by(Contents,&LastModified)[-1].LastModified', '--output', 'text'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, AWS_PAGER: '' } }).trim()
    if (!raw || raw === 'None') throw new Error('bucket vazio')
    const hours = (Date.now() - new Date(raw).getTime()) / 3600000
    record('backup recente no R2', hours <= MAX_BACKUP_AGE_HOURS, `${hours.toFixed(1)} h desde o último (limite ${MAX_BACKUP_AGE_HOURS} h)`)
  } catch {
    // Erros da AWS podem conter detalhes da requisição; manter fora do log.
    record('backup recente no R2', false, 'listagem do bucket falhou ou bucket vazio')
  }
}

const failed = results.filter(r => !r.ok && !r.skipped)
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas`)
if (failed.length) { console.error(`Falhas: ${failed.map(r => r.name).join(', ')}`); process.exitCode = 1 }
