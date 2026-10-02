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

// O CSS rola suave (`scroll-behavior: smooth`), e os e2e rodam com movimento
// reduzido: no celular comum a página nova aparecia no rodapé e subia animada.
test.describe('troca de página sem movimento reduzido', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('a página nova já abre no topo, sem rolar animada', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 })
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    // Desce sem animação, para a rolagem do próprio teste não entrar na conta.
    await page.evaluate(async () => {
      scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
      const w = window as unknown as { seen: number[] }
      w.seen = []
      addEventListener('scroll', () => w.seen.push(scrollY))
    })
    await footer.getByRole('link', { name: 'Política de Privacidade', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Privacidade e termos' })).toBeInViewport()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    // Nenhuma posição intermediária: o salto ao topo é um só.
    expect(await page.evaluate(() => (window as unknown as { seen: number[] }).seen.filter(y => y !== 0))).toEqual([])
  })
})

// Formulário de contato (01/10): envia pela Edge `contact`, que repassa ao e-mail do contato.
test.describe('formulário de contato', () => {
  test('confere os campos, envia e confirma, com o e-mail como alternativa', async ({ page }) => {
    let sent: Record<string, string> | null = null
    await page.route('https://e2e.supabase.co/functions/v1/contact', async route => {
      sent = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.setViewportSize({ width: 320, height: 740 })
    await page.goto('/privacidade#contato')
    const contact = page.getByRole('region', { name: 'Fale com a gente' })
    await expect(contact.getByRole('link', { name: 'Escrever para contato@chadbb.online' })).toHaveAttribute('href', 'mailto:contato@chadbb.online')
    // Vazio: o foco vai para o primeiro campo, que anuncia o erro.
    await contact.getByRole('button', { name: 'Enviar mensagem' }).click()
    await expect(contact.getByLabel('Seu nome')).toBeFocused()
    await expect(contact.getByLabel('Seu nome')).toHaveAccessibleDescription('Informe seu nome.')
    expect(sent).toBeNull()
    await contact.getByLabel('Seu nome').fill('Pessoa Fictícia')
    await contact.getByLabel('E-mail para a resposta').fill('pessoa@example.test')
    await contact.getByLabel('Assunto').selectOption({ label: 'Recebi um convite' })
    await contact.getByLabel('O que aconteceu?').fill('O link do convite abre uma página em branco.')
    await contact.getByLabel('Detalhes (opcional)').fill('Celular, ontem à noite.')
    await contact.getByRole('button', { name: 'Enviar mensagem' }).click()
    await expect(contact.getByRole('status')).toContainText('Mensagem enviada.')
    expect(sent).toEqual({ name: 'Pessoa Fictícia', email: 'pessoa@example.test', topic: 'convite', message: 'O link do convite abre uma página em branco.', details: 'Celular, ontem à noite.', website: '' })
    await expect(contact.getByLabel('Seu nome')).toHaveValue('')
    // O campo-armadilha não entra no Tab nem na árvore de acessibilidade.
    await expect(contact.getByRole('textbox', { name: 'Site' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([])
  })

  test('erro do servidor mostra o motivo sem apagar o que foi escrito', async ({ page }) => {
    let calls = 0
    await page.route('https://e2e.supabase.co/functions/v1/contact', route => {
      calls++
      return route.fulfill({ status: calls === 1 ? 429 : 503, contentType: 'application/json', body: JSON.stringify({ error: calls === 1 ? 'RATE_LIMITED' : 'TEMPORARILY_UNAVAILABLE' }) })
    })
    await page.goto('/privacidade#contato')
    const contact = page.getByRole('region', { name: 'Fale com a gente' })
    await contact.getByLabel('Seu nome').fill('Pessoa Fictícia')
    await contact.getByLabel('E-mail para a resposta').fill('pessoa@example.test')
    await contact.getByLabel('Assunto').selectOption('outro')
    await contact.getByLabel('O que aconteceu?').fill('Quero apagar os meus dados.')
    await contact.getByRole('button', { name: 'Enviar mensagem' }).click()
    await expect(contact.getByRole('alert')).toContainText('Aguarde alguns minutos')
    await contact.getByRole('button', { name: 'Enviar mensagem' }).click()
    await expect(contact.getByRole('alert')).toContainText('escreva para contato@chadbb.online')
    await expect(contact.getByLabel('O que aconteceu?')).toHaveValue('Quero apagar os meus dados.')
  })
})
