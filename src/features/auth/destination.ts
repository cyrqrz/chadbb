// Para onde voltar depois de entrar. O destino é pedido por quem foi barrado em
// `RequireAuth` e consumido no retorno, que pode ser outra aba: o link do e-mail
// abre onde o navegador quiser. Por isso a passagem é por `localStorage`, e não
// pelo estado do router, que morre na troca de aba.

const KEY = 'chadbb.login.destination'
// O código do e-mail vale 1 hora; depois disso o destino guardado é lixo.
const MAX_AGE_MS = 60 * 60 * 1000
// Voltar para uma destas seria um laço: são as telas do próprio login.
const NOT_A_DESTINATION = ['/entrar', '/auth/callback']

// Só caminho do próprio site. Uma URL externa aqui viraria redirecionamento
// aberto: bastaria mandar à vítima um link para `/eventos` e levá-la, depois do
// login, a um site que imita o chadbb. Daí recusar tudo que não seja um caminho
// começando por uma única barra.
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null
  // `//evil.com` e `/\evil.com` são lidos como endereço de outro site.
  if (/^\/[/\\]/.test(raw)) return null
  // `/javascript:...` e qualquer outro esquema.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  if (NOT_A_DESTINATION.some(path => raw === path || raw.startsWith(`${path}?`))) return null
  return raw
}

export function rememberDestination(raw: unknown): void {
  const path = safeInternalPath(raw)
  try {
    if (!path) return localStorage.removeItem(KEY)
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }))
  } catch { /* modo privado ou armazenamento bloqueado: seguir sem lembrar */ }
}

// Lê e apaga: o destino serve uma vez só, para uma entrada seguinte não herdar
// o caminho de uma tentativa antiga.
export function takeDestination(): string | null {
  let stored: string | null
  try {
    stored = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
  } catch { return null }
  if (!stored) return null
  try {
    const { path, at } = JSON.parse(stored) as { path?: unknown; at?: unknown }
    if (typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) return null
    return safeInternalPath(path)
  } catch { return null }
}
