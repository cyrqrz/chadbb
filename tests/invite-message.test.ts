import { describe, expect, it } from 'vitest'
import { inviteMessage, withLink } from '../src/features/guests/inviteMessage'

describe('mensagem do convite para o WhatsApp', () => {
  const link = 'https://chadbb.online/c/62d68cbf-0000-4000-8000-000000000000#' + 'a'.repeat(64)
  it('leva o nome, o evento e o link na última linha', () => {
    const text = inviteMessage('Família Fictícia', 'Chá de teste', link)
    expect(text).toBe(`Olá, Família Fictícia!\n\nVocê recebeu um convite para Chá de teste. Pelo link, confirme sua presença e, se quiser, escolha um presente:\n${link}`)
    expect(text.split('\n').at(-1)).toBe(link)
  })
  it('apara espaços e não deixa o evento em branco', () => {
    expect(inviteMessage('  Ana  ', '   ', link)).toContain('Olá, Ana!\n\nVocê recebeu um convite para o chá de bebê.')
  })
  it('mensagem editada mantém o texto e só acrescenta o link se ele saiu', () => {
    expect(withLink('Oi, tia! Vem no chá?', link)).toBe(`Oi, tia! Vem no chá?\n${link}`)
    expect(withLink(`Oi, tia! ${link} Te espero.`, link)).toBe(`Oi, tia! ${link} Te espero.`)
    expect(withLink('   ', link)).toBe(link)
    const suggested = inviteMessage('Ana', 'Chá de teste', link)
    expect(withLink(suggested, link)).toBe(suggested)
  })
})
