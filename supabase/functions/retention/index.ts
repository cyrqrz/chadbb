// Expurgo de dados pessoais: Storage primeiro, banco depois. A ausência de objetos é estado válido,
// então uma falha do banco após apagar arquivos é concluída na execução seguinte.
import { cleanDeletedEvents, purgeFolder, serviceApi } from '../_shared/storage.ts'

const secret = Deno.env.get('RETENTION_CRON_SECRET') ?? ''
const api = serviceApi(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const rpc = api.rpc

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}
async function authorized(provided: string) {
  if (secret.length < 32) return false
  const [a, b] = await Promise.all([digest(provided), digest(secret)])
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}

Deno.serve(async request => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers })
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
  if (!await authorized(request.headers.get('x-retention-secret') ?? '')) return reply(401, { error: 'UNAUTHORIZED' })
  try {
    const due = await rpc('retention_run', {})
    if (!due.ok) return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' })
    const summary = { due: due.data.length, purged: 0, already_purged: 0, storage_failed: 0, db_failed: 0, storage_objects_removed: 0 }
    for (const { event_id, owner_id } of due.data as { event_id: string; owner_id: string }[]) {
      let removed: number
      try { removed = await purgeFolder(api, event_id, `${owner_id}/${event_id}`) } catch {
        await rpc('retention_record_failure', { p_event_id: event_id, p_status: 'storage_failed', p_storage_removed: null })
        summary.storage_failed++
        continue
      }
      summary.storage_objects_removed += removed
      const purge = await rpc('retention_purge_event', { p_event_id: event_id, p_storage_removed: removed })
      if (!purge.ok) {
        await rpc('retention_record_failure', { p_event_id: event_id, p_status: 'db_failed', p_storage_removed: removed })
        summary.db_failed++
      } else if (purge.data === 'purged') summary.purged++
      else if (purge.data === 'already_purged') summary.already_purged++
    }
    // Exclusões feitas pelo organizador cuja limpeza do Storage ainda não concluiu.
    let deleted = { cleaned: 0, failed: 0, storage_objects_removed: 0 }
    try { deleted = await cleanDeletedEvents(api, null) } catch { deleted.failed++ }
    return reply(200, { ...summary, deleted_events_cleaned: deleted.cleaned, deleted_events_failed: deleted.failed,
      deleted_events_storage_removed: deleted.storage_objects_removed })
  } catch { return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) }
})
