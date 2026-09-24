import { getClient } from '../events/api'
import type { Category, DiaperSize, EventItem, Product } from './model'
import { searchPattern } from './model'

export const giftKeys = { items: (eventId: string) => ['event-items', eventId] as const, catalog: ['catalog'] as const }
export const PAGE_SIZE = 12
const fields = 'id,title,description,platform,category,diaper_size,active,event_id'
// O catálogo inteiro cabe numa consulta; o limite só protege contra crescimento inesperado.
export const CATALOG_LIMIT = 200
export async function listProducts(search: string, page: number, category?: Category, size = PAGE_SIZE) {
  // Mimos próprios de um evento não entram no catálogo.
  let query = getClient().from('products').select(fields, { count: 'exact' }).eq('active', true).is('event_id', null)
  if (category) query = query.eq('category', category)
  if (search.trim()) query = query.ilike('title', searchPattern(search))
  const { data, error, count } = await query.order('title').order('id').range(page * size, (page + 1) * size - 1)
  if (error) throw error
  return { products: data as Product[], count: count ?? 0 }
}
export async function listItems(eventId: string, page: number, category?: Category) {
  let query = getClient().from('event_items')
    .select(`id,event_id,product_id,quantity_requested,category,diaper_size,version,product:products(${fields})`, { count: 'exact' })
    .eq('event_id', eventId)
  if (category) query = query.eq('category', category)
  const { data, error, count } = await query.order('created_at').order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw error
  return { items: data as unknown as EventItem[], count: count ?? 0 }
}
// Todas as linhas da lista, sem paginação: o catálogo marca o que já está na
// lista e o resumo soma os pacotes pedidos. O banco continua recusando
// repetição (ITEM_ALREADY_EXISTS e DIAPER_SIZE_ALREADY_LISTED).
export type ListedItem = { product_id: string; diaper_size: DiaperSize | null; category: Category; quantity_requested: number | null }
export async function listedProducts(eventId: string) {
  const { data, error } = await getClient().from('event_items').select('product_id,diaper_size,category,quantity_requested').eq('event_id', eventId)
  if (error) throw error
  return data as ListedItem[]
}
export async function addItem(eventId: string, productId: string, quantity: number | null) {
  const { data, error } = await getClient().rpc('add_event_item', { p_event_id: eventId, p_product_id: productId, p_quantity: quantity }).single()
  if (error) throw error
  return data as Omit<EventItem, 'product'>
}
export async function setQuantity(item: EventItem, quantity: number | null) {
  const { data, error } = await getClient().rpc('set_event_item_quantity', {
    p_event_id: item.event_id, p_item_id: item.id, p_version: item.version, p_quantity: quantity,
  }).single()
  if (error) throw error
  return data as Omit<EventItem, 'product'>
}

// Item com reserva ativa é recusado pelo servidor (ITEM_HAS_RESERVATIONS).
export async function removeItem(item: EventItem) {
  const { error } = await getClient().rpc('remove_event_item', { p_event_id: item.event_id, p_item_id: item.id, p_version: item.version }).single()
  if (error) throw error
}
export async function addCustomTreat(eventId: string, title: string, description: string) {
  const { data, error } = await getClient().rpc('add_custom_treat', { p_event_id: eventId, p_title: title, p_description: description }).single()
  if (error) throw error
  return data as Omit<EventItem, 'product'>
}
export const DIAPER_SIZES = ['P', 'M', 'G', 'XG'] as const
export type DiaperAmounts = Record<(typeof DIAPER_SIZES)[number], number>
export async function prepareList(eventId: string, diapers?: DiaperAmounts) {
  const { data, error } = await getClient().rpc('prepare_family_list', diapers ? { p_event_id: eventId, p_diapers: diapers } : { p_event_id: eventId })
  if (error) throw error
  return data as number
}
// Padrões sugeridos pelo servidor: a tela só os mostra como ponto de partida editável.
export async function listDefaults() {
  const { data, error } = await getClient().rpc('family_list_defaults')
  if (error) throw error
  return data as Partial<DiaperAmounts>
}
