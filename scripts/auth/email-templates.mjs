// Modelos de e-mail do Auth no chadbb-cha. Padrão: só mostra o que mudaria.
// Aplicar: CHADBB_AUTH_REF=<ref> node scripts/auth/email-templates.mjs --apply
// Nunca imprime o token de acesso nem outros campos da configuração do Auth.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const ref = 'fcykqrlnofmdtmewlejr'
const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some(a => a !== '--apply') || (apply && process.env.CHADBB_AUTH_REF !== ref)) {
  console.error('Use sem argumentos (prévia) ou --apply com CHADBB_AUTH_REF correto. Nada executado.'); process.exit(1)
}
const subject = 'Seu código de acesso ao chadbb'
const content = readFileSync(new URL('../../supabase/templates/acesso.html', import.meta.url), 'utf8')
const desired = {
  mailer_subjects_magic_link: subject, mailer_templates_magic_link_content: content,
  mailer_subjects_confirmation: subject, mailer_templates_confirmation_content: content,
}
const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${readFileSync(join(homedir(), '.supabase/access-token'), 'utf8').trim()}`, 'Content-Type': 'application/json' }
const describe = value => typeof value === 'string' && value.length > 80
  ? `${value.length} caracteres, sha256 ${createHash('sha256').update(value).digest('hex').slice(0, 12)}, variáveis ${[...new Set(value.match(/\{\{\s*\.\w+\s*\}\}/g) ?? [])].join(' ')}`
  : JSON.stringify(value)
async function read() {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`leitura recusada (${response.status})`)
  return response.json()
}
try {
  const current = await read()
  assert(current.mailer_otp_length === 8, 'o código precisa ter 8 dígitos no projeto')
  const changes = Object.keys(desired).filter(key => current[key] !== desired[key])
  console.log(`Projeto ${ref} · código de ${current.mailer_otp_length} dígitos · validade ${current.mailer_otp_exp} s`)
  for (const key of Object.keys(desired)) {
    console.log(`${changes.includes(key) ? 'MUDA ' : 'igual'} ${key}\n  atual: ${describe(current[key])}\n  novo:  ${describe(desired[key])}`)
  }
  if (!apply) { console.log(changes.length ? 'Prévia: nada foi alterado.' : 'Nada a alterar.'); process.exit(0) }
  if (!changes.length) { console.log('Nada a alterar.'); process.exit(0) }
  const response = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(Object.fromEntries(changes.map(k => [k, desired[k]]))), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`alteração recusada (${response.status})`)
  const after = await read()
  const pending = Object.keys(desired).filter(key => after[key] !== desired[key])
  assert(!pending.length, `campos diferentes após aplicar: ${pending.join(', ')}`)
  console.log(`PASS: ${changes.length} campos aplicados e conferidos.`)
} catch (error) {
  console.error(`FAIL: ${error.message}`); process.exit(1)
}
function assert(condition, message) { if (!condition) throw new Error(message) }
