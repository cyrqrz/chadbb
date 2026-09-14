import { describe, expect, it } from 'vitest'
import { fromLocalDate, toLocalDate, validateDraft, validateImage } from '../src/features/events/model'
import { errorMessage } from '../src/lib/errors'

const draft = { title: '', public_description: '', private_address: '', private_instructions: '', localDate: '', localEndDate: '', cover_path: null }
describe('evento', () => {
  it('aceita rascunho incompleto, mas não publicação', () => {
    expect(validateDraft(draft)).toBeNull()
    expect(validateDraft(draft, true)).toContain('título')
  })
  it('exige data futura para publicar', () => {
    const value = { ...draft, title: 'Chá', localDate: '2030-01-01T12:00', localEndDate: '2030-01-01T16:00' }
    expect(validateDraft(value, true, new Date('2029-01-01').getTime())).toBeNull()
    expect(validateDraft({ ...value, localEndDate: '' }, true, new Date('2029-01-01').getTime())).toContain('término')
    expect(validateDraft({ ...value, localEndDate: '2030-01-01T12:00' })).toContain('depois do início')
    expect(validateDraft(value, true, new Date('2031-01-01').getTime())).not.toBeNull()
  })
  it('rejeita data inválida sem lançar exceção', () => expect(validateDraft({ ...draft, localDate: 'inválida' })).not.toBeNull())
  it('interpreta início e término sempre no horário de Brasília, em qualquer navegador', () => {
    expect(fromLocalDate('2026-11-01T12:00')).toBe('2026-11-01T15:00:00.000Z')
    expect(toLocalDate('2026-11-01T15:00:00Z')).toBe('2026-11-01T12:00')
    expect(toLocalDate('2026-11-01T02:30:00Z')).toBe('2026-10-31T23:30')
    const value = '2030-10-11T12:34'
    expect(toLocalDate(fromLocalDate(value))).toBe(value)
    expect(toLocalDate(null)).toBe('')
    expect(fromLocalDate('2026-02-30T12:00')).toBeNull()
  })
  it('limita campos mesmo em rascunho', () => expect(validateDraft({ ...draft, private_address: 'a'.repeat(501) })).not.toBeNull())
})
describe('imagens', () => {
  it('aceita tipos permitidos e limite exato', () => expect(validateImage({ type: 'image/png', size: 5242880 })).toBeNull())
  it.each([{ type: 'image/svg+xml', size: 10 }, { type: 'image/png', size: 5242881 }, { type: 'image/png', size: 0 }])('rejeita arquivo inválido %j', file => expect(validateImage(file)).not.toBeNull())
})
describe('erros exibidos', () => {
  it('explica conflitos e sessão expirada', () => {
    expect(errorMessage({ message: 'VERSION_CONFLICT' })).toContain('outra aba')
    expect(errorMessage({ status: 401 })).toContain('sessão expirou')
  })
  it('não expõe mensagens internas do servidor', () => expect(errorMessage(new Error('secret token address'))).not.toContain('secret'))
})
