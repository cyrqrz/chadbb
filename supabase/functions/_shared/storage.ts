// Remoção de arquivos pela API de Storage (DELETE direto em storage.objects é bloqueado
// e deixaria o arquivo órfão). A ausência de objetos é estado válido.
const buckets = ['event-public', 'event-private']

export function serviceApi(base: string, key: string) {
  const auth = { apikey: key, Authorization: `Bearer ${key}` }
  async function call(path: string, method: string, body: unknown) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const text = await response.text()
    return { ok: response.ok, data: text ? JSON.parse(text) : null }
  }
  const rpc = (name: string, body: unknown) => call(`/rest/v1/rpc/${name}`, 'POST', body)
  return { call, rpc }
}

// Remove os arquivos da pasta "<owner>/<event>" que nenhum outro evento usa como capa.
export async function purgeFolder(api: ReturnType<typeof serviceApi>, eventId: string, folder: string) {
  let removed = 0
  for (const bucket of buckets) {
    const paths: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const page = await api.call(`/storage/v1/object/list/${bucket}`, 'POST', { prefix: folder, limit: 1000, offset })
      if (!page.ok) throw new Error('STORAGE_LIST_FAILED')
      const files = (page.data ?? []).filter((entry: { id: string | null }) => entry.id !== null)
      paths.push(...files.map((entry: { name: string }) => `${folder}/${entry.name}`))
      if ((page.data ?? []).length < 1000) break
    }
    if (!paths.length) continue
    const shared = await api.rpc('retention_referenced_paths', { p_event_id: eventId, p_paths: paths })
    if (!shared.ok) throw new Error('STORAGE_REFERENCE_CHECK_FAILED')
    const exclusive = paths.filter(path => !(shared.data as string[]).includes(path))
    if (!exclusive.length) continue
    const deleted = await api.call(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: exclusive })
    if (!deleted.ok) throw new Error('STORAGE_DELETE_FAILED')
    removed += (deleted.data ?? []).length
  }
  return removed
}

// Conclui as pastas de eventos excluídos; falhas ficam pendentes para a próxima tentativa.
export async function cleanDeletedEvents(api: ReturnType<typeof serviceApi>, eventId: string | null) {
  const pending = await api.rpc('event_deletion_pending', { p_event_id: eventId })
  if (!pending.ok) throw new Error('DELETION_PENDING_FAILED')
  const summary = { cleaned: 0, failed: 0, storage_objects_removed: 0 }
  for (const { event_id, storage_prefix } of pending.data as { event_id: string; storage_prefix: string }[]) {
    try {
      const removed = await purgeFolder(api, event_id, storage_prefix)
      const done = await api.rpc('event_deletion_storage_done', { p_event_id: event_id, p_removed: removed })
      if (!done.ok) throw new Error('DELETION_DONE_FAILED')
      summary.cleaned++
      summary.storage_objects_removed += removed
    } catch {
      await api.rpc('event_deletion_storage_failed', { p_event_id: event_id }).catch(() => null)
      summary.failed++
    }
  }
  return summary
}
