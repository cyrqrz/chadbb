import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// Só teclado: avança com Tab a partir do foco atual até o alvo, como faria quem
// não usa mouse. Falha se o alvo não estiver na ordem de tabulação.
export async function tabTo(page: Page, target: Locator, limit = 80) {
  for (let i = 0; i < limit; i++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      await expect(target).toBeFocused()
      await expect(target).toBeInViewport()
      return
    }
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab não alcançou ${target} em ${limit} passos`)
}
