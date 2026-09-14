export function errorMessage(error: unknown): string {
  const object = error && typeof error === 'object' ? error as { message?: string; code?: string; status?: number } : {}
  const messages: Record<string, string> = {
    EVENT_NOT_PUBLISHED: 'Publique o evento antes de criar convites.',
    INVITATION_VERSION_CONFLICT: 'Este convite mudou. Atualize o painel e revise os dados antes de salvar.',
    INVALID_INVITATION: 'Confira o nome, o tipo e o limite de pessoas do convite.',
    CAPACITY_BELOW_ATTENDING: 'O limite não pode ser menor que o número de pessoas já confirmadas.',
    DIAPER_DEFAULT_REQUIRED: 'Peça à administração para configurar a quantidade inicial deste tamanho.',
    INVITATION_NOT_FOUND: 'Convite não encontrado ou sem permissão.',
    AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente.',
    EVENT_NOT_FOUND: 'Evento não encontrado ou sem permissão de acesso.',
    EVENT_CLOSED: 'Este evento está encerrado e não pode ser alterado.',
    VERSION_CONFLICT: 'Este evento mudou em outra aba. Recarregue os dados antes de salvar novamente.',
    PUBLICATION_INVALID: 'Para publicar, informe um título, uma data futura e o término.',
    EVENT_ENDS_BEFORE_START: 'O término deve ser depois do início.',
    EVENT_PURGED: 'Os dados pessoais deste evento já foram excluídos pela política de retenção. Não é possível alterá-lo.',
    INVALID_TRANSITION: 'Essa mudança de estado não está disponível.',
    INVALID_QUANTITY: 'Informe uma quantidade inteira entre 1 e 10.000.',
    PRODUCT_UNAVAILABLE: 'Este produto não está mais disponível no catálogo.',
    ITEM_NOT_FOUND: 'Item não encontrado nesta lista ou sem permissão de acesso.',
    ITEM_ALREADY_EXISTS: 'Este produto já está na lista. Altere a quantidade em Presentes escolhidos.',
    ITEM_VERSION_CONFLICT: 'A quantidade mudou em outra aba. Recarregue a versão salva antes de tentar novamente.',
    QUANTITY_BELOW_COMMITTED: 'A quantidade não pode ser menor que o total já reservado.',
    RESERVATION_INTEGRATION_REQUIRED: 'A alteração de quantidades está temporariamente indisponível.',
    DIAPER_LIMIT_REQUIRED: 'Cada tamanho de fralda precisa de um limite de pacotes.',
    TREAT_HAS_NO_LIMIT: 'Mimos não têm limite de quantidade: o convidado informa quanto vai levar.',
    DIAPER_SIZE_ALREADY_LISTED: 'Este tamanho de fralda já está na lista deste evento.',
    INVALID_COVER: 'Imagem inválida para este evento. Envie a imagem novamente.',
  }
  if (object.message && messages[object.message]) return messages[object.message]
  if (object.status === 401 || object.code === 'PGRST301' || object.code === 'refresh_token_not_found') return messages.AUTH_REQUIRED
  if (object.status === 429 || object.code === 'over_email_send_rate_limit') return 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.'
  if (object.code === '23514' || object.code === '23502' || object.code === '22007') return 'Confira os campos informados e tente novamente.'
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.'
}
