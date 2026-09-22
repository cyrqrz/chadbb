import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberDestination, safeInternalPath, takeDestination } from '../src/features/auth/destination'

// A suíte roda em `node`, sem DOM. Um armazenamento de mentira basta: o que
// importa aqui é a regra, e o armazenamento de verdade é exercitado no e2e,
// que roda em navegador. `broken` cobre o modo privado, onde o acesso lança.
function fakeStorage(broken = false) {
  const data = new Map<string, string>()
  const boom = () => { throw new Error('storage bloqueado') }
  return {
    getItem: (key: string) => broken ? boom() : data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (broken) boom(); data.set(key, value) },
    removeItem: (key: string) => { if (broken) boom(); data.delete(key) },
    clear: () => data.clear(),
  }
}
function useStorage(storage: unknown) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
}

describe('safeInternalPath', () => {
  it('aceita caminho do próprio site, com busca', () => {
    expect(safeInternalPath('/eventos')).toBe('/eventos')
    expect(safeInternalPath('/eventos/abc/convites?aba=2')).toBe('/eventos/abc/convites?aba=2')
  })

  // O risco é redirecionamento aberto: um link para /eventos que, depois do
  // login, larga a pessoa num site que imita o chadbb.
  it('recusa qualquer coisa que leve para fora', () => {
    for (const raw of ['//evil.example', '/\\evil.example', 'https://evil.example', '//evil.example/eventos',
      '/javascript:alert(1)', '//', '/\\', 'eventos', '']) {
      expect(safeInternalPath(raw), `deveria recusar ${JSON.stringify(raw)}`).toBeNull()
    }
  })

  it('recusa as próprias telas de login, que fariam laço', () => {
    expect(safeInternalPath('/entrar')).toBeNull()
    expect(safeInternalPath('/auth/callback')).toBeNull()
    expect(safeInternalPath('/entrar?erro=1')).toBeNull()
  })

  it('recusa o que não é texto', () => {
    for (const raw of [null, undefined, 42, {}, ['/eventos']]) expect(safeInternalPath(raw)).toBeNull()
  })
})

describe('rememberDestination e takeDestination', () => {
  beforeEach(() => { useStorage(fakeStorage()); vi.useRealTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('devolve o destino guardado uma única vez', () => {
    rememberDestination('/eventos/abc/convites')
    expect(takeDestination()).toBe('/eventos/abc/convites')
    // Uma entrada seguinte não pode herdar o caminho da anterior.
    expect(takeDestination()).toBeNull()
  })

  it('não guarda destino inseguro e limpa o que havia', () => {
    rememberDestination('/eventos')
    rememberDestination('//evil.example')
    expect(takeDestination()).toBeNull()
  })

  it('descarta destino velho', () => {
    vi.useFakeTimers()
    rememberDestination('/eventos')
    vi.advanceTimersByTime(61 * 60 * 1000)
    expect(takeDestination()).toBeNull()
  })

  it('ignora conteúdo corrompido sem quebrar a tela', () => {
    localStorage.setItem('chadbb.login.destination', 'não é json')
    expect(takeDestination()).toBeNull()
    localStorage.setItem('chadbb.login.destination', JSON.stringify({ path: 'https://evil.example', at: Date.now() }))
    expect(takeDestination()).toBeNull()
    localStorage.setItem('chadbb.login.destination', JSON.stringify({ path: '/eventos' }))
    expect(takeDestination(), 'sem carimbo de tempo não dá para saber se envelheceu').toBeNull()
  })

  // Modo privado ou armazenamento bloqueado: entrar tem de continuar funcionando,
  // sem o destino, em vez de a tela quebrar.
  it('não quebra quando o armazenamento lança', () => {
    useStorage(fakeStorage(true))
    expect(() => rememberDestination('/eventos')).not.toThrow()
    expect(takeDestination()).toBeNull()
  })

  it('não quebra quando não existe armazenamento nenhum', () => {
    useStorage(undefined)
    expect(() => rememberDestination('/eventos')).not.toThrow()
    expect(takeDestination()).toBeNull()
  })
})
