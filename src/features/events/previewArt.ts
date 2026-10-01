import { previewDate } from '../../lib/eventPreview'

// Arte da prévia do link do convite (WhatsApp), desenhada no navegador do organizador:
// 1200×630, JPEG abaixo de 300 KB (acima disso o WhatsApp não mostra a imagem). Layout
// aprovado pelo titular em 01/10: aviso de convite, capa à esquerda, título, dia e
// horário à direita; marca e assinatura embaixo. Cores e fontes do tema bebê.
const W = 1200, H = 630
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
  // Aviso de convite com estrelinhas.
  context.fillStyle = colors.brand; context.font = `800 22px ${sans}`; context.letterSpacing = '5px'
  context.textBaseline = 'alphabetic'; context.fillText('VOCÊ RECEBEU UM CONVITE', 110, 118); context.letterSpacing = '0px'
  motif(context, 980, 66, 0.9, [[star, null, colors.brand], [sparkles, null, colors.champagne]])
  // Capa (recorte quadrado, como object-fit: cover) ou, sem capa, a nuvem com coração.
  const box = { x: 110, y: 160, size: 300 }
  rounded(context, box.x, box.y, box.size, box.size, 28)
  context.save(); context.clip()
  context.fillStyle = colors.soft; context.fillRect(box.x, box.y, box.size, box.size)
  const image = cover ? await loadImage(cover).catch(() => null) : null
  if (image) {
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, box.x, box.y, box.size, box.size)
  } else motif(context, box.x + 10, box.y + 70, 1.4, [[cloud, colors.card, colors.brand], [heart, colors.blush, colors.brand]])
  context.restore()
  rounded(context, box.x, box.y, box.size, box.size, 28); context.lineWidth = 2; context.strokeStyle = colors.line; context.stroke()
  // Título (até 3 linhas, encolhe se for longo), dia e horário, chamada.
  const left = 460, width = W - left - 110
  let size = 76, titleLines: string[] = []
  for (; size >= 48; size -= 4) {
    context.font = `650 ${size}px ${display}`
    titleLines = lines(context, title.trim() || 'Chá de bebê', width, 3)
    if (titleLines.length <= 2 || size === 48) break
  }
  context.fillStyle = colors.deep
  let y = 230
  for (const line of titleLines) { context.fillText(line, left, y); y += size * 1.08 }
  if (startsAt) {
    context.font = `700 32px ${sans}`; context.fillStyle = colors.brand
    const when = previewDate(startsAt)
    context.fillText(when.charAt(0).toUpperCase() + when.slice(1), left, y + 18); y += 50
  }
  context.font = `600 26px ${sans}`; context.fillStyle = colors.muted
  context.fillText('Toque no link para confirmar presença', left, y + 26)
  // Marca e assinatura.
  rounded(context, 110, 500, 44, 44, 12); context.fillStyle = colors.brand; context.fill()
  context.fillStyle = '#fff'; context.font = `800 22px ${sans}`; context.textAlign = 'center'; context.fillText('c', 132, 529); context.textAlign = 'left'
  context.fillStyle = colors.ink; context.font = `800 26px ${sans}`; context.fillText('chadbb', 168, 531)
  context.fillStyle = colors.brand; context.fillText('.', 168 + context.measureText('chadbb').width, 531)
  context.font = `700 22px ${sans}`; context.textAlign = 'right'; context.fillText('Pequenos começos, muito amor.', W - 110, 531)
  // JPEG: com foto de capa, PNG passaria fácil dos 300 KB.
  for (const quality of [0.86, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= 300 * 1024) return blob
  }
  throw new Error('PREVIEW_TOO_LARGE')
}
