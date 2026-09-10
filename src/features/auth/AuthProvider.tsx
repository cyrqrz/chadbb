import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/query'
import { AuthContext } from './context'

let initialization: Promise<{ session: Session | null; error: string | null }> | undefined
function initializeAuth() {
  if (initialization) return initialization
  const client = supabase
  const params = new URLSearchParams(window.location.search)
  const isCallback = window.location.pathname === '/auth/callback'
  const code = isCallback ? params.get('code') : null
  const flowId = isCallback ? params.get('sb_flow_id') : null
  const failed = isCallback && (params.has('error') || window.location.hash.includes('error='))
  if (isCallback) window.history.replaceState(null, '', '/auth/callback')
  if (!client) return Promise.resolve({ session: null, error: null })
  initialization = (async () => {
    if (failed) return { session: null, error: 'O link de acesso expirou ou é inválido. Solicite outro link.' }
    const { data, error } = code ? await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined) : await client.auth.getSession()
    if (error || (isCallback && !data.session)) return { session: null, error: 'Não foi possível acessar. Reabra o link no mesmo navegador em que o solicitou ou peça outro.' }
    return { session: data.session, error: null }
  })().catch(() => ({ session: null, error: 'Não foi possível recuperar sua sessão. Entre novamente.' }))
  return initialization
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean; error: string | null }>({ session: null, loading: true, error: null })
  useEffect(() => {
    let active = true
    let revision = 0
    let userId: string | null = null
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      // Renovação do token preserva formulários; troca de usuário limpa consultas privadas.
      if (_event !== 'INITIAL_SESSION') {
        revision += 1
        const nextId = session?.user.id ?? null
        if (nextId !== userId || _event === 'SIGNED_OUT') queryClient.clear()
        userId = nextId
        if (active) setState({ session, loading: false, error: null })
      }
    }).data.subscription
    const current = revision
    void initializeAuth().then((result) => {
      if (active && revision === current) { userId = result.session?.user.id ?? null; setState({ ...result, loading: false }) }
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
