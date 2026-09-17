// Sessão fictícia do organizador para os testes com backend simulado.
export const userId = '00000000-0000-4000-8000-000000000001'
export function session() {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'organizer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp, role: 'authenticated', aud: 'authenticated' })).toString('base64url')}.fake-signature`
  return { access_token: token, refresh_token: 'fake-refresh-token', expires_in: 3600, expires_at: exp, token_type: 'bearer', user }
}
