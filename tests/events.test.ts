import { describe, expect, it } from 'vitest'
import { daysUntil, fromLocalDate, inSetup, isEventId, pendingSteps, toLocalDate, validateDraft, validateImage } from '../src/features/events/model'
import { errorMessage } from '../src/lib/errors'

const draft = { title: '', public_description: '', private_address: '', private_instructions: '', localDate: '', localEndDate: '', cover_path: null }
describe('evento', () => {
  it('lista as etapas pendentes só de evento publicado, na ordem sugerida', () => {
    const base = { status: 'published' as const, guests_done_at: null, gifts_done_at: null }
    expect(pendingSteps(base)).toEqual(['guests', 'gifts'])
    expect(pendingSteps({ ...base, guests_done_at: '2026-09-18T12:00:00Z' })).toEqual(['gifts'])
    expect(pendingSteps({ ...base, status: 'draft' })).toEqual([])
    expect(pendingSteps({ ...base, status: 'closed' })).toEqual([])
    expect(inSetup({ ...base, status: 'draft' })).toBe(true)
    expect(inSetup(base)).toBe(true)
    expect(inSetup({ ...base, guests_done_at: 'x', gifts_done_at: 'y' })).toBe(false)
  })
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
  // Endereço digitado à mão (ou um placeholder colado) não pode virar consulta:
  // o Postgres recusa o texto como uuid e o erro 400 vira "confira sua conexão".
  it('só reconhece como evento um id em formato uuid', () => {
    expect(isEventId('20000000-0000-4000-8000-000000000002')).toBe(true)
    expect(isEventId('20000000-0000-4000-8000-000000000002'.toUpperCase())).toBe(true)
    for (const invalid of ['<id>', '', 'abc', '20000000-0000-4000-8000', '20000000-0000-4000-8000-00000000000g', ' 20000000-0000-4000-8000-000000000002'])
      expect(isEventId(invalid)).toBe(false)
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

describe('contagem de dias até o evento (horário de Brasília)', () => {
  const at = (iso: string) => new Date(iso).getTime()
  it('conta dias de calendário em Brasília, não horas corridas', () => {
    expect(daysUntil('2035-09-10T17:30:00Z', at('2035-09-01T12:00:00-03:00'))).toBe(9)
    // 23h de Brasília do dia 9 → evento no dia 10: falta 1 dia.
    expect(daysUntil('2035-09-10T17:30:00Z', at('2035-09-09T23:00:00-03:00'))).toBe(1)
    // 01h UTC do dia 10 ainda é dia 9 em Brasília.
    expect(daysUntil('2035-09-10T17:30:00Z', at('2035-09-10T01:00:00Z'))).toBe(1)
    expect(daysUntil('2035-09-10T17:30:00Z', at('2035-09-10T08:00:00-03:00'))).toBe(0)
    expect(daysUntil('2035-09-10T17:30:00Z', at('2035-09-12T08:00:00-03:00'))).toBe(-2)
  })
  it('sem data não há contagem', () => {
    expect(daysUntil(null, at('2035-09-01T12:00:00Z'))).toBeNull()
  })
})
