// Prévia do link do convite com a cara do evento (fase 2 do plano do WhatsApp). Usado
// pela Pages Function `/c/:id` (meta tags) e pela arte gerada no navegador: a mesma data
// nos dois lugares. Só dados públicos por decisão do titular (01/10): título, descrição
// pública, dia e horário e a arte. Endereço e instruções nunca entram.
export type PublicPreview = { title: string; public_description: string; starts_at: string | null; image_path: string | null }

const zone = 'America/Sao_Paulo'
// “domingo, 1 de novembro, 12h” (ou 12h30), no horário de Brasília.
export function previewDate(startsAt: string) {
  const date = new Date(startsAt)
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  const [hour, minute] = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).split(':')
  return `${day}, ${Number(hour)}h${minute === '00' ? '' : minute}`
}

export const previewImageUrl = (supabaseUrl: string, path: string) =>
  `${supabaseUrl}/storage/v1/object/public/event-public/${path.split('/').map(encodeURIComponent).join('/')}`

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clip = (text: string, size: number) => text.length <= size ? text : `${text.slice(0, size - 1).trimEnd()}…`

// Troca só as meta tags da prévia no HTML do convite; o resto da página fica igual.
export function withEventPreview(html: string, preview: PublicPreview, supabaseUrl: string) {
  const title = clip(preview.title.trim() || 'Chá de bebê', 90)
  const when = preview.starts_at ? previewDate(preview.starts_at) : ''
  const description = clip([when, preview.public_description.trim() || 'Toque no link para confirmar presença e escolher o presente.'].filter(Boolean).join('. '), 200)
  const set = (page: string, property: string, value: string) =>
    page.replace(new RegExp(`(<meta property="${property}" content=")[^"]*(")`), `$1${escape(value)}$2`)
  let page = set(html, 'og:title', `Convite: ${title}`)
  page = set(page, 'og:description', description)
  page = set(page, 'og:image:alt', `Convite: ${[title, when].filter(Boolean).join(', ')}`)
  if (preview.image_path) {
    page = set(page, 'og:image', previewImageUrl(supabaseUrl, preview.image_path))
    page = set(page, 'og:image:type', 'image/jpeg')
  }
  return page.replace(/<title>[^<]*<\/title>/, `<title>Convite · ${escape(title)}</title>`)
}
