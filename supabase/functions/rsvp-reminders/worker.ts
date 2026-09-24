type Job = { id: string; lease: string; recipient: string; title: string; confirmation_due_at: string }
type Rpc = (name: string, body: Record<string, unknown>) => Promise<{ ok: boolean; data: unknown }>
type Options = { secret: string; apiKey: string; from: string; rpc: Rpc; transport?: typeof fetch }

async function authorized(provided: string, secret: string) {
  if (secret.length < 32) return false
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  const [a, b] = await Promise.all([digest(provided), digest(secret)])
  const aa = new Uint8Array(a), bb = new Uint8Array(b)
  let difference = 0
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i]
  return difference === 0
}

// Sem Deno ou IO na importação: o mesmo handler roda nos testes com transporte simulado.
export function createReminderHandler({ secret, apiKey, from, rpc, transport = fetch }: Options) {
  return async (request: Request) => {
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    if (!await authorized(request.headers.get('x-rsvp-secret') ?? '', secret)) return reply(401, { error: 'UNAUTHORIZED' })
    if (!apiKey || !from || /[\r\n]/.test(from)) return reply(503, { error: 'REMINDERS_NOT_CONFIGURED' })
    try {
      const claim = await rpc('rsvp_reminders_claim', { p_limit: 10 })
      if (!claim.ok) throw new Error('CLAIM_FAILED')
      const batch = claim.data as { jobs: Job[]; expired: number }
      const counts = { claimed: batch.jobs.length, sent: 0, failed: 0, skipped: 0, rejected: 0, expired: batch.expired }
      for (const claimed of batch.jobs) {
        const args = { p_id: claimed.id, p_lease: claimed.lease }
        const checked = await rpc('rsvp_reminder_check', args)
        if (!checked.ok) { counts.failed++; continue }
        if (!checked.data) { counts.skipped++; continue }
        const job = checked.data as Job
        let accepted = false, rejected = false
        // Prazo fixado no claim: o mesmo texto em qualquer retry da mesma chave.
        const due = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(job.confirmation_due_at))
        try {
          const response = await transport('https://api.resend.com/emails', {
            method: 'POST', signal: AbortSignal.timeout(10_000),
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `rsvp-reminder/${job.id}` },
            body: JSON.stringify({ from, to: [job.recipient], subject: 'Podemos contar com você?',
              text: `Você respondeu “Talvez” ao convite de ${job.title}.\n\nVocê tem três dias para decidir se vai participar: responda até ${due} (horário de Brasília). Sem uma nova resposta nesse prazo, sua presença será marcada como “Não poderá ir”.\n\nAbra o convite original que recebeu da organização (por exemplo, pelo WhatsApp), confira o prazo atualizado e escolha “Vai participar” ou “Não poderá ir”. Se já respondeu, desconsidere este lembrete.\n\nEste e-mail foi solicitado ao selecionar “Talvez” no convite. Ele é usado somente para este lembrete.`,
            }),
          })
          accepted = response.ok
          // 422: destinatário recusado pelo provedor; repetir não muda o resultado.
          rejected = response.status === 422
          await response.body?.cancel()
        } catch { /* Resultado ambíguo: a mesma chave será reutilizada dentro de 23h. */ }
        if (rejected) {
          const dropped = await rpc('rsvp_reminder_reject', args)
          if (dropped.ok && dropped.data === true) counts.rejected++
          else counts.failed++
          continue
        }
        const done = await rpc('rsvp_reminder_complete', { ...args, p_sent: accepted })
        if (accepted && done.ok && done.data === true) counts.sent++
        else counts.failed++
      }
      // Nunca incluir contatos, títulos, payloads ou respostas do provedor.
      return reply(counts.failed ? 503 : 200, counts)
    } catch { return reply(503, { error: 'TEMPORARILY_UNAVAILABLE' }) }
  }
}
