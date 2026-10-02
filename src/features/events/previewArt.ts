import { previewDate } from '../../lib/eventPreview'

// Arte da prévia do link do convite (WhatsApp), desenhada no navegador do organizador:
// 1200×630, JPEG abaixo de 300 KB (acima disso o WhatsApp não mostra a imagem). Desde
// 02/10 tudo o que importa fica na faixa central de 630 px: o WhatsApp do computador mostra
// só um quadrado recortado do centro, e o layout antigo (capa à esquerda, título à direita)
// virava meio urso e meio título. Marca, assinatura e enfeites ficam nas laterais.
const W = 1200, H = 630
// Muda quando o desenho muda: artes de outra versão são refeitas ao abrir o painel.
export const PREVIEW_ART_VERSION = 'v2'
// Faixa central que o WhatsApp do computador recorta (quadrado de 630 px).
const SAFE = { left: (W - H) / 2, width: H }
const colors = { cream: '#fff8ef', card: '#fffdf9', line: '#ecd3dc', brand: '#8e3658', deep: '#6f2645', ink: '#292326', muted: '#4a4045', soft: '#f6e4eb', blush: '#f2c4d4', champagne: '#d8bc86' }
const display = '"Fraunces Variable", Georgia, serif'
const sans = '"Manrope Variable", system-ui, sans-serif'
// Os mesmos desenhos de src/components/BabyMotif.tsx (viewBox 200×80).
const star = 'm100 16 6 18 18 6-18 6-6 18-6-18-18-6 18-6Z'
const sparkles = 'm49 31 3 7 7 2-7 2-3 7-2-7-7-2 7-2Zm101 0 3 7 7 2-7 2-3 7-2-7-7-2 7-2Z'
const cloud = 'M56 62h79c16 0 20-19 6-24-3-19-29-20-34-4-13-15-36-6-35 10-14-6-28 13-16 18Z'
const heart = 'M95 49c-7-8-16 1-8 8l8 6 8-6c8-7-1-16-8-8Z'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    // A capa vem do bucket público do Supabase, com CORS liberado: o canvas não fica “sujo”.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image); image.onerror = () => reject(new Error('COVER_UNAVAILABLE'))
    image.src = src
  })
}
function motif(context: CanvasRenderingContext2D, x: number, y: number, scale: number, paths: [string, string | null, string][]) {
  context.save(); context.translate(x, y); context.scale(scale, scale)
  context.lineWidth = 2.5 / scale * 1.1; context.lineCap = 'round'; context.lineJoin = 'round'
  for (const [d, fill, stroke] of paths) {
    const path = new Path2D(d)
    if (fill) { context.fillStyle = fill; context.fill(path) }
    context.strokeStyle = stroke; context.stroke(path)
  }
  context.restore()
}
function lines(context: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/), result: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (context.measureText(next).width <= width || !line) line = next
    else { result.push(line); line = word }
  }
  if (line) result.push(line)
  if (result.length <= max) return result
  const kept = result.slice(0, max)
  let last = kept[max - 1]
  while (last && context.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  kept[max - 1] = `${last.trimEnd()}…`
  return kept
}
function rounded(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath(); context.roundRect(x, y, w, h, r)
}

export async function drawPreviewArt({ title, startsAt, cover }: { title: string; startsAt: string | null; cover: string | null }): Promise<Blob> {
  await Promise.all([document.fonts.load(`650 64px ${display}`), document.fonts.load(`700 30px ${sans}`)]).catch(() => undefined)
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const context = canvas.getContext('2d')
  if (!context) throw new Error('CANVAS_UNAVAILABLE')
  context.fillStyle = colors.cream; context.fillRect(0, 0, W, H)
  // Cartão com o brilho rosado do tema.
  const glow = context.createRadialGradient(W, 0, 40, W, 0, 760)
  glow.addColorStop(0, colors.soft); glow.addColorStop(1, colors.card)
  rounded(context, 40, 40, W - 80, H - 80, 36); context.fillStyle = glow; context.fill()
  context.lineWidth = 2; context.strokeStyle = colors.line; context.stroke()
  const center = W / 2
  // Enfeites nas laterais: só aparecem na prévia larga.
  motif(context, 70, 120, 1, [[cloud, colors.card, colors.brand], [heart, colors.blush, colors.brand]])
  motif(context, 950, 70, 0.9, [[star, null, colors.brand], [sparkles, null, colors.champagne]])
  // Aviso de convite.
  context.textAlign = 'center'; context.textBaseline = 'alphabetic'
  context.fillStyle = colors.brand; context.font = `800 20px ${sans}`; context.letterSpacing = '5px'
  context.fillText('VOCÊ RECEBEU UM CONVITE', center, 100); context.letterSpacing = '0px'
  // Capa (recorte quadrado, como object-fit: cover) ou, sem capa, a nuvem com coração.
  const box = { x: center - 105, y: 124, size: 210 }
  rounded(context, box.x, box.y, box.size, box.size, 28)
  context.save(); context.clip()
  context.fillStyle = colors.soft; context.fillRect(box.x, box.y, box.size, box.size)
  const image = cover ? await loadImage(cover).catch(() => null) : null
  if (image) {
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, box.x, box.y, box.size, box.size)
  } else motif(context, box.x + 5, box.y + 45, 1, [[cloud, colors.card, colors.brand], [heart, colors.blush, colors.brand]])
  context.restore()
  rounded(context, box.x, box.y, box.size, box.size, 28); context.lineWidth = 2; context.strokeStyle = colors.line; context.stroke()
  // Título (até 2 linhas, encolhe se for longo), dia e horário, chamada: centralizados.
  const width = SAFE.width - 70
  let size = 64, titleLines: string[] = []
  for (; size >= 44; size -= 4) {
    context.font = `650 ${size}px ${display}`
    titleLines = lines(context, title.trim() || 'Chá de bebê', width, 2)
    // Para no primeiro tamanho em que o título cabe inteiro em 2 linhas; no menor, corta com “…”.
    if (lines(context, title.trim() || 'Chá de bebê', width, 99).length <= 2) break
  }
  context.fillStyle = colors.deep
  let y = 330 + size
  for (const line of titleLines) { context.fillText(line, center, y); y += size * 1.05 }
  y += 4
  if (startsAt) {
    context.font = `700 28px ${sans}`; context.fillStyle = colors.brand
    const when = previewDate(startsAt)
    context.fillText(when.charAt(0).toUpperCase() + when.slice(1), center, y); y += 40
  }
  context.font = `600 22px ${sans}`; context.fillStyle = colors.muted
  context.fillText('Toque no link para confirmar presença', center, y)
  // Marca à esquerda e assinatura à direita, fora do recorte central.
  context.textAlign = 'left'
  rounded(context, 80, 512, 40, 40, 11); context.fillStyle = colors.brand; context.fill()
  context.fillStyle = '#fff'; context.font = `800 20px ${sans}`; context.textAlign = 'center'; context.fillText('c', 100, 539); context.textAlign = 'left'
  context.fillStyle = colors.ink; context.font = `800 24px ${sans}`; context.fillText('chadbb', 132, 540)
  context.fillStyle = colors.brand; context.fillText('.', 132 + context.measureText('chadbb').width, 540)
  context.font = `700 20px ${sans}`; context.textAlign = 'right'
  context.fillText('Pequenos começos,', W - 80, 518); context.fillText('muito amor.', W - 80, 544); context.textAlign = 'left'
  // JPEG: com foto de capa, PNG passaria fácil dos 300 KB.
  for (const quality of [0.86, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= 300 * 1024) return blob
  }
  throw new Error('PREVIEW_TOO_LARGE')
}
