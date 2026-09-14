// Expurgo de dados pessoais: Storage primeiro, banco depois. A ausência de objetos é estado válido,
// então uma falha do banco após apagar arquivos é concluída na execução seguinte.
const base = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const secret = Deno.env.get('RETENTION_CRON_SECRET') ?? ''
const buckets = ['event-public', 'event-private']
const auth = { apikey: key, Authorization: `Bearer ${key}` }

async function call(path: string, method: string, body: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await response.text()
  return { ok: response.ok, data: text ? JSON.parse(text) : null }
}
const rpc = (name: string, body: unknown) => call(`/rest/v1/rpc/${name}`, 'POST', body)

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

async function purgeStorage(eventId: string, ownerId: string) {
  const folder = `${ownerId}/${eventId}`
  let removed = 0
  for (const bucket of buckets) {
    const paths: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const page = await call(`/storage/v1/object/list/${bucket}`, 'POST', { prefix: folder, limit: 1000, offset })
      if (!page.ok) throw new Error('STORAGE_LIST_FAILED')
      const files = (page.data ?? []).filter((entry: { id: string | null }) => entry.id !== null)
      paths.push(...files.map((entry: { name: string }) => `${folder}/${entry.name}`))
      if ((page.data ?? []).length < 1000) break
    }
    if (!paths.length) continue
    const shared = await rpc('retention_referenced_paths', { p_event_id: eventId, p_paths: paths })
    if (!shared.ok) throw new Error('STORAGE_REFERENCE_CHECK_FAILED')
    const exclusive = paths.filter(path => !(shared.data as string[]).includes(path))
    if (!exclusive.length) continue
    const deleted = await call(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: exclusive })
    if (!deleted.ok) throw new Error('STORAGE_DELETE_FAILED')
    removed += (deleted.data ?? []).length
  }
  return removed
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
      try { removed = await purgeStorage(event_id, owner_id) } catch {
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
    return reply(200, summary)
  } catch { return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) }
})
