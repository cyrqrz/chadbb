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

async function backend(page: Page, options: { items?: GuestItem[]; failReads?: () => boolean; event?: Partial<Snapshot['event']>; invitation?: Partial<Snapshot['invitation']>; refuseExchange?: boolean } = {}) {
  let current = snapshot(options.items ?? [diaper])
  current = { ...current, event: { ...current.event, ...options.event }, invitation: { ...current.invitation, ...options.invitation } }
  await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
    const body = route.request().postDataJSON()
    const reply = (status: number, json: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    if (body.action === 'exchange' && options.refuseExchange) return reply(401, { error: 'GUEST_SESSION_INVALID' })
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

// Cada motivo tem a sua mensagem: recarregar a página não é "acesso revogado".
test.describe('convite que não abre', () => {
  const reopenHint = 'Toque de novo no link que você recebeu'
  test('recarregar a página pede para abrir o link de novo, sem falar em acesso revogado', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await expect(page.getByText('Convidado fictício', { exact: false }).first()).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Abra o convite pelo link recebido' })).toBeVisible()
    await expect(page.getByText(reopenHint)).toBeVisible()
    await expect(page.getByText('expirou ou foi revogado')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expectAccessible(page)
  })
  test('endereço sem código mostra a mesma orientação', async ({ page }) => {
    await backend(page)
    await page.goto('/convite')
    await expect(page.getByRole('heading', { level: 1, name: 'Abra o convite pelo link recebido' })).toBeVisible()
    await expect(page.getByText(reopenHint)).toBeVisible()
  })
  test('link incompleto explica como recuperar o acesso', async ({ page }) => {
    await backend(page)
    await page.goto('/convite#invalido')
    await expect(page.getByRole('heading', { name: 'Vamos recuperar seu acesso' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Este link de convite está incompleto')
    await expect(page.getByText('expirou ou foi revogado')).toHaveCount(0)
    await expectAccessible(page)
  })
  test('código recusado pelo servidor avisa que o acesso expirou ou foi revogado', async ({ page }) => {
    await backend(page, { refuseExchange: true })
    await page.goto(`/convite#${token}`)
    await expect(page.getByRole('heading', { name: 'Vamos recuperar seu acesso' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Este acesso expirou ou foi revogado')
  })
  test('usar "Pular para o conteúdo" e recarregar não chama o link de incompleto', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect.poll(() => new URL(page.url()).hash).toBe('#conteudo')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Abra o convite pelo link recebido' })).toBeVisible()
    await expect(page.getByText('incompleto')).toHaveCount(0)
  })
  test('trocar o fragmento na mesma aba mostra o motivo certo a cada vez', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await expect(page.getByText('Convidado fictício', { exact: false }).first()).toBeVisible()
    await page.evaluate(() => { location.hash = '#invalido' })
    await expect(page.getByRole('alert')).toContainText('Este link de convite está incompleto')
    await page.evaluate(t => { location.hash = `#${t}` }, token)
    await expect(page.getByText('Convidado fictício', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(new URL(page.url()).hash).toBe('')
  })
  test('sessão que expira durante o uso continua dizendo que o acesso expirou', async ({ page }) => {
    await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
      const body = route.request().postDataJSON()
      const status = body.action === 'exchange' ? 200 : 401
      const json = body.action === 'exchange' ? { session_token: 'fake-guest-session', snapshot: snapshot([diaper]) } : { error: 'GUEST_SESSION_INVALID' }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    })
    await page.goto(`/convite#${token}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Reabra seu convite' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('alert')).toContainText('Este acesso expirou ou foi revogado')
  })
  for (const [label, hash] of [['sem código', ''], ['incompleto', '#invalido']] as const) {
    test(`convite ${label} cabe em 320 px com texto a 200% e passa no axe`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 })
      await backend(page)
      await page.goto(`/convite${hash}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await expectAccessible(page)
    })
  }
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

  // Pedido do titular em 2026-09-17: os três passos estavam apagados, só com
  // um fio em cima. Viram cartões com peso próprio e reagem ao mouse.
  const stepCards = (page: import('@playwright/test').Page) =>
    page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) })

  test('os três passos são cartões com superfície e contorno próprios', async ({ page }) => {
    await page.goto('/')
    const cards = stepCards(page)
    await expect(cards).toHaveCount(3)
    for (const title of ['Prepare o encontro', 'Convide com carinho', 'Acompanhe os presentes']) {
      await expect(page.getByRole('heading', { level: 3, name: title })).toBeVisible()
    }
    // Cartão de verdade: fundo, borda em volta e sombra — não um fio só no topo.
    const first = cards.first()
    const style = await first.evaluate(el => {
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, shadow: s.boxShadow, widths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], radius: parseFloat(s.borderTopLeftRadius) }
    })
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(style.shadow).not.toBe('none')
    expect(style.radius).toBeGreaterThan(0)
    for (const width of style.widths) expect(parseFloat(width)).toBeGreaterThan(0)
  })

  test('passar o mouse eleva o cartão do passo, com transição curta', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sem mouse: o toque é coberto por "no toque, o passo não fica elevado"')
    await page.goto('/')
    const first = stepCards(page).first()
    const read = () => first.evaluate(el => {
      const s = getComputedStyle(el)
      return { shadow: s.boxShadow, transform: s.transform, border: s.borderTopColor, duration: s.transitionDuration }
    })
    const before = await read()
    await first.hover()
    await expect.poll(async () => (await read()).transform).not.toBe(before.transform)
    const after = await read()
    expect(after.shadow).not.toBe(before.shadow)
    expect(after.border).not.toBe(before.border)
    // Movimento discreto: 120–200 ms no pedido (com movimento reduzido, ~0 ms).
    for (const part of after.duration.split(',')) {
      const ms = parseFloat(part) * (part.includes('ms') ? 1 : 1000)
      expect(ms).toBeLessThanOrEqual(200)
    }
  })

  test('o número do passo continua decorativo para o leitor de tela', async ({ page }) => {
    await page.goto('/')
    // A ordem já vem da lista numerada; o "01" não deve ser lido de novo.
    await expect(page.getByRole('list').filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(1)
    for (const number of ['01', '02', '03']) {
      await expect(page.getByText(number, { exact: true })).toHaveAttribute('aria-hidden', 'true')
    }
  })

  test('os passos cabem em 320 px com texto a 200% e passam no axe', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.goto('/')
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await expect(stepCards(page).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await expectAccessible(page)
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
    // O contorno envolve só − | valor | +: não estica até a borda do card.
    expect(await stepper.evaluate(el => el.getBoundingClientRect().width - [...el.children].reduce((sum, child) => sum + child.getBoundingClientRect().width, 0))).toBeLessThanOrEqual(4)
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

// Quem responde que não vai continua com a reserva ativa: o convite avisa e
// deixa escolher entre cancelar ou manter (muita gente não vai, mas envia).
test.describe('ausência com presente reservado', () => {
  async function reserveAndDecline(page: import('@playwright/test').Page) {
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await card.getByRole('spinbutton').fill('2')
    await card.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('radio', { name: 'Não poderá ir' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Resposta salva' })).toBeVisible()
    return card
  }

  test('avisa a reserva que continua e permite cancelar', async ({ page }) => {
    await backend(page)
    const card = await reserveAndDecline(page)
    const warning = page.getByRole('group', { name: /ainda tem presente reservado/ })
    await expect(warning).toContainText('Fraldas tamanho P · 2 pacotes')
    await expectAccessible(page)
    await warning.getByRole('button', { name: /Cancelar reservas?/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Reserva cancelada.' })).toBeVisible()
    await expect(warning).toHaveCount(0)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    await expect(card.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
    await expect(card.getByText('6 de 6 disponíveis')).toBeVisible()
  })

  test('“Manter” guarda a reserva e tira o aviso, sem chamar o servidor', async ({ page }) => {
    const calls: string[] = []
    page.on('request', request => { if (request.url().includes('/functions/v1/guest') && request.method() === 'POST') calls.push(String(request.postDataJSON()?.action)) })
    await backend(page)
    const card = await reserveAndDecline(page)
    const warning = page.getByRole('group', { name: /ainda tem presente reservado/ })
    await warning.getByRole('button', { name: 'Manter: vou enviar o presente' }).click()
    await expect(warning).toHaveCount(0)
    expect(calls.filter(action => action === 'cancel')).toHaveLength(0)
    // A consulta periódica (5 s) não pode trazer o aviso de volta.
    await expect.poll(() => calls.filter(action => action === 'read').length, { timeout: 15_000 }).toBeGreaterThan(1)
    await expect(warning).toHaveCount(0)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    await expect(card.getByText('Sua reserva 2 pacotes')).toBeVisible()
  })

  test('quem confirma presença não vê o aviso', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await card.getByRole('spinbutton').fill('2')
    await card.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('radio', { name: 'Vai participar' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Resposta salva' })).toBeVisible()
    await expect(page.getByText('ainda tem presente reservado')).toHaveCount(0)
  })

  const presenceOf = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Podemos contar com você?' })
  const treat: GuestItem = { id: '70000000-0000-4000-8000-00000000000a', title: 'Mamadeira fictícia', description: 'Mimo fictício.',
    category: 'mimo', diaper_size: null, limit: null, committed: 0, own: null }

  // Um anúncio só, na ordem certa: a confirmação da resposta já diz que o
  // presente continua reservado, em vez de duas regiões vivas disputando.
  test('salvar a recusa faz um anúncio só, que já cita o presente reservado', async ({ page }) => {
    await backend(page)
    await reserveAndDecline(page)
    const live = presenceOf(page).locator('[role="status"]')
    await expect(live).toHaveCount(1)
    await expect(live).toContainText('Resposta salva')
    await expect(live).toContainText('presente reservado')
    // Mudou de ideia: o aviso some e a reserva continua de pé.
    await page.getByRole('radio', { name: 'Vai participar' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(live).toHaveText('Resposta salva. Obrigado por avisar!')
    await expect(page.getByRole('group', { name: /ainda tem presente reservado/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    await expect(page.getByText('Sua reserva 2 pacotes')).toBeVisible()
  })

  test('confirmação do cancelamento aparece junto do aviso e o foco não se perde', async ({ page }) => {
    await backend(page)
    await reserveAndDecline(page)
    const presence = presenceOf(page)
    await presence.getByRole('button', { name: /Cancelar reservas?/ }).click()
    await expect(presence.getByText('Reserva cancelada.')).toBeVisible()
    expect(await presence.evaluate(node => node.contains(document.activeElement))).toBe(true)
  })

  test('falha ao cancelar avisa a pessoa mesmo com o presente em outra aba', async ({ page }) => {
    await backend(page, { items: [diaper, treat] })
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Mimos', exact: true }).click()
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira fictícia' }) })
    await card.getByRole('spinbutton').fill('1')
    await card.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('radio', { name: 'Não poderá ir' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Resposta salva' })).toBeVisible()
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
      if (route.request().postDataJSON().action === 'cancel') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEMPORARILY_UNAVAILABLE' }) })
      await route.fallback()
    })
    const presence = presenceOf(page)
    await presence.getByRole('button', { name: /Cancelar reservas?/ }).click()
    await expect(presence.getByRole('alert')).toContainText('temporariamente indisponível')
    await expect(presence.getByRole('button', { name: 'Verificar tentativa anterior' })).toBeVisible()
  })

  test('duas reservas saem em sequência e o clique impaciente não repete o pedido', async ({ page }) => {
    const cancels: string[] = []
    page.on('request', request => {
      const body = request.url().includes('/functions/v1/guest') && request.method() === 'POST' ? request.postDataJSON() : null
      if (body?.action === 'cancel') cancels.push(String(body.payload.item_id))
    })
    await backend(page, { items: [diaper, treat] })
    await page.goto(`/convite#${token}`)
    const fralda = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await fralda.getByRole('spinbutton').fill('2')
    await fralda.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('button', { name: 'Mimos', exact: true }).click()
    const mimo = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira fictícia' }) })
    await mimo.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('radio', { name: 'Não poderá ir' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    const warning = page.getByRole('group', { name: /ainda tem presente reservado/ })
    await expect(warning.getByRole('listitem')).toHaveText(['Fraldas tamanho P · 2 pacotes', 'Mamadeira fictícia · 1 unidade'])
    await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
      if (route.request().postDataJSON().action === 'cancel') await new Promise(done => setTimeout(done, 400))
      await route.fallback()
    })
    const button = warning.getByRole('button', { name: 'Cancelar reservas' })
    await button.click()
    await button.click({ force: true })
    await expect(page.getByRole('status').filter({ hasText: 'Reservas canceladas.' })).toBeVisible()
    await expect(warning).toHaveCount(0)
    expect(cancels).toEqual([diaper.id, treat.id])
    await expect(mimo.getByRole('button', { name: 'Escolher presente' })).toBeVisible()
  })

  test('quem já informou a compra não é empurrado a cancelar', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await card.getByRole('spinbutton').fill('2')
    await card.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await card.getByRole('button', { name: 'Já comprei' }).click()
    await expect(page.getByRole('status')).toHaveText('Compra informada. A organização vai ver o aviso.')
    await page.getByRole('radio', { name: 'Não poderá ir' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Resposta salva' })).toBeVisible()
    await expect(page.getByText('ainda tem presente reservado')).toHaveCount(0)
  })

  // Quem volta ao convite no dia seguinte já encontra o aviso, sem precisar responder de novo.
  const held: GuestItem = { ...diaper, committed: 2, own: { id: 'r1', quantity: 2, version: 1, status: 'reserved' } }

  test('ao reabrir o convite o aviso já está lá, no caminho do teclado', async ({ page }) => {
    await backend(page, { items: [held], invitation: { response: 'no', version: 4 } })
    await page.goto(`/convite#${token}`)
    const warning = page.getByRole('group', { name: /ainda tem presente reservado/ })
    await expect(warning).toContainText('Fraldas tamanho P · 2 pacotes')
    await page.getByRole('button', { name: 'Confirmar presença', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(warning.getByRole('button', { name: 'Cancelar reserva' })).toBeFocused()
    await expectAccessible(page)
  })

  test('evento encerrado esconde o aviso, e o cancelamento continua no cartão', async ({ page }) => {
    await backend(page, { items: [held], invitation: { response: 'no', version: 4 }, event: { status: 'closed' } })
    await page.goto(`/convite#${token}`)
    await expect(page.getByText('ainda tem presente reservado')).toHaveCount(0)
    await page.getByRole('button', { name: 'Fraldas', exact: true }).click()
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await expect(card.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible()
  })

  // A confirmação da resposta é desenhada depois do cartão, e o aviso fica
  // dentro dele: mandar “veja logo abaixo” aponta para o lugar errado.
  test('a confirmação da recusa não manda olhar para o lado errado', async ({ page }) => {
    await backend(page)
    await reserveAndDecline(page)
    const message = presenceOf(page).locator('[role="status"]')
    const warning = page.getByRole('group', { name: /ainda tem presente reservado/ })
    const [box, note] = [await warning.boundingBox(), await message.boundingBox()]
    expect(box!.y, 'o aviso é desenhado antes da confirmação').toBeLessThan(note!.y)
    expect(await message.innerText()).not.toMatch(/abaixo/)
  })

  // Quem escolhe manter o presente merece resposta: o aviso sumir não é
  // confirmação, e quem usa teclado ou leitor de tela fica sem saber o que houve.
  test('“Manter” confirma a escolha e não deixa o foco no vazio', async ({ page }) => {
    await backend(page)
    await reserveAndDecline(page)
    const presence = presenceOf(page)
    await presence.getByRole('button', { name: 'Manter: vou enviar o presente' }).click()
    await expect(page.getByRole('group', { name: /ainda tem presente reservado/ })).toHaveCount(0)
    await expect(presence.locator('[role="status"]').filter({ hasText: /continua reservado/ })).toBeVisible()
    expect(await presence.evaluate(node => node.contains(document.activeElement)), 'o foco ficou no vazio').toBe(true)
  })

  test('cancelamento que falha no meio diz o que já saiu e o que ficou', async ({ page }) => {
    await backend(page, { items: [diaper, treat] })
    await page.goto(`/convite#${token}`)
    const fralda = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Fraldas tamanho P' }) })
    await fralda.getByRole('spinbutton').fill('2')
    await fralda.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('button', { name: 'Mimos', exact: true }).click()
    const mimo = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mamadeira fictícia' }) })
    await mimo.getByRole('button', { name: 'Escolher presente' }).click()
    await expect(page.getByRole('status')).toHaveText('Presente reservado para você.')
    await page.getByRole('radio', { name: 'Não poderá ir' }).check()
    await page.getByRole('button', { name: 'Confirmar presença' }).click()
    const warning = page.getByRole('group', { name: /ainda tem presente reservado/ })
    await expect(warning.getByRole('listitem')).toHaveCount(2)
    // O servidor cai depois de cancelar o primeiro: o segundo não sai.
    let seen = 0
    await page.route('https://e2e.supabase.co/functions/v1/guest', async route => {
      if (route.request().postDataJSON().action === 'cancel' && ++seen > 1)
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEMPORARILY_UNAVAILABLE' }) })
      await route.fallback()
    })
    const presence = presenceOf(page)
    await presence.getByRole('button', { name: 'Cancelar reservas' }).click()
    await expect(presence.getByRole('alert')).toContainText('temporariamente indisponível')
    // Estado parcial dito com palavras, não deduzido de uma lista que encurtou.
    await expect(warning).toContainText(/uma reserva já foi cancelada/i)
    await expect(warning.getByRole('listitem')).toHaveText(['Mamadeira fictícia · 1 unidade'])
  })

  test('aviso cabe em 320 px com texto a 200% e os botões têm 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await backend(page)
    await reserveAndDecline(page)
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const presence = presenceOf(page)
    for (const name of [/^Cancelar reservas?$/, 'Manter: vou enviar o presente']) {
      const box = await presence.getByRole('button', { name }).boundingBox()
      expect(box!.height, String(name)).toBeGreaterThanOrEqual(44)
    }
    await expectAccessible(page)
  })
})

// Entrada em cascata da página inicial: `.stagger` passou a usar
// `animation-fill-mode: backwards` (era `both`, que congelava o `transform` e
// matava a elevação dos cartões). O que precisa continuar de pé: os passos
// entram na ordem, um depois do outro, e terminam no lugar, sem piscar.
test.describe('cascata da página inicial', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('os passos entram na ordem e terminam no lugar', async ({ page }) => {
    await page.addInitScript(() => {
      const seen: string[] = []
      Object.defineProperty(window, '__entrada', { get: () => seen })
      document.addEventListener('animationstart', event => {
        const target = event.target as HTMLElement
        if (target.matches?.('.stagger > *')) seen.push((target.textContent ?? '').slice(0, 2))
      }, true)
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 3, name: 'Prepare o encontro' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __entrada: string[] }).__entrada)).toEqual(['01', '02', '03'])
    const states = await page.evaluate(async () => {
      const items = [...document.querySelectorAll('.stagger > *')] as HTMLElement[]
      await Promise.all(items.flatMap(el => el.getAnimations().map(a => a.finished.then(() => {}, () => {}))))
      return items.map(el => { const s = getComputedStyle(el); return { fill: s.animationFillMode, opacity: s.opacity, transform: s.transform } })
    })
    expect(states).toHaveLength(3)
    for (const state of states) expect(state).toEqual({ fill: 'backwards', opacity: '1', transform: 'none' })
  })

  // Sem piscar: durante o atraso do stagger o item já está no estado inicial
  // (invisível). Se aparecesse e depois sumisse, a opacidade cairia em algum
  // quadro. Amostra a cada quadro desde a inserção até o fim da entrada.
  test('os passos não piscam antes de entrar: a opacidade só sobe', async ({ page }) => {
    await page.addInitScript(() => {
      const samples: number[][] = [[], [], []]
      Object.defineProperty(window, '__opacidade', { get: () => samples })
      const tick = () => {
        const items = [...document.querySelectorAll('.stagger > *')] as HTMLElement[]
        items.slice(0, 3).forEach((el, i) => samples[i].push(Number(getComputedStyle(el).opacity)))
        if (!items.length || items.some(el => el.getAnimations().some(a => a.playState !== 'finished'))) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 3, name: 'Acompanhe os presentes' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opacidade: number[][] }).__opacidade.every(s => s.at(-1) === 1))).toBe(true)
    const samples = await page.evaluate(() => (window as unknown as { __opacidade: number[][] }).__opacidade)
    for (const series of samples) {
      expect(series.length).toBeGreaterThan(1)
      expect(series[0], 'o passo apareceu antes da entrada começar').toBeLessThan(1)
      for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThanOrEqual(series[i - 1])
    }
  })

  // Com movimento liberado (o caso real de quem usa mouse), a elevação precisa
  // funcionar depois da entrada e na duração pedida (120–200 ms).
  test('passo: sobe no hover depois da entrada, com transição de 120 a 200 ms', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sem mouse: o toque é coberto pelo teste seguinte')
    await page.goto('/')
    const card = page.locator('.stagger > *').first()
    await expect(card).toBeVisible()
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))))
    // Deslocamento vertical real: com `both` o valor fica "matrix(1, 0, 0, 1, 0, 0)",
    // que é diferente de "none" mas não sai do lugar.
    const lift = () => card.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42)
    expect(await lift()).toBe(0)
    await card.hover()
    await expect.poll(lift).toBeLessThan(0)
    const durations = await card.evaluate(el => getComputedStyle(el).transitionDuration.split(',').map(part => parseFloat(part) * (part.includes('ms') ? 1 : 1000)))
    for (const ms of durations) {
      expect(ms).toBeGreaterThanOrEqual(120)
      expect(ms).toBeLessThanOrEqual(200)
    }
  })

  // No toque, o :hover gruda depois do toque; o passo não pode ficar elevado
  // nem com a borda da marca, como se estivesse selecionado.
  test('no toque, o passo não fica elevado', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'só em tela de toque')
    await page.goto('/')
    const card = page.locator('.stagger > *').first()
    await expect(card).toBeVisible()
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))))
    const read = () => card.evaluate(el => {
      const s = getComputedStyle(el)
      return { lift: new DOMMatrix(s.transform).m42, border: s.borderTopColor, shadow: s.boxShadow }
    })
    const before = await read()
    // O navegador de toque mantém o :hover no último elemento tocado; o hover()
    // reproduz esse estado (o tap() do Playwright não o deixa grudado).
    await card.hover()
    await page.waitForTimeout(300)
    expect(await read()).toEqual(before)
  })

  test('presentes do convite: nada fica invisível nem deslocado depois da entrada', async ({ page }) => {
    await backend(page)
    await page.goto(`/convite#${token}`)
    await expect(page.getByRole('heading', { name: 'Fraldas tamanho P' })).toBeVisible()
    const states = await page.evaluate(async () => {
      const items = [...document.querySelectorAll('.stagger > *')] as HTMLElement[]
      await Promise.all(items.flatMap(el => el.getAnimations().map(a => a.finished.then(() => {}, () => {}))))
      return items.map(el => { const s = getComputedStyle(el); return { fill: s.animationFillMode, opacity: s.opacity, transform: s.transform } })
    })
    expect(states.length).toBeGreaterThan(0)
    for (const state of states) expect(state).toEqual({ fill: 'backwards', opacity: '1', transform: 'none' })
  })
})
