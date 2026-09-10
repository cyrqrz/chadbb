import { createClient } from '@supabase/supabase-js'
import { readPublicConfig } from './config'

export const backend = readPublicConfig(import.meta.env)
export const supabase = backend.status === 'ready'
  ? createClient(backend.config.url, backend.config.key, { auth: { flowType: 'pkce', detectSessionInUrl: false } })
  : null
