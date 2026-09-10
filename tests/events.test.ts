import { describe, expect, it } from 'vitest'
import { toLocalDate, validateDraft, validateImage } from '../src/features/events/model'
import { errorMessage } from '../src/lib/errors'

const draft = { title: '', public_description: '', private_address: '', private_instructions: '', localDate: '', cover_path: null }
describe('evento', () => {
  it('aceita rascunho incompleto, mas não publicação', () => {
    expect(validateDraft(draft)).toBeNull()
    expect(validateDraft(draft, true)).toContain('título')
  })
  it('exige data futura para publicar', () => {
    const value = { ...draft, title: 'Chá', localDate: '2030-01-01T12:00' }
    expect(validateDraft(value, true, new Date('2029-01-01').getTime())).toBeNull()
    expect(validateDraft(value, true, new Date('2031-01-01').getTime())).not.toBeNull()
  })
  it('rejeita data inválida sem lançar exceção', () => expect(validateDraft({ ...draft, localDate: 'inválida' })).not.toBeNull())
  it('preserva o horário local na ida e volta', () => {
    const value = '2030-10-11T12:34'
    expect(toLocalDate(new Date(value).toISOString())).toBe(value)
    expect(toLocalDate(null)).toBe('')
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
