// G5: cartão de calendário do convite. Gerado no navegador (RFC 5545), sem
// servidor novo e sem CSP nova — só um Blob baixado pelo próprio convidado.
export type IcsEvent = { uid: string; title: string; startsAt: string; endsAt?: string | null; location?: string; description?: string }

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}
// Sem horário de término no convite do convidado (regra 6: o front não recalcula
// prazos de negócio), um bloco de 3 h é só uma duração padrão de exibição no
// calendário pessoal — não é usado em nenhuma regra do site.
function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString()
}
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
// RFC 5545: linhas de conteúdo dobram em 75 octetos, continuação com um espaço.
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  while (rest.length > 75) { parts.push(rest.slice(0, 75)); rest = rest.slice(75) }
  parts.push(rest)
  return parts.join('\r\n ')
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//chadbb//convite//PT-BR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(event.startsAt)}`,
    `DTEND:${toIcsDate(event.endsAt ?? addHours(event.startsAt, 3))}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function googleCalendarUrl(event: IcsEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: event.title,
    dates: `${toIcsDate(event.startsAt)}/${toIcsDate(event.endsAt ?? addHours(event.startsAt, 3))}`,
  })
  if (event.location) params.set('location', event.location)
  if (event.description) params.set('details', event.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
