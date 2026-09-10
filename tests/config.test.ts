import { describe, expect, it } from 'vitest'
import { readPublicConfig } from '../src/lib/config'

const key = 'sb_publishable_fake_local_test'
describe('configuração pública', () => {
  it('permite abrir a aplicação sem backend', () => {
    expect(readPublicConfig({}).status).toBe('missing')
  })
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'https://example.supabase.co'])('aceita %s', (url) => {
    expect(readPublicConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key }).status).toBe('ready')
  })
  it.each(['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com?token=secret'])('rejeita URL inadequada: %s', (url) => {
    expect(readPublicConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key }).status).toBe('invalid')
  })
  it.each(['sb_secret_do_not_expose', 'eyJhbGciOiJIUzI1NiJ9.payload.signature'])('rejeita credenciais não publicáveis', (credential) => {
    const result = readPublicConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: credential })
    expect(result.status).toBe('invalid')
    expect(JSON.stringify(result)).not.toContain(credential)
  })
})
