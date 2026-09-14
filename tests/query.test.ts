import { describe, expect, it } from 'vitest'
import { LIVE_INTERVAL_MS, MAX_LIVE_INTERVAL_MS, live, liveInterval, queryClient } from '../src/lib/query'

describe('contrato de atualização dos dados', () => {
  it('não apresenta cache como resposta nova e reconsulta nos gatilhos do plano', () => {
    const queries = queryClient.getDefaultOptions().queries
    expect(queries?.staleTime).toBe(0)
    expect(queries?.refetchOnMount).toBe('always')
    expect(queries?.refetchOnWindowFocus).toBe('always')
    expect(queries?.refetchOnReconnect).toBe('always')
  })
  it('consulta periódica de segurança usa 5 segundos enquanto a consulta responde', () => {
    expect(LIVE_INTERVAL_MS).toBe(5_000)
    expect(liveInterval(0)).toBe(5_000)
    expect(live.refetchInterval({ state: { fetchFailureCount: 0 } })).toBe(5_000)
  })
  it('recua a cada falha consecutiva e para de crescer no limite', () => {
    expect(liveInterval(1)).toBe(10_000)
    expect(liveInterval(2)).toBe(20_000)
    expect(liveInterval(3)).toBe(40_000)
    expect(liveInterval(4)).toBe(MAX_LIVE_INTERVAL_MS)
    expect(liveInterval(50)).toBe(MAX_LIVE_INTERVAL_MS)
  })
  it('mutações não são repetidas automaticamente: reenvio precisa de decisão explícita', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false)
  })
})
