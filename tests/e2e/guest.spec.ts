import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { GuestItem, Snapshot } from '../../src/features/guests/api'

// Convite com a função `guest` simulada e dados fictícios. As regras de saldo e
// versão são testadas no banco; aqui só a apresentação de cada estado.
const token = 'a'.repeat(64)
function snapshot(items: GuestItem[]): Snapshot {
  return {
    invitation: { name: 'Convidado fictício', kind: 'family', capacity: 3, response: 'pending', attending: 0, version: 1 },
    event: { id: '60000000-0000-4000-8000-000000000006', title: 'Chá de teste', description: 'Texto fictício.', starts_at: '2035-09-10T17:30:00Z',
      address: 'Endereço fictício', instructions: '', cover_path: null, status: 'published' },
    items,
  }
}
const diaper: GuestItem = { id: '70000000-0000-4000-8000-000000000007', title: 'Fraldas tamanho P', description: 'Pacote fictício.',
  category: 'fralda', diaper_size: 'P', limit: 6, committed: 0, own: null }

async function backend(page: Page, options: { items?: GuestItem[]; failReads?: () => boolean; event?: Partial<Snapshot['event']> } = {}) {
  let current = snapshot(options.items ?? [diaper])
  current = { ...current, event: { ...current.event, ...options.event } }
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const body = route.request().postDataJSON()
    const reply = (status: number, json: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    if (body.action === 'exchange') return reply(200, { session_token: 'fake-guest-session', snapshot: current })
    if (body.action === 'read') return options.failReads?.() ? reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) : reply(200, { snapshot: current })
    if (body.action === 'rsvp') {
      const { response, attending } = body.payload
      current = { ...current, invitation: { ...current.invitation, response, attending, version: current.invitation.version + 1 } }
      return reply(200, { snapshot: current })
    }
    const { item_id: id, quantity } = body.payload
    const change = (item: GuestItem): GuestItem => {
      if (item.id !== id) return item
      const mine = item.own && item.own.status !== 'cancelled' ? item.own.quantity : 0
      if (body.action === 'reserve') return { ...item, committed: item.committed - mine + quantity, own: { id: 'r1', quantity, version: 1, status: 'reserved' } }
      if (body.action === 'purchase') return { ...item, own: { ...item.own!, version: 2, status: 'purchase_declared' } }
      return { ...item, committed: item.committed - mine, own: { ...item.own!, version: 3, status: 'cancelled' } }
    }
    current = { ...current, items: current.items.map(change) }
    return reply(200, { snapshot: current })
  })
}
async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).analyze()
  expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('reserva, compra informada e cancelamento com uma ação principal por etapa', async ({ page }) => {
  await backend(page)
  await page.goto(`/convite#${token}`)
  await expect(page.getByRole('button', { name: 'Confirmar presença' })).toBeVisible()
  await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
  await card.getByRole('spinbutton').fill('2')
  await card.getByRole('button', { name: 'Escolher presente' }).click()
  await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
  await card.getByRole('spinbutton').fill('3')
  await card.getByRole('button', { name: 'Atualizar quantidade' }).click()
  await expect(page.getByRole('status')).toHaveText('Escolha atualizada.')
  const purchase = card.getByRole('button', { name: 'Já comprei' })
  await expect(purchase).toHaveAccessibleDescription(/só avisa a organização/)
  await expectAccessible(page)
  await purchase.click()
  await expect(page.getByRole('status')).toHaveText('Compra informada. A organização vai ver o aviso.')
  await expect(card.getByText('Compra informada por você.', { exact: false })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Já comprei' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Cancelar reserva' }).click()
  await expect(page.getByRole('status')).toHaveText('Reserva cancelada.')
  await expect(card.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
})

test('lista vazia e falha de atualização têm estado próprio', async ({ page }) => {
  let failing = false
  await backend(page, { failReads: () => failing })
  await page.goto(`/convite#${token}`)
  await page.getByRole('button', { name: 'Mimos', exact: true }).click()
  await expect(page.getByText('A organização está preparando esta lista.')).toBeVisible()
  failing = true
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Os dados abaixo são da última consulta.', { timeout: 15_000 })
  await expectAccessible(page)
  failing = false
  await alert.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(alert).toHaveCount(0)
})

test('link inválido explica como recuperar o acesso', async ({ page }) => {
  await backend(page)
  await page.goto('/convite#invalido')
  await expect(page.getByRole('heading', { name: 'Vamos recuperar seu acesso' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Reabra o convite original')
  await expectAccessible(page)
})

test('aviso de falha não muda enquanto a tela tenta de novo sozinha', async ({ page }) => {
  let failing = false
  await backend(page, { failReads: () => failing })
  await page.goto(`/convite#${token}`)
  await expect(page.getByRole('heading', { name: 'Podemos contar com você?' })).toBeVisible()
  failing = true
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Os dados abaixo são da última consulta.', { timeout: 15_000 })
  // Conta mutações dentro do aviso durante a próxima tentativa automática.
  await alert.evaluate(el => {
    const w = window as unknown as { mutations: number }
    w.mutations = 0
    new MutationObserver(list => { w.mutations += list.length }).observe(el, { subtree: true, childList: true, characterData: true })
  })
  await page.waitForResponse(r => r.url().endsWith('/functions/v1/guest') && r.request().postDataJSON().action === 'read', { timeout: 20_000 })
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as unknown as { mutations: number }).mutations)).toBe(0)
  // Na tentativa manual, o botão fica indisponível sem trocar o nome.
  const retry = alert.getByRole('button', { name: 'Tentar novamente' })
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => { await new Promise(done => setTimeout(done, 800)); await route.fallback() })
  await retry.click()
  await expect(retry).toBeDisabled()
  await expect(retry).toBeEnabled({ timeout: 10_000 })
  expect(await page.evaluate(() => (window as unknown as { mutations: number }).mutations)).toBe(0)
})

const full: GuestItem = { ...diaper, id: '70000000-0000-4000-8000-000000000008', title: 'Fraldas tamanho M', diaper_size: 'M', limit: 6, committed: 6 }

test.describe('G3 · convite', () => {
  test('topo em formato de convite leva à resposta sem sair da página', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    const title = page.getByRole('heading', { level: 1, name: 'Chá de teste' })
    await expect(title).toBeVisible()
    expect(await title.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Fraunces')
    await expect(page.getByText('Horário de Brasília').first()).toBeVisible()
    await page.getByRole('button', { name: 'Responder ao convite' }).click()
    await expect(page.getByRole('region', { name: 'Podemos contar com você?' })).toBeFocused()
    expect(new URL(page.url()).hash).toBe('')
    await page.getByRole('radio', { name: 'Não poderá ir' }).check()
    await page.getByRole('button', { name: 'Confirmar presença', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Resposta salva. Obrigado por avisar!')
    await expect(page.getByRole('button', { name: 'Ver minha resposta' })).toBeVisible()
  })

  test('tamanho completo vira selo, com barra de progresso', async ({ page }) => {
    await backend(page, { items: [diaper, full] })
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const m = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho M' }) })
    await expect(m.locator('.badge', { hasText: 'Completo' })).toBeVisible()
    await expect(m.getByRole('button')).toHaveCount(0)
    await expect(m.locator('.meter')).toHaveClass(/meter-complete/)
    await expect(m.getByText('0 de 6 disponíveis')).toBeVisible()
  })

  test('reserva que completa o tamanho avisa na confirmação', async ({ page }) => {
    await backend(page, { items: [{ ...diaper, committed: 4 }] })
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const p = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await p.getByRole('spinbutton').fill('2')
    await p.getByRole('button', { name: 'Escolher presente' }).click()
    // A confirmação aparece no próprio cartão, perto de onde a pessoa tocou.
    await expect(p.getByRole('status')).toHaveText('Presente reservado para você. Tamanho P completo.')
  })

  test('quantidade com botões de menos e mais', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const p = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    const less = p.getByRole('button', { name: 'Diminuir pacotes' })
    const more = p.getByRole('button', { name: 'Aumentar pacotes' })
    await expect(less).toBeDisabled()
    await more.click(); await more.click()
    await expect(p.getByRole('spinbutton')).toHaveValue('3')
    await less.click()
    await expect(p.getByRole('spinbutton')).toHaveValue('2')
    for (const button of [less, more]) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('local com link para o mapa em nova aba', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    const local = page.getByRole('region', { name: 'Local e instruções' })
    await expect(local).toContainText('Endereço fictício')
    const map = local.getByRole('link', { name: /Abrir no mapa/ })
    await expect(map).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Endere%C3%A7o%20fict%C3%ADcio')
    await expect(map).toHaveAttribute('target', '_blank')
    await expect(map).toHaveAttribute('rel', /noopener/)
  })

  test('evento encerrado some com as escolhas novas e mantém as ações da reserva', async ({ page }) => {
    const mine: GuestItem = { ...diaper, committed: 2, own: { id: 'r1', quantity: 2, version: 1, status: 'reserved' } }
    await backend(page, { items: [mine, full], event: { status: 'closed' } })
    await page.goto(`/convite#${token}`)
    await expect(page.getByText('O evento foi encerrado.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Responder ao convite' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ver minha resposta' })).toBeVisible()
    const presence = page.getByRole('region', { name: 'Podemos contar com você?' })
    await expect(presence).toContainText('Resposta atual: Sem resposta.')
    await expect(presence.getByRole('button')).toHaveCount(0)
    await expect(presence.getByRole('radio')).toHaveCount(0)
    await expect(page.getByText('Aguarde…')).toHaveCount(0)
    const p = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await expect(p.getByRole('spinbutton')).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Atualizar quantidade' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Já comprei' })).toBeEnabled()
    await expect(p.getByRole('button', { name: 'Cancelar reserva' })).toBeEnabled()
    await expectAccessible(page)
  })

  test('menos e mais não soltam o foco nos limites e campo vazio volta ao mínimo', async ({ page }) => {
    await backend(page, { items: [{ ...diaper, committed: 4 }] })
    await page.goto(`/convite#${token}`)
    const p = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    const field = p.getByRole('spinbutton')
    const less = p.getByRole('button', { name: /Diminuir/ })
    const more = p.getByRole('button', { name: /Aumentar/ })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('2')
    await expect(more).toBeDisabled()
    await expect(more).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('2')
    await less.focus()
    await page.keyboard.press('Enter')
    await expect(field).toHaveValue('1')
    await expect(less).toBeDisabled()
    await expect(less).toBeFocused()
    await field.fill('')
    await more.click()
    await expect(field).toHaveValue('1')
  })

  test('confirmar presença pelo teclado mantém o foco durante e depois do envio', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
      if (route.request().postDataJSON().action === 'rsvp') await new Promise(done => setTimeout(done, 600))
      await route.fallback()
    })
    await page.getByRole('radio', { name: 'Talvez' }).check()
    const submit = page.getByRole('button', { name: 'Confirmar presença', exact: true })
    await submit.focus()
    await page.keyboard.press('Enter')
    const waiting = page.getByRole('button', { name: 'Aguarde…' })
    await expect(waiting).toBeDisabled()
    await expect(waiting).toBeFocused()
    await expect(page.getByRole('status')).toHaveText('Resposta salva. Obrigado por avisar!')
    await expect(submit).toBeFocused()
  })

  test('arte sem capa mostra dia e mês inteiros em 320 px com texto a 200%', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page)
    await page.goto(`/convite#${token}`)
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const art = page.locator('.invite-art')
    await expect(art).toContainText('10')
    await expect(art).toContainText('setembro')
    const clipped = await art.evaluate(box => {
      const outer = box.getBoundingClientRect()
      return [...box.children].some(child => { const r = child.getBoundingClientRect(); return r.top < outer.top - 1 || r.bottom > outer.bottom + 1 })
    })
    expect(clipped).toBe(false)
  })

  test('convite cabe em 320 px com texto a 200% e passa no axe', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page, { items: [diaper, full] })
    await page.goto(`/convite#${token}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    await expectAccessible(page)
  })
})

test.describe('G3 · página inicial e prévia', () => {
  test('botão principal leva a organizar um evento', async ({ page }) => {
    await page.goto('/')
    const start = page.getByRole('link', { name: 'Começar a organizar' })
    await expect(start).toHaveAttribute('href', '/entrar')
    await expect(page.getByText('Convites estão em preparação')).toHaveCount(0)
  })

  test('prévia do link com imagem, título e descrição genéricos', async ({ page, request }) => {
    await page.goto('/')
    const meta = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute('content')
    expect(await meta('og:title')).toBe('chadbb · Chá de bebê')
    expect(await meta('og:description')).toContain('Confirme presença')
    expect(await meta('og:image')).toBe('https://chadbb.pages.dev/og-image.png')
    expect(await meta('og:locale')).toBe('pt_BR')
    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image')
    const image = await request.get('/og-image.png')
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
  })
})

test('G3 · pergunta dos presentes não é título e as opções de presença não quebram a 200%', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await backend(page)
  await page.goto(`/convite#${token}`)
  await expect(page.getByRole('heading', { name: 'Qual tamanho você vai levar?' })).toHaveCount(0)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const label = page.locator('label.choice').filter({ hasText: 'Vai participar' })
  // “Vai participar” precisa caber em no máximo três linhas, não uma letra por linha.
  const lines = await label.evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '32')))
  expect(lines).toBeLessThanOrEqual(3)
})

test.describe('G3.1 · card de fralda (referência do sistema de cards)', () => {
  const reserved: GuestItem = { ...diaper, committed: 2, own: { id: 'r1', quantity: 2, version: 1, status: 'reserved' } }
  const other: GuestItem = { ...diaper, id: '70000000-0000-4000-8000-000000000009', title: 'Fraldas tamanho G', diaper_size: 'G', limit: 19, committed: 4 }
  const open = async (page: Page, items: GuestItem[]) => {
    await backend(page, { items })
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    return page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
  }

  test('reserva integrada ao card, sem caixa colorida dentro dele', async ({ page }) => {
    const card = await open(page, [reserved, other])
    await expect(card.getByText('Sua reserva 2 pacotes')).toBeVisible()
    await expect(card.locator('.notice, .card')).toHaveCount(0)
  })

  test('disponibilidade com texto antes da barra e barra acessível', async ({ page }) => {
    const card = await open(page, [reserved, other])
    const bar = card.getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuenow', '2')
    await expect(bar).toHaveAttribute('aria-valuemax', '6')
    await expect(bar).toHaveAttribute('aria-valuetext', '2 de 6 pacotes reservados')
    const text = card.getByText('4 de 6 disponíveis')
    expect((await text.boundingBox())!.y).toBeLessThan((await bar.boundingBox())!.y)
  })

  test('stepper é um controle único', async ({ page }) => {
    const card = await open(page, [reserved, other])
    const stepper = card.getByRole('group', { name: /Quantidade/ })
    await expect(stepper.getByRole('button', { name: 'Diminuir pacotes' })).toBeVisible()
    await expect(stepper.getByRole('spinbutton')).toHaveValue('2')
    expect(await stepper.getByRole('button', { name: 'Aumentar pacotes' }).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px')
    expect(parseFloat(await stepper.evaluate(el => getComputedStyle(el).borderTopLeftRadius))).toBeLessThanOrEqual(12)
  })

  test('um CTA principal e ações secundárias abaixo de um divisor', async ({ page }) => {
    const card = await open(page, [reserved, other])
    await expect(card.locator('.button')).toHaveCount(1)
    await expect(card.getByRole('button', { name: 'Atualizar quantidade' })).toBeVisible()
    const actions = card.locator('.card-actions')
    expect(await actions.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid')
    for (const name of ['Trocar tamanho', 'Já comprei', 'Cancelar reserva']) await expect(actions.getByRole('button', { name })).toBeVisible()
  })

  test('trocar tamanho só abre quando pedido (disclosure acessível)', async ({ page }) => {
    const card = await open(page, [reserved, other])
    const toggle = card.getByRole('button', { name: 'Trocar tamanho' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(card.getByRole('combobox')).toHaveCount(0)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const controls = await toggle.getAttribute('aria-controls')
    await expect(page.locator(`[id="${controls}"]`)).toBeVisible()
    await expect(card.getByRole('combobox', { name: 'Novo tamanho' })).toBeFocused()
    await expect(card.getByRole('button', { name: 'Confirmar troca' })).toBeVisible()
    await toggle.click()
    await expect(card.getByRole('combobox')).toHaveCount(0)
  })

  test('card sem reserva: selo, título, disponibilidade, quantidade e CTA', async ({ page }) => {
    const card = await open(page, [diaper])
    await expect(card.locator('.button')).toHaveCount(1)
    await expect(card.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
    await expect(card.locator('.card-actions')).toHaveCount(0)
    await expect(card.getByText('Pacotes de Fraldas tamanho P')).toHaveCount(0)
    await expectAccessible(page)
  })
})
