import { useState, useEffect, useCallback } from 'react'
import { queryDb } from '../lib/database'
import { supabase } from '../lib/supabase'
import { runSyncCycle } from '../lib/sync'

const WEB_URL =
  (import.meta.env.VITE_WEB_URL as string | undefined) ||
  (import.meta.env.VITE_APP_URL as string | undefined) ||
  'https://cervos.online'

interface LocalOrder {
  id: string
  order_reference: string
  supplier_name: string
  currency: string
  // The live backend keeps status = 'pending' until payment succeeds — it
  // never actually sets 'approved'. Whether the supplier has approved is
  // tracked separately via supplier_approved_at. 'approved' is kept in this
  // union only because the DB's CHECK constraint still permits it (in case
  // anything ever does set it), not because the real flow produces it.
  status: 'pending' | 'approved' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  note: string | null
  placed_at: string | null
  supplier_approved_at: string | null
  confirmed_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  updated_at: string | null
}

interface LineItem {
  id: string
  order_id: string
  product_name: string
  quantity: number
  unit_price: number
}

const STATUS_STYLES: Record<LocalOrder['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-violet-100 text-violet-700',
  confirmed: 'bg-blue-100 text-blue-700',
  shipped: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<LocalOrder['status'], string> = {
  pending: 'Awaiting supplier approval',
  approved: 'Approved — ready to pay',
  confirmed: 'Paid — awaiting shipment',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/**
 * The real backend keeps status = 'pending' both before AND after supplier
 * approval — it only ever flips to 'confirmed' once payment succeeds.
 * Whether the supplier has approved is tracked separately via
 * supplier_approved_at. This derives the badge/label/pay-eligibility that
 * actually matches that behavior, instead of relying on a raw 'approved'
 * status value the backend doesn't produce.
 */
function effectiveStatus(order: LocalOrder): LocalOrder['status'] {
  if (order.status === 'pending' && order.supplier_approved_at) return 'approved'
  return order.status
}

export default function Orders() {
  const [orders, setOrders] = useState<LocalOrder[]>([])
  const [lineItems, setLineItems] = useState<Record<string, LineItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [payWallet, setPayWallet] = useState('')
  const [payBusy, setPayBusy] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  const loadLocal = useCallback(async () => {
    setLoading(true)
    try {
      const rows = (await queryDb(
        'SELECT * FROM orders ORDER BY placed_at DESC'
      )) as LocalOrder[]
      setOrders(rows)

      const itemRows = (await queryDb(
        'SELECT * FROM order_line_items'
      )) as LineItem[]
      const grouped: Record<string, LineItem[]> = {}
      for (const li of itemRows) {
        ;(grouped[li.order_id] ??= []).push(li)
      }
      setLineItems(grouped)

      const savedWallet = await queryDb("SELECT value FROM app_settings WHERE key = 'payme_wallet_number'")
      if (savedWallet.length) setPayWallet(JSON.parse(savedWallet[0].value))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLocal()
  }, [loadLocal])

  async function refresh() {
    setSyncing(true)
    try {
      await runSyncCycle()
      await loadLocal()
    } finally {
      setSyncing(false)
    }
  }

  function orderTotal(orderId: string): number {
    return (lineItems[orderId] ?? []).reduce((sum, li) => sum + li.quantity * li.unit_price, 0)
  }

  async function payOrder(order: LocalOrder) {
    setPayError(null)
    const wallet = payWallet.trim()
    if (!wallet) {
      setPayError('Enter a Payme Africa wallet number to pay with.')
      return
    }
    setPayBusy(order.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in — sign in again.')

      await queryDb(
        `INSERT INTO app_settings (key, value) VALUES ('payme_wallet_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(wallet)]
      )

      const res = await fetch(`${WEB_URL}/api/marketplace/pay-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderId: order.id, msisdn: wallet }),
      })
      const json = (await res.json()) as { error?: string; payment?: { status: string; message?: string } }
      if (!res.ok) throw new Error(json.error || `Payment failed (${res.status})`)

      alert(json.payment?.message || 'Payment initiated — check your phone for the mobile money prompt.')
      await refresh()
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setPayBusy(null)
    }
  }

  return (
    <div className="flex-1 p-8 flex flex-col gap-6 max-w-[1000px] mx-auto w-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Orders</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Marketplace orders placed by this branch, synced from the pharmacy portal.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant text-sm font-medium hover:bg-outline-variant/30 disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px] ${syncing ? 'animate-spin' : ''}`}>sync</span>
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {payError && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{payError}</div>}

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-2">receipt_long</span>
          <p>No orders yet. Place one from Marketplace.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const total = orderTotal(order.id)
            const isExpanded = expanded === order.id
            return (
              <div key={order.id} className="border border-outline-variant rounded-xl overflow-hidden bg-surface-base">
                <button
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : order.id)}
                >
                  <div>
                    <p className="font-semibold text-on-surface">{order.order_reference}</p>
                    <p className="text-sm text-on-surface-variant">{order.supplier_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-on-surface">
                      {order.currency} {total.toLocaleString()}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[effectiveStatus(order)]}`}>
                      {STATUS_LABEL[effectiveStatus(order)]}
                    </span>
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-outline-variant p-4 flex flex-col gap-3">
                    <ul className="text-sm divide-y divide-outline-variant/50">
                      {(lineItems[order.id] ?? []).map((li) => (
                        <li key={li.id} className="flex justify-between py-1.5">
                          <span>{li.product_name} × {li.quantity}</span>
                          <span>{order.currency} {(li.quantity * li.unit_price).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>

                    {order.status === 'pending' && !order.supplier_approved_at && (
                      <p className="text-sm text-on-surface-variant">
                        Waiting for {order.supplier_name} to approve this order before it can be paid.
                      </p>
                    )}

                    {effectiveStatus(order) === 'approved' && (
                      <div className="flex gap-2 pt-2">
                        <input
                          value={payWallet}
                          onChange={(e) => setPayWallet(e.target.value)}
                          placeholder="0712 345 678 or +255712345678"
                          className="flex-1 px-3 py-2 border border-outline-variant rounded-lg text-sm"
                        />
                        <button
                          onClick={() => payOrder(order)}
                          disabled={payBusy === order.id}
                          className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">smartphone</span>
                          {payBusy === order.id ? 'Paying…' : 'Pay via mobile money'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
