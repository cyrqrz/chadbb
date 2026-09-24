import type { RsvpPolicy } from '../../src/features/guests/api'
// Datas de exemplo fornecidas pelo servidor simulado; o front não as calcula.
export const rsvpFixture: RsvpPolicy = {
  maybe_allowed: true, maybe_closes_at: '2035-08-31T17:30:00Z', confirmation_due_at: '2035-09-03T17:30:00Z',
  reminder_sent: false, reminder_email_set: false,
}
