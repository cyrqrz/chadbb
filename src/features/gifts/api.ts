import { getClient } from '../events/api'
import type { EventItem, Product } from './model'
import { searchPattern } from './model'

export const giftKeys = { items: (eventId: string) => ['event-items', eventId] as const, catalog: ['catalog'] as const }
export const PAGE_SIZE = 12
const fields = 'id,title,description,platform,active'
export async function listProducts(search: string, page: number) {
  let query = getClient().from('products').select(fields, { count: 'exact' }).eq('active', true)
  if (search.trim()) query = query.ilike('title', searchPattern(search))
  const { data, error, count } = await query.order('title').order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw error
  return { products: data as Product[], count: count ?? 0 }
}
export async function listItems(eventId: string, page: number) {
  const { data, error, count } = await getClient().from('event_items')
    .select(`id,event_id,product_id,quantity_requested,version,product:products(${fields})`, { count: 'exact' })
    .eq('event_id', eventId).order('created_at').order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw error
  return { items: data as unknown as EventItem[], count: count ?? 0 }
}
export async function addItem(eventId: string, productId: string, quantity: number) {
  const { data, error } = await getClient().rpc('add_event_item', { p_event_id: eventId, p_product_id: productId, p_quantity: quantity }).single()
  if (error) throw error
  return data as Omit<EventItem, 'product'>
}
export async function setQuantity(item: EventItem, quantity: number) {
  const { data, error } = await getClient().rpc('set_event_item_quantity', {
    p_event_id: item.event_id, p_item_id: item.id, p_version: item.version, p_quantity: quantity,
  }).single()
  if (error) throw error
  return data as Omit<EventItem, 'product'>
}
