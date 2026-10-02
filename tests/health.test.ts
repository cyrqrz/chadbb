import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const runner = fileURLToPath(new URL('../scripts/health/check.mjs', import.meta.url))
const site = 'https://chadbb.pages.dev'
const config = 'https://fcykqrlnofmdtmewlejr.supabase.co sb_publishable_ficticia'
const html = '<script type="module" src="/assets/ui-a.js"></script><script type="module" src="/assets/main-b.js"></script>'

// O runner inteiro usa transporte simulado: nenhuma requisição ou credencial real.
function run(page: string, assets: Record<string, string | { status: number; text: string }>) {
  const source = `
    const assets = ${JSON.stringify(assets)};
    const seen = new Set();
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      if (url.pathname === '/functions/v1/guest') {
        const allowed = options.headers.Origin === '${site}';
        return new Response(JSON.stringify({error: allowed ? 'METHOD_NOT_ALLOWED' : 'ORIGIN_DENIED'}), {status: allowed ? 405 : 403});
      }
      if (url.pathname === '/rest/v1/events') return new Response(JSON.stringify({code:'42501'}), {status:401});
      if (url.origin !== '${site}') throw new Error('external asset');
      if (url.pathname === '/') return new Response(${JSON.stringify(page)});
      if (seen.has(url.pathname)) throw new Error('duplicate asset');
      seen.add(url.pathname);
      const asset = assets[url.pathname];
      if (asset === undefined) throw new Error('unknown asset');
      return new Response(typeof asset === 'string' ? asset : asset.text, {status: typeof asset === 'string' ? 200 : asset.status});
    };
    await import(${JSON.stringify(runner)});
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', env: { PATH: process.env.PATH, CHADBB_PUBLISHABLE_KEY: 'ficticia' },
  })
  return { status: result.status, output: result.stdout + result.stderr }
}

describe('monitor do frontend publicado', () => {
  it('encontra configuração fora do primeiro módulo sem depender do nome index', () => {
    expect(run(html, { '/assets/ui-a.js': 'ui', '/assets/main-b.js': config }).status).toBe(0)
  })

  it('inclui modulepreload, aceita marcadores do SDK e elimina duplicatas', () => {
    const page = html + '<link rel="modulepreload" href="/assets/config.js"><link rel="modulepreload" href="/assets/config.js">'
    expect(run(page, { '/assets/ui-a.js': 'sb_secret_ service_role', '/assets/main-b.js': 'main', '/assets/config.js': config }).status).toBe(0)
  })

  for (const credential of ['sb_secret_ficticia123456', `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"role":"service_role"}').toString('base64url')}.ficticia`]) {
    it('recusa credencial secreta fictícia sem exibir seu valor', () => {
      const result = run(html, { '/assets/ui-a.js': config, '/assets/main-b.js': credential })
      expect(result.status).toBe(1)
      expect(result.output).toContain('FAIL  frontend sem segredo')
      expect(result.output).not.toContain(credential)
    })
  }

  for (const asset of [{ status: 404, text: config }, '<!doctype html>' + config, 'sem configuração', config.replace('fcykqrlnofmdtmewlejr', 'outro')]) {
    it('recusa asset inválido ou sem a configuração esperada', () => {
      expect(run(html, { '/assets/ui-a.js': 'ui', '/assets/main-b.js': asset }).status).toBe(1)
    })
  }

  it('recusa página sem módulos', () => {
    expect(run('<html></html>', {}).status).toBe(1)
  })

  it('não consulta scripts de outra origem', () => {
    expect(run(html + '<script type="module" src="https://externo.invalid/main.js"></script>', {
      '/assets/ui-a.js': 'ui', '/assets/main-b.js': config,
    }).status).toBe(0)
  })
})
