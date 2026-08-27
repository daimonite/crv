import { useState, useEffect } from 'react'
import { useAuth } from '../lib/hooks'
import { fetchOrders } from '../lib/queries'

interface PaymentRecord {
  id: string
  order_id: string
  order_number: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  created_at: string
}

export default function Payments() {
  const { supplier } = useAuth()
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (supplier) {
      fetchOrders(supplier.id)
        .then((orders) => {
          const paymentRecords: PaymentRecord[] = orders.map((order) => ({
            id: `pay-${order.id}`,
            order_id: order.id,
            order_number: order.order_number,
            amount: order.total,
            status: order.status === 'cancelled' ? 'failed' as const : 'completed' as const,
            created_at: order.updated_at,
          }))
          setPayments(paymentRecords)
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [supplier])

  const totalRevenue = payments.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0)
  const pendingPayments = payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Payments</h2>
        <p className="text-gray-400 mt-1">Manage your payment transactions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <p className="text-sm text-gray-400">Total Revenue</p>
          <p className="text-3xl font-bold text-green-400 mt-2">TZS {totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <p className="text-sm text-gray-400">Pending Payments</p>
          <p className="text-3xl font-bold text-yellow-400 mt-2">TZS {pendingPayments.toLocaleString()}</p>
        </div>
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <p className="text-sm text-gray-400">Total Transactions</p>
          <p className="text-3xl font-bold text-white mt-2">{payments.length}</p>
        </div>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 overflow-hidden">
        <div className="p-6 border-b border-surface-300">
          <h3 className="text-lg font-semibold text-white">Transaction History</h3>
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-pulse text-primary-400">Loading...</div>
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No payment records yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Order</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Amount</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-300">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-surface-200 transition-colors">
                  <td className="px-6 py-4 text-white font-mono text-sm">{payment.order_number}</td>
                  <td className="px-6 py-4 text-white font-medium">TZS ${payment.amount.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        payment.status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : payment.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
