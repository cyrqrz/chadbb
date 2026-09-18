export type Category = 'fralda' | 'mimo'
export type DiaperSize = 'P' | 'M' | 'G' | 'XG'
export type Product = {
  id: string; title: string; description: string
  platform: 'amazon' | 'mercado_livre' | 'shopee' | 'manual'
  category: Category; diaper_size: DiaperSize | null
  active: boolean
  // Preenchido só no mimo criado pelo organizador para este evento.
  event_id?: string | null
}
export type EventItem = {
  id: string; event_id: string; product_id: string
  // NULL é ausência de limite: obrigatório nos mimos, proibido nas fraldas.
  quantity_requested: number | null
  category: Category; diaper_size: DiaperSize | null
  version: number
  product: Product
}
export const categoryLabels: Record<Category, string> = { fralda: 'Fraldas', mimo: 'Mimos' }
export const platformLabels: Record<Product['platform'], string> = {
  amazon: 'Amazon', mercado_livre: 'Mercado Livre', shopee: 'Shopee', manual: 'Catálogo manual',
}
export function parseQuantity(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 1 && number <= 10000 ? number : null
}
export function searchPattern(value: string) {
  // Busca literal: não transforma % e _ digitados em curingas SQL.
  return `%${value.trim().slice(0, 120).replace(/[\\%_]/g, '\\$&')}%`
}
