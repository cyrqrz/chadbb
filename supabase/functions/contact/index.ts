import { serviceApi } from '../_shared/storage.ts'
import { createContactHandler } from './handler.ts'

// Formulário de contato público: sem login, com origem permitida, cota e campo-armadilha.
// Usa a mesma chave e o mesmo remetente do Resend dos lembretes; o destino é o contato público.
const api = serviceApi(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
Deno.serve(createContactHandler({
  allowed: (Deno.env.get('GUEST_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173').split(','),
  apiKey: Deno.env.get('CONTACT_RESEND_API_KEY') ?? Deno.env.get('RSVP_RESEND_API_KEY') ?? '',
  from: Deno.env.get('CONTACT_EMAIL_FROM') ?? Deno.env.get('RSVP_EMAIL_FROM') ?? '',
  to: Deno.env.get('CONTACT_EMAIL_TO') ?? 'contato@chadbb.online',
  rpc: api.rpc,
}))
