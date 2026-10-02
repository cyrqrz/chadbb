import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { limits } from '../src/lib/limits'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const sql = readdirSync(new URL('supabase/migrations/', root)).map(name => read(`supabase/migrations/${name}`)).join('\n')
const front = (path: string, size: number) => expect(read(path), `${path} sem maxLength={${size}}`).toContain(`maxLength={${size}}`)

describe('tamanhos de campo alinhados entre front, Edge e banco', () => {
  test('evento', () => {
    expect(sql).toContain(`char_length(title) <= ${limits.eventTitle}`)
    expect(sql).toContain(`char_length(public_description) <= ${limits.eventDescription}`)
    expect(sql).toContain(`char_length(private_address) <= ${limits.eventAddress}`)
    expect(sql).toContain(`char_length(private_instructions) <= ${limits.eventInstructions}`)
    front('src/features/events/EventPage.tsx', limits.eventTitle); front('src/features/events/EventPage.tsx', limits.eventDescription)
    front('src/features/events/EventPage.tsx', limits.eventAddress); front('src/features/events/EventsPage.tsx', limits.eventTitle)
    const model = read('src/features/events/model.ts')
    for (const size of [limits.eventTitle, limits.eventDescription, limits.eventAddress, limits.eventInstructions]) expect(model).toContain(`.length > ${size}`)
  })
  test('presentes', () => {
    expect(sql).toContain(`length(btrim(title)) between 1 and ${limits.giftTitle}`)
    expect(sql).toContain(`length(description) <= ${limits.giftDescription}`)
    expect(sql).toContain(`between 1 and ${limits.listQuantity}`)
    expect(sql).toContain(`quantity between 1 and ${limits.giftQuantity}`)
    front('src/features/gifts/GiftListPage.tsx', limits.giftTitle); front('src/features/gifts/GiftListPage.tsx', limits.giftDescription)
  })
  test('convites e e-mail', () => {
    expect(sql).toContain(`length(btrim(name)) between 1 and ${limits.invitationName}`)
    expect(sql).toContain(`capacity between 1 and ${limits.invitationCapacity}`)
    expect(sql).toContain(`length(email) <= ${limits.email}`)
    front('src/features/guests/InvitationsPage.tsx', limits.invitationName)
    for (const file of ['auth/LoginPage', 'guests/GuestPage', 'legal/ContactForm']) front(`src/features/${file}.tsx`, limits.email)
  })
  test('contato (Edge e formulário)', () => {
    const handler = read('supabase/functions/contact/handler.ts')
    expect(handler).toContain(`name: ${limits.contactName}, email: ${limits.email}, message: ${limits.contactMessage}, details: ${limits.contactDetails}`)
    front('src/features/legal/ContactForm.tsx', limits.contactName); front('src/features/legal/ContactForm.tsx', limits.contactMessage)
  })
})
