// Tamanhos de fralda do menor ao maior. O banco ordena `diaper_size` como texto
// (G, M, P, XG); as telas usam esta ordem. Fica em `lib` para o convite não
// carregar o cliente Supabase de `features/gifts/api`.
export const DIAPER_SIZES = ['P', 'M', 'G', 'XG'] as const

const rank = (size: string | null) => { const at = DIAPER_SIZES.indexOf(size as (typeof DIAPER_SIZES)[number]); return at < 0 ? DIAPER_SIZES.length : at }

// Só para listas de fraldas: mimos não têm tamanho e mantêm a ordem do servidor.
export const bySize = <T extends { diaper_size: string | null }>(items: T[]) => [...items].sort((a, b) => rank(a.diaper_size) - rank(b.diaper_size))
