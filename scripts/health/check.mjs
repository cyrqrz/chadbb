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

// 2. Inspeciona os módulos e preloads declarados no HTML publicado.
// O build com duas páginas divide a configuração entre chunks e muda o nome da entrada.
try {
  const page = await getFresh(SITE)
  if (page.status !== 200) throw new Error('HTML indisponível')
  const assets = new Set()
  for (const tag of page.text.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]]))
    const path = /^<script\b/i.test(tag) && attrs.type === 'module' ? attrs.src
      : /^<link\b/i.test(tag) && attrs.rel === 'modulepreload' ? attrs.href : null
    if (!path) continue
    const url = new URL(path, SITE)
    if (url.origin === SITE && url.pathname.endsWith('.js')) assets.add(url.href)
  }
  if (!assets.size) throw new Error('módulos não localizados')
  const bundles = await Promise.all([...assets].map(async url => {
    const asset = await get(url)
    if (asset.status !== 200 || /^\s*<(?:!doctype|html)\b/i.test(asset.text)) throw new Error('módulo indisponível')
    return asset.text
  }))
  const bundle = bundles.join('\n')
  const configured = new RegExp(`https://${REF}\\.supabase\\.co`).test(bundle) && /sb_publishable_[A-Za-z0-9_-]+/.test(bundle)
  // O SDK contém os nomes dos prefixos; só uma credencial completa indica vazamento.
  const privilegedJwt = [...bundle.matchAll(/\beyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)].some(match => {
    try { return JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role' } catch { return false }
  })
  const leaked = /sb_secret_[A-Za-z0-9_-]+/.test(bundle) || privilegedJwt
  record('frontend configurado', configured, configured ? `${assets.size} módulos conferidos` : 'módulos sem URL/chave pública esperadas')
  record('frontend sem segredo', !leaked, leaked ? 'CHAVE SECRETA NOS MÓDULOS' : 'nenhuma credencial secreta nos módulos declarados no HTML')
} catch {
  record('frontend configurado', false, 'site não respondeu como esperado')
}

// 3. O PostgREST responde e continua negando leitura anônima.
// Vale como regressão de segurança: se um grant for afrouxado, anon passa a ler e isto falha.
// Toca o banco de verdade — o erro 42501 vem do próprio Postgres, não do PostgREST.
try {
  const key = process.env.CHADBB_PUBLISHABLE_KEY ?? 'sb_publishable_dL_DxguwKnPNPYHYWJxDGw_J3lh1fUH'
  const response = await fetch(`https://${REF}.supabase.co/rest/v1/events?select=id&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) })
  const body = await response.json().catch(() => null)
  const denied = (response.status === 401 || response.status === 403) && body?.code === '42501'
  record('anon recusado no PostgREST', denied, `${response.status}${body?.code ? ` / ${body.code}` : ''}`)
} catch {
  record('anon recusado no PostgREST', false, 'PostgREST não respondeu — projeto pausado?')
}

// 4. O backup mais recente no R2 está dentro da janela de RPO.
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
