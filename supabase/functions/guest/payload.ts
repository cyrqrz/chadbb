// Cada ação aceita só as chaves que o front envia. O payload inteiro é gravado em
// private.guest_requests (idempotência); sem esta lista, um convite válido poderia
// gravar até 16 KB de lixo por pedido, 120 vezes por minuto.
export const payloadKeys: Record<string, string[]> = {
  exchange: [], read: [],
  rsvp: ['request_id', 'response', 'attending', 'version', 'reminder_email'],
  reserve: ['request_id', 'item_id', 'quantity', 'version'],
  cancel: ['request_id', 'item_id', 'version'],
  purchase: ['request_id', 'item_id', 'version'],
  swap: ['request_id', 'item_id', 'from_item_id', 'version', 'destination_version'],
}
// Maior valor de texto legítimo: e-mail de lembrete (254).
const MAX_TEXT = 254

// Devolve só as chaves permitidas, ou null se o payload não for um objeto ou se algum valor
// for composto ou longo demais. A validação de domínio continua na RPC.
export function cleanPayload(action: string, payload: unknown): Record<string, string | number | null> | null {
  if (payload === undefined || payload === null) return {}
  if (typeof payload !== 'object' || Array.isArray(payload)) return null
  const clean: Record<string, string | number | null> = {}
  for (const key of payloadKeys[action] ?? []) {
    if (!Object.hasOwn(payload, key)) continue
    const value = (payload as Record<string, unknown>)[key]
    if (value === null || typeof value === 'number' && Number.isFinite(value)) clean[key] = value
    else if (typeof value === 'string' && value.length <= MAX_TEXT) clean[key] = value
    else return null
  }
  return clean
}
