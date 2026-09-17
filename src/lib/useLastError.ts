import { useState } from 'react'

// Mantém a mensagem da última falha enquanto a nova tentativa limpa `error`,
// para o aviso não mudar de texto (e não ser relido) durante a tentativa.
export function useLastError(error: unknown) {
  const [last, setLast] = useState<unknown>(null)
  if (error && error !== last) setLast(error)
  return error ?? last
}
