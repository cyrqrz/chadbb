// Mensagem que o organizador envia pelo WhatsApp: o nome do convidado vai no texto, e a
// prévia do link continua a do evento (o token fica depois do `#` e nunca chega ao servidor).
// Texto neutro: serve para pessoa ou família sem supor gênero.
export function inviteMessage(name: string, title: string, link: string) {
  const event = title.trim() || 'o chá de bebê'
  return `Olá, ${name.trim()}!\n\nVocê recebeu um convite para ${event}. Pelo link, confirme sua presença e, se quiser, escolha um presente:\n${link}`
}

// A mensagem é só uma sugestão e o organizador pode reescrevê-la; o link nunca fica de fora:
// se ele sair do texto, volta na última linha.
export function withLink(text: string, link: string) {
  const trimmed = text.trim()
  if (!trimmed) return link
  return trimmed.includes(link) ? trimmed : `${trimmed}\n${link}`
}

// Compartilhar pelo menu do aparelho, sem passar o texto (com o token) por um servidor como
// o wa.me. Sem esse menu (ou se ele falhar), copia a mensagem para colar no WhatsApp.
export async function shareInvite(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ text }); return 'shared' } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
