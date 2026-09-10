export type PublicConfig = { url: string; key: string }
export type ConfigResult =
  | { status: 'ready'; config: PublicConfig }
  | { status: 'missing' | 'invalid'; message: string }

export function readPublicConfig(env: Record<string, unknown>): ConfigResult {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { status: 'missing', message: 'A conexão será habilitada após configurar o ambiente.' }
  if (typeof url !== 'string' || typeof key !== 'string') return invalid()
  try {
    const parsed = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return invalid()
    // O piloto usa somente publishable keys; chaves JWT legadas e secret keys são rejeitadas.
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return invalid()
    return { status: 'ready', config: { url: parsed.origin, key } }
  } catch { return invalid() }
}
function invalid(): ConfigResult {
  return { status: 'invalid', message: 'Configuração de conexão inválida. Confira as variáveis públicas do ambiente.' }
}
