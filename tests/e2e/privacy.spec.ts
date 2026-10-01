import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Página pública e estática: não depende do Supabase.
test('privacidade e termos: seções, contato, âncora, acessível e cabe em 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/privacidade#organizadores')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidade e termos' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Para convidados' })).toBeVisible()
  const terms = page.getByRole('heading', { name: 'Termos para organizadores' })
  await expect(terms).toBeInViewport()
  // O cabeçalho fixo não pode cobrir o título depois do salto para a âncora.
  const header = await page.locator('.site-header').boundingBox()
  expect((await terms.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
  await expect(page.getByRole('navigation', { name: 'Nesta página' }).getByRole('link')).toHaveText(['Convidados', 'Organizadores', 'Contato'])
  await expect(page.getByRole('link', { name: 'Escrever para contato@chadbb.online' })).toHaveAttribute('href', 'mailto:contato@chadbb.online')
  await expect(page.getByText('mantido por Leonardo Martins')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([])
})

test('rodapé do site: links úteis e barra com a política de privacidade', async ({ page }) => {
  await page.goto('/')
  const footer = page.getByRole('contentinfo')
  const links = footer.getByRole('navigation', { name: 'Links úteis' }).getByRole('link')
  await expect(links).toHaveText(['Início', 'Como funciona', 'Perguntas frequentes', 'Entrar para organizar', 'Política de privacidade', 'Termos de uso', 'Contato'])
  await expect(footer.getByRole('link', { name: 'Política de Privacidade', exact: true })).toHaveAttribute('href', '/privacidade')
  await expect(footer.getByText(`© ${new Date().getFullYear()} chadbb`)).toBeVisible()
  await expect(footer.getByRole('link', { name: /facebook|instagram|youtube/i })).toHaveCount(0)
  await footer.getByRole('link', { name: 'Perguntas frequentes' }).click()
  const faq = page.getByRole('heading', { level: 2, name: /Tire suas dúvidas/ })
  await expect(faq).toBeFocused()
  await expect(faq).toBeInViewport()
  await page.goto('/privacidade')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Termos de uso' }).click()
  await expect(page.getByRole('heading', { name: 'Termos para organizadores' })).toBeInViewport()
})

// Celular, 01/10: clicar na política no fim da home abria a página nova ainda
// rolada até o rodapé, e parecia que nada tinha acontecido.
test('trocar de página pelo rodapé começa no topo da página nova', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 })
  await page.goto('/')
  const footer = page.getByRole('contentinfo')
  await footer.scrollIntoViewIfNeeded()
  await footer.getByRole('link', { name: 'Política de Privacidade', exact: true }).click()
  await expect(page).toHaveURL(/\/privacidade$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidade e termos' })).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  // Com âncora, vai para a seção e não para o topo.
  await page.goto('/')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Termos de uso' }).click()
  await expect(page.getByRole('heading', { name: 'Termos para organizadores' })).toBeInViewport()
})
