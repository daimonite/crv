import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/hooks'
import { fetchOrders } from '../lib/queries'
import { Order } from '../lib/types'
import { formatDistanceToNow } from 'date-fns'

export default function Logistics() {
  const { supplier } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (supplier) {
      loadOrders()
    }
  }, [supplier])

  const loadOrders = async () => {
    if (!supplier) return
    try {
      const data = await fetchOrders(supplier.id)
      setOrders(data)
    } catch (error) {
      console.error('Failed to load shipments:', error)
    } finally {
      setLoading(false)
    }
  }

  const pending = orders.filter((o) => ['pending', 'confirmed', 'processing'].includes(o.status)).length
  const inTransit = orders.filter((o) => o.status === 'shipped').length
  const delivered = orders.filter((o) => o.status === 'delivered').length

  const activeShipments = orders.filter((o) => ['pending', 'confirmed', 'processing', 'shipped'].includes(o.status))

  const statusConfig: Record<string, { label: string; badge: string }> = {
    pending: { label: 'Pending', badge: 'bg-yellow-500/20 text-yellow-400' },
    confirmed: { label: 'Confirmed', badge: 'bg-blue-500/20 text-blue-400' },
    processing: { label: 'Processing', badge: 'bg-purple-500/20 text-purple-400' },
    shipped: { label: 'In Transit', badge: 'bg-indigo-500/20 text-indigo-400' },
    delivered: { label: 'Delivered', badge: 'bg-green-500/20 text-green-400' },
    cancelled: { label: 'Cancelled', badge: 'bg-red-500/20 text-red-400' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-primary-400">Loading shipments...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Logistics</h2>
        <p className="text-gray-400 mt-1">Track your shipments and deliveries</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <span className="material-symbols-outlined text-yellow-400">schedule</span>
            </div>
            <p className="text-gray-400">Pending</p>
          </div>
          <p className="text-3xl font-bold text-white">{pending}</p>
        </div>
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <span className="material-symbols-outlined text-blue-400">local_shipping</span>
            </div>
            <p className="text-gray-400">In Transit</p>
          </div>
          <p className="text-3xl font-bold text-white">{inTransit}</p>
        </div>
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <span className="material-symbols-outlined text-green-400">check_circle</span>
            </div>
            <p className="text-gray-400">Delivered</p>
          </div>
          <p className="text-3xl font-bold text-white">{delivered}</p>
        </div>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Active Shipments</h3>
        {activeShipments.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-6xl text-gray-600">local_shipping</span>
            <h3 className="text-xl font-semibold text-white mt-4">No active shipments</h3>
            <p className="text-gray-400 mt-2">Shipment tracking will appear here when orders are shipped</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeShipments.map((order) => {
              const cfg = statusConfig[order.status] || statusConfig.pending
              return (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="block p-4 bg-surface rounded-lg border border-surface-300 hover:border-accent transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-white">{order.order_number || order.id}</p>
                      <p className="text-sm text-gray-400">{order.buyer_name || 'Pharmacy buyer'}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">
                      {order.tracking_number ? `Tracking: ${order.tracking_number}` : formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                    </span>
                    <span className="text-white font-medium">
                      TZS {Number(order.total || 0).toLocaleString()}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
