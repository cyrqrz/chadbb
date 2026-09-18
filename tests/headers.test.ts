import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// `public/_headers` é aplicado pelo Cloudflare Pages, fora do alcance dos e2e.
// Este teste guarda as diretivas que a produção precisa ter.
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
const csp = headers.split('\n').find(line => line.includes('Content-Security-Policy'))!.split('Content-Security-Policy:')[1]
const directive = (name: string) => csp.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `))

describe('CSP de produção', () => {
  test('a CSP existe e é restritiva por padrão', () => {
    expect(directive('default-src')).toBe("default-src 'self'")
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  // O Vite embute os trechos menores de Manrope/Fraunces como data: no CSS.
  // Sem font-src, o default-src bloqueia a fonte e a página cai no fallback.
  test('font-src libera as fontes do próprio site e as embutidas', () => {
    const fontSrc = directive('font-src')
    expect(fontSrc).toBeDefined()
    expect(fontSrc).toContain("'self'")
    expect(fontSrc).toContain('data:')
  })

  // Mapa do local no convite: só o embed do Google pode ser carregado em iframe.
  test('frame-src libera só o mapa do Google', () => {
    expect(directive('frame-src')).toBe('frame-src https://www.google.com https://maps.google.com')
  })
})
