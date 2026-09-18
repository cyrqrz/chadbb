import { useState } from 'react'

// Mantém a mensagem da última falha enquanto a nova tentativa limpa `error`,
// para o aviso não mudar de texto (e não ser relido) durante a tentativa.
// `key` identifica a consulta exibida (ex.: categoria e página): ao trocar, a
// falha de outra consulta é descartada e a nova tentativa aparece como carga.
export function useLastError(error: unknown, key?: string) {
  const [last, setLast] = useState<{ error: unknown; key?: string }>({ error: null, key })
  if (key !== last.key) setLast({ error: error ?? null, key })
  else if (error && error !== last.error) setLast({ error, key })
  return error ?? (key === last.key ? last.error : null)
}
