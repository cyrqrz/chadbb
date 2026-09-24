import { serviceApi } from '../_shared/storage.ts'
import { createReminderHandler } from './worker.ts'

const api = serviceApi(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
Deno.serve(createReminderHandler({
  secret: Deno.env.get('RSVP_CRON_SECRET') ?? '',
  apiKey: Deno.env.get('RSVP_RESEND_API_KEY') ?? '',
  from: Deno.env.get('RSVP_EMAIL_FROM') ?? '',
  rpc: api.rpc,
}))
