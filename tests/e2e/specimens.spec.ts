import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Página de amostras da foundation (só existe no servidor de desenvolvimento).
test('amostras acessíveis', async ({ page }) => {
  await page.goto('/amostras')
  await expect(page.getByRole('heading', { name: 'Amostras do sistema visual' })).toBeVisible()
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('botão ocupado mantém o foco e ignora cliques', async ({ page }) => {
  await page.goto('/amostras')
  const save = page.getByRole('button', { name: 'Salvar (fica ocupado)' })
  await save.focus()
  await page.keyboard.press('Enter')
  const busy = page.getByRole('button', { name: 'Salvando…' })
  await expect(busy).toHaveAttribute('aria-disabled', 'true')
  await expect(busy).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Salvar (fica ocupado)' })).toBeFocused({ timeout: 5_000 })
})

test('campo com erro e dica ligados ao controle', async ({ page }) => {
  await page.goto('/amostras')
  await expect(page.getByLabel('Quantas pessoas vão?')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Quantas pessoas vão?')).toHaveAccessibleDescription('A quantidade passa do limite deste convite.')
  await expect(page.getByLabel('Nome da pessoa ou família')).toHaveAccessibleDescription('Aparece no convite.')
})

test('diálogo de confirmação: acessível, Esc e clique fora fecham, foco volta ao botão', async ({ page }) => {
  await page.goto('/amostras')
  const trigger = page.getByRole('region', { name: 'Diálogo de confirmação' }).getByRole('button', { name: 'Revogar acesso' })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const report = await new AxeBuilder({ page }).include('.confirm-dialog').analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])

  // Esc fecha como Cancelar, e o foco volta ao botão que abriu.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // Clique fora do conteúdo (no `::backdrop`, ou seja, no próprio `<dialog>`) também cancela.
  await trigger.click()
  await page.getByRole('dialog').click({ position: { x: 2, y: 2 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // Confirmar fecha e devolve o foco também.
  await trigger.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar acesso' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
