// Gera as imagens de prévia (WhatsApp e redes) a partir dos modelos HTML desta pasta:
// public/og-convite.png (link do convite) e public/og-site.png (home e demais páginas).
// 1200×630, abaixo de 300 KB (acima disso o WhatsApp não mostra a imagem).
// Uso: node scripts/og/render.mjs
import { chromium } from 'playwright'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
for (const name of ['convite', 'site']) {
  await page.goto(`file://${here}${name}.html`)
  await page.evaluate('document.fonts.ready')
  const out = fileURLToPath(new URL(`../../public/og-${name}.png`, import.meta.url))
  await page.screenshot({ path: out })
  const { size } = await stat(out)
  console.log(`og-${name}.png: ${Math.round(size / 1024)} KB`)
  if (size > 300 * 1024) throw new Error(`og-${name}.png passou de 300 KB`)
}
await browser.close()
