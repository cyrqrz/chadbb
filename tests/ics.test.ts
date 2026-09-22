import { describe, expect, it } from 'vitest'
import { buildIcs, googleCalendarUrl } from '../src/lib/ics'

const event = { uid: 'evento-1@chadbb.pages.dev', title: 'Chá de bebê, vírgula; e "aspas"', startsAt: '2035-11-01T15:00:00Z', location: 'Rua Fictícia, 123', description: 'Linha um\nLinha dois' }

describe('buildIcs', () => {
  it('gera um VEVENT válido com término padrão de 3 h quando não informado', () => {
    const ics = buildIcs(event)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20351101T150000Z')
    expect(ics).toContain('DTEND:20351101T180000Z')
    expect(ics).toContain('UID:evento-1@chadbb.pages.dev')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
  it('usa o término informado em vez do padrão', () => {
    const ics = buildIcs({ ...event, endsAt: '2035-11-01T19:00:00Z' })
    expect(ics).toContain('DTEND:20351101T190000Z')
  })
  it('escapa vírgula, ponto e vírgula e quebra de linha (RFC 5545)', () => {
    const ics = buildIcs(event)
    expect(ics).toContain('SUMMARY:Chá de bebê\\, vírgula\\; e "aspas"')
    expect(ics).toContain('LOCATION:Rua Fictícia\\, 123')
    expect(ics).toContain('DESCRIPTION:Linha um\\nLinha dois')
  })
  it('omite LOCATION e DESCRIPTION quando ausentes', () => {
    const ics = buildIcs({ uid: 'x', title: 'Só o essencial', startsAt: '2035-11-01T15:00:00Z' })
    expect(ics).not.toContain('LOCATION:')
    expect(ics).not.toContain('DESCRIPTION:')
  })
})

describe('googleCalendarUrl', () => {
  it('monta a URL com as datas no formato UTC e os campos opcionais', () => {
    const url = new URL(googleCalendarUrl(event))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('dates')).toBe('20351101T150000Z/20351101T180000Z')
    expect(url.searchParams.get('location')).toBe('Rua Fictícia, 123')
  })
})
