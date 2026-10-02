// Tamanhos máximos dos campos de texto: uma tabela só para o front, as Edge Functions e o banco.
// O teste tests/limits.test.ts confere que cada número aparece onde deve (maxLength nos campos,
// validação do modelo, CHECK/RPC nas migrations). Mudou aqui? Mude a migration e rode o teste.
export const limits = {
  eventTitle: 120,
  eventDescription: 2000,
  eventAddress: 500,
  eventInstructions: 2000,
  giftTitle: 160,
  giftDescription: 2000,
  invitationName: 120,
  invitationCapacity: 50,
  email: 254,
  contactName: 120,
  contactMessage: 4000,
  contactDetails: 4000,
  giftQuantity: 1000,
  listQuantity: 10000,
} as const
