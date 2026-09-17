import { useEffect, useState } from 'react'

// Aviso de reconsulta só quando ela demora: a consulta de 5 em 5 s costuma
// responder em milissegundos, e o texto piscando a cada ciclo parece tremida.
export const SLOW_REFRESH_MS = 800

export function useDelayedFlag(value: boolean, delay = SLOW_REFRESH_MS) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!value) { const reset = setTimeout(() => setShown(false), 0); return () => clearTimeout(reset) }
    const timer = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return value && shown
}
