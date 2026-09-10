export function errorMessage(error: unknown): string {
  const object = error && typeof error === 'object' ? error as { message?: string; code?: string; status?: number } : {}
  const messages: Record<string, string> = {
    AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.',
    EVENT_NOT_FOUND: 'Evento não encontrado ou sem permissão de acesso.',
    EVENT_CLOSED: 'Este evento está encerrado e não pode ser alterado.',
    VERSION_CONFLICT: 'Este evento mudou em outra aba. Recarregue os dados antes de salvar novamente.',
    PUBLICATION_INVALID: 'Para publicar, informe um título e uma data futura.',
    INVALID_TRANSITION: 'Essa mudança de estado não está disponível.',
    INVALID_QUANTITY: 'Informe uma quantidade inteira entre 1 e 10.000.',
    PRODUCT_UNAVAILABLE: 'Este produto não está mais disponível no catálogo.',
    ITEM_NOT_FOUND: 'Item não encontrado nesta lista ou sem permissão de acesso.',
    ITEM_ALREADY_EXISTS: 'Este produto já está na lista. Altere a quantidade em Presentes escolhidos.',
    ITEM_VERSION_CONFLICT: 'A quantidade mudou em outra aba. Recarregue a versão salva antes de tentar novamente.',
    QUANTITY_BELOW_COMMITTED: 'A quantidade não pode ser menor que o total já reservado.',
    RESERVATION_INTEGRATION_REQUIRED: 'A alteração de quantidades está temporariamente indisponível.',
    INVALID_COVER: 'Imagem inválida para este evento. Envie a imagem novamente.',
  }
  if (object.message && messages[object.message]) return messages[object.message]
  if (object.status === 401 || object.code === 'PGRST301' || object.code === 'refresh_token_not_found') return messages.AUTH_REQUIRED
  if (object.status === 429 || object.code === 'over_email_send_rate_limit') return 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.'
  if (object.code === '23514' || object.code === '23502' || object.code === '22007') return 'Confira os campos informados e tente novamente.'
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.'
}
