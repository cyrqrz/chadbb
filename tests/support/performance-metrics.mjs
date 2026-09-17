export function passesCriteria({ readP95, writeP95, syncMs, loadErrors, uiErrors }) {
  const within = (value, max) => Number.isFinite(value) && value >= 0 && value <= max
  return loadErrors === 0 && uiErrors === 0 && within(readP95, 2000) && within(writeP95, 2000) &&
    syncMs.length === 3 && syncMs.every(ms => within(ms, 7000))
}

// TanStack Query cancela leituras em voo antes de mutações (GuestPage.mutate).
// ERR_ABORTED é cancelamento, não erro de transporte; a atualização visual
// ainda precisa ser comprovada dentro do prazo para o ensaio passar.
export function isNetworkFailure(errorText, action) {
  return errorText !== 'net::ERR_ABORTED' || action !== 'read'
}
