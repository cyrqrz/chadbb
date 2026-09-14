import { QueryClient } from '@tanstack/react-query'

// Contrato de atualização (docs/PLANO-EXECUCAO-MVP.md): cache nunca é apresentado
// como resposta nova. Toda consulta de dado dinâmico refaz a chamada ao montar a
// tela, ao voltar para a aba e ao reconectar; o cache só preenche a tela enquanto
// a resposta chega, sempre com indicação de atualização na interface.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
      retry: 1,
    },
    mutations: { retry: false },
  },
})

// Consulta periódica de segurança das telas dinâmicas, usada enquanto não existir
// notificação autorizada de alteração. Pausa em segundo plano e recua em falha
// para não insistir contra um backend indisponível.
export const LIVE_INTERVAL_MS = 5_000
export const MAX_LIVE_INTERVAL_MS = 60_000

export function liveInterval(failures: number) {
  if (failures <= 0) return LIVE_INTERVAL_MS
  return Math.min(LIVE_INTERVAL_MS * 2 ** failures, MAX_LIVE_INTERVAL_MS)
}

// Aplicar às consultas que mostram estado compartilhado do evento. `refetchInterval`
// sem `refetchIntervalInBackground` só corre com a aba visível. O parâmetro é
// estrutural para servir a qualquer tipo de resultado sem repetir os genéricos.
export const live = {
  refetchInterval: (query: { state: { fetchFailureCount: number } }) => liveInterval(query.state.fetchFailureCount),
}
