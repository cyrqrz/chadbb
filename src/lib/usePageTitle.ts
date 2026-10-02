import { useEffect } from 'react'

// WCAG 2.4.2: cada tela tem título próprio na aba e no leitor de tela. Sem isso, toda
// rota ficava com o título do index.html e a troca de página não se distinguia.
export const SITE_TITLE = 'chadbb · Chá de bebê'
// `null` volta ao título do site; `undefined` não mexe (outra parte da tela decide).
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => { if (title !== undefined) document.title = title ? `${title} · chadbb` : SITE_TITLE }, [title])
}
