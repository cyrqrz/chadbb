import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Página pública e estática: não depende do Supabase.
test('privacidade e termos: seções, contato, âncora, acessível e cabe em 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/privacidade#organizadores')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidade e termos' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Para convidados' })).toBeVisible()
  const terms = page.getByRole('heading', { name: 'Para organizadores — termos de uso' })
  await expect(terms).toBeInViewport()
  await expect(page.getByRole('link', { name: 'contato@chadbb.online' })).toHaveAttribute('href', 'mailto:contato@chadbb.online')
  await expect(page.getByText('mantido por Leonardo Martins')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([])
})

test('rodapé leva à privacidade em nova aba, sem tirar o visitante da página atual', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('contentinfo').getByRole('link', { name: 'Privacidade e termos (abre em nova aba)' })
  await expect(link).toHaveAttribute('href', '/privacidade')
  await expect(link).toHaveAttribute('target', '_blank')
})
