import { supabase } from './supabase'
import { Product, Order, Quote, Notification, AnalyticsData, Supplier, RemoteCommand } from './types'
import { useSubscriptionStore } from './store'

const STORAGE_KEY = 'cervos-subscription-storage'

function getStoredSubscription() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.state || null
    }
  } catch (e) {
    console.error('Failed to read subscription from storage:', e)
  }
  return null
}

export async function syncSubscriptionStatus(supplierId: string): Promise<{
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'past_due'
  subscriptionTier: 'free' | 'starter' | 'professional' | 'enterprise'
  graceEndsAt: string | null
  trialEndsAt: string | null
} | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('subscription_status, subscription_tier, grace_ends_at, trial_ends_at')
    .eq('id', supplierId)
    .single()

  if (error || !data) {
    return null
  }

  const subscriptionData = {
    subscriptionStatus: data.subscription_status as 'active' | 'inactive' | 'trial' | 'past_due',
    subscriptionTier: data.subscription_tier as 'free' | 'starter' | 'professional' | 'enterprise',
    graceEndsAt: data.grace_ends_at,
    trialEndsAt: data.trial_ends_at,
  }

  useSubscriptionStore.getState().setSubscription(subscriptionData)
  return subscriptionData
}

export function checkSubscriptionValidity(): {
  isValid: boolean
  status: 'active' | 'inactive' | 'trial' | 'past_due' | null
  tier: 'free' | 'starter' | 'professional' | 'enterprise' | null
  graceEndsAt: string | null
  trialEndsAt: string | null
  daysRemaining: number | null
} {
  const stored = getStoredSubscription()
  if (!stored) {
    return {
      isValid: false,
      status: null,
      tier: null,
      graceEndsAt: null,
      trialEndsAt: null,
      daysRemaining: null,
    }
  }

  const { subscriptionStatus, subscriptionTier, graceEndsAt, trialEndsAt } = stored
  let daysRemaining: number | null = null

  if (subscriptionStatus === 'trial' && trialEndsAt) {
    const trialEnd = new Date(trialEndsAt)
    const now = new Date()
    daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  } else if (subscriptionStatus === 'past_due' && graceEndsAt) {
    const graceEnd = new Date(graceEndsAt)
    const now = new Date()
    daysRemaining = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  const isValid = subscriptionStatus === 'active' || subscriptionStatus === 'trial'

  return {
    isValid,
    status: subscriptionStatus,
    tier: subscriptionTier,
    graceEndsAt,
    trialEndsAt,
    daysRemaining,
  }
}

export async function fetchPendingCommands(supplierId: string): Promise<RemoteCommand[]> {
  const { data, error } = await supabase
    .from('remote_commands')
    .select('*')
    .eq('supplier_id', supplierId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function acknowledgeCommand(commandId: string): Promise<void> {
  const { data: cmd, error: fetchError } = await supabase
    .from('remote_commands')
    .select('*')
    .eq('id', commandId)
    .single()

  if (fetchError) throw fetchError

  if (cmd && cmd.type === 'product_update' && cmd.payload?.product_id) {
    const updates: Record<string, unknown> = {}
    if (cmd.payload.name) updates.name = cmd.payload.name
    if (cmd.payload.generic_name) updates.generic_name = cmd.payload.generic_name
    if (cmd.payload.brand_name !== undefined) updates.brand_name = cmd.payload.brand_name
    if (cmd.payload.price !== undefined) updates.price = cmd.payload.price
    if (cmd.payload.stock_quantity !== undefined) updates.stock_quantity = cmd.payload.stock_quantity
    if (cmd.payload.description) updates.description = cmd.payload.description
    if (cmd.payload.formulation) updates.formulation = cmd.payload.formulation
    if (cmd.payload.barcode !== undefined) updates.barcode = cmd.payload.barcode
    if (cmd.payload.requires_prescription !== undefined) updates.requires_prescription = cmd.payload.requires_prescription
    if (cmd.payload.low_stock_threshold !== undefined) updates.low_stock_threshold = cmd.payload.low_stock_threshold
    if (cmd.payload.notify_threshold !== undefined) updates.notify_threshold = cmd.payload.notify_threshold
    if (Object.keys(updates).length > 0) {
      await supabase.from('products').update(updates).eq('id', cmd.payload.product_id)
    }
  }

  const { error } = await supabase
    .from('remote_commands')
    .update({ status: 'acknowledged' })
    .eq('id', commandId)

  if (error) throw error
}

export function createPollingInterval(_supplierId: string, callback: () => void, intervalMs = 30000): () => void {
  const id = setInterval(callback, intervalMs)
  return () => clearInterval(id)
}

export async function fetchProducts(supplierId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function fetchProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function createProduct(product: Partial<Product>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function fetchOrders(supplierId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function fetchOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function fetchQuotes(supplierId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function fetchQuote(id: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data || []
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)

  if (error) throw error
}

export async function fetchSupplierProfile(supplierId: string): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .single()

  if (error) return null
  return data
}

export async function updateSupplierProfile(supplierId: string, updates: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', supplierId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function fetchAnalytics(supplierId: string): Promise<AnalyticsData> {
  const [orders, quotes] = await Promise.all([
    fetchOrders(supplierId),
    fetchQuotes(supplierId),
  ])

  const totalQuotes = quotes.length
  const totalOrders = orders.length
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0)
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const quotesByStatus = quotes.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const ordersByStatus = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const revenueByMonth = [] as { month: string; revenue: number }[]
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthKey = date.toISOString().slice(0, 7)
    const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const monthRevenue = orders
      .filter(o => o.created_at.startsWith(monthKey) && o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0)
    revenueByMonth.push({ month: monthName, revenue: monthRevenue })
  }

  return {
    totalQuotes,
    totalOrders,
    totalRevenue,
    averageOrderValue,
    quotesByStatus,
    ordersByStatus,
    revenueByMonth,
    topProducts: [],
  }
}

export async function searchProducts(supplierId: string, query: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('supplier_id', supplierId)
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,description.ilike.%${query}%`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
