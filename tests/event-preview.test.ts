import { describe, expect, it, vi } from 'vitest'
import { previewDate, withEventPreview } from '../src/lib/eventPreview'
import { onRequestGet } from '../functions/c/[id]'

const html = `<!doctype html><html><head><title>Convite · chá de bebê</title>
<meta property="og:title" content="Você recebeu um convite para um chá de bebê" />
<meta property="og:description" content="Toque para ver os detalhes." />
<meta property="og:image" content="https://chadbb.pages.dev/og-convite.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="Convite genérico" />
</head><body><div id="root"></div></body></html>`
const meta = (page: string, property: string) => page.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1]
const preview = { title: 'Chá da Liz', public_description: 'Venha celebrar com a gente!', starts_at: '2026-11-01T15:00:00Z', image_path: 'u/e/preview-1.jpg' }

describe('prévia do convite por evento', () => {
  it('data no horário de Brasília, com o dia da semana e a hora', () => {
    expect(previewDate('2026-11-01T15:00:00Z')).toBe('domingo, 1 de novembro, 12h')
    expect(previewDate('2026-11-01T15:30:00Z')).toBe('domingo, 1 de novembro, 12h30')
  })
  it('troca título, descrição, imagem e texto alternativo, sem dados privados', () => {
    const page = withEventPreview(html, preview, 'https://abc.supabase.co')
    expect(meta(page, 'og:title')).toBe('Convite: Chá da Liz')
    expect(meta(page, 'og:description')).toBe('domingo, 1 de novembro, 12h. Venha celebrar com a gente!')
    expect(meta(page, 'og:image')).toBe('https://abc.supabase.co/storage/v1/object/public/event-public/u/e/preview-1.jpg')
    expect(meta(page, 'og:image:type')).toBe('image/jpeg')
    expect(meta(page, 'og:image:alt')).toBe('Convite: Chá da Liz, domingo, 1 de novembro, 12h')
    expect(page).toContain('<title>Convite · Chá da Liz</title>')
  })
  it('escapa o que o organizador escreveu e mantém a imagem genérica sem arte', () => {
    const page = withEventPreview(html, { ...preview, title: 'Chá "da" <Liz> & cia', public_description: '', image_path: null }, 'https://abc.supabase.co')
    expect(meta(page, 'og:title')).toBe('Convite: Chá &quot;da&quot; &lt;Liz&gt; &amp; cia')
    expect(page).not.toContain('<Liz>')
    expect(meta(page, 'og:image')).toBe('https://chadbb.pages.dev/og-convite.png')
    expect(meta(page, 'og:description')).toBe('domingo, 1 de novembro, 12h. Toque no link para confirmar presença e escolher o presente.')
  })
})

describe('Pages Function /c/:id', () => {
  const assets = { fetch: vi.fn(async () => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' } })) }
  const env = { ASSETS: assets, VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }
  const call = (id: string) => onRequestGet({ request: new Request(`https://chadbb.online/c/${id}`), env, params: { id } })
  const id = '20000000-0000-4000-8000-000000000002'

  it('consulta só a projeção pública do evento e devolve o convite com a prévia', async () => {
    const remote = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([preview]), { status: 200 }))
    vi.stubGlobal('fetch', remote)
    const response = await call(id)
    const [url, init] = remote.mock.calls[0]
    expect(String(url)).toBe('https://abc.supabase.co/rest/v1/rpc/public_event_preview')
    expect(JSON.parse(String(init?.body))).toEqual({ p_event_id: id })
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_publishable_x')
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(meta(await response.text(), 'og:title')).toBe('Convite: Chá da Liz')
    vi.unstubAllGlobals()
  })
  it('id inválido, evento não publicado ou falha do banco: convite com a prévia genérica', async () => {
    const remote = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', remote)
    expect(meta(await (await call('nao-e-uuid')).text(), 'og:title')).toBe('Você recebeu um convite para um chá de bebê')
    expect(remote).not.toHaveBeenCalled()
    remote.mockResolvedValueOnce(new Response('[]', { status: 200 }))
    expect(meta(await (await call(id)).text(), 'og:title')).toBe('Você recebeu um convite para um chá de bebê')
    remote.mockRejectedValueOnce(new Error('offline'))
    const failed = await call(id)
    expect(failed.status).toBe(200)
    expect(meta(await failed.text(), 'og:title')).toBe('Você recebeu um convite para um chá de bebê')
    vi.unstubAllGlobals()
  })
})
