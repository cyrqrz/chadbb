import { describe, expect, it } from 'vitest'
import { parseQuantity, searchPattern } from '../src/features/gifts/model'
import { errorMessage } from '../src/lib/errors'

describe('quantidades da lista', () => {
  it.each(['', '0', '-1', '1.5', '1e2', 'Infinity', '10001', 'NaN', ' 2 ', '2a'])('rejeita %j', value => expect(parseQuantity(value)).toBeNull())
  it.each([['1', 1], ['10000', 10000], ['002', 2]] as const)('aceita inteiro %s', (value, expected) => expect(parseQuantity(value)).toBe(expected))
  it('explica conflito de versão e produto repetido', () => {
    expect(errorMessage({ message: 'ITEM_VERSION_CONFLICT' })).toContain('outra aba')
    expect(errorMessage({ message: 'ITEM_ALREADY_EXISTS' })).toContain('já está na lista')
  })
})
describe('busca no catálogo', () => {
  it('trata curingas como texto e limita o tamanho', () => {
    expect(searchPattern('  50%_\\ ')).toBe('%50\\%\\_\\\\%')
    expect(searchPattern('x'.repeat(130))).toHaveLength(122)
  })
})
