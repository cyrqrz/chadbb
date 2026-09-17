import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
export const AuthContext = createContext<{ session: Session | null; loading: boolean; error: string | null }>({ session: null, loading: true, error: null })
export const useAuth = () => useContext(AuthContext)

// Link aberto em outro navegador (PKCE): o código do mesmo e-mail funciona em qualquer um.
export const LINK_FAILED = 'Não foi possível entrar por este link. Ele só funciona no mesmo navegador em que você pediu o acesso. Em qualquer navegador, você pode entrar com o código de 8 dígitos do mesmo e-mail.'
