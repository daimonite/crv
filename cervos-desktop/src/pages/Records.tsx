import { useState, useEffect } from 'react'
import { queryDb } from '../lib/database'

interface ReceiptData {
  id: string
  sale_id: string
  receipt_number: string
  created_at: string
  total: number
  tax: number
  discount: number
  tender: number
  change_due: number
  payment_method: string | null
  operator_name: string | null
  items: { product_name: string; quantity: number; unit_price: number }[]
}

export default function Records() {
  const [receipts, setReceipts] = useState<ReceiptData[]>([])
  const [filteredReceipts, setFilteredReceipts] = useState<ReceiptData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null)

  useEffect(() => {
    loadReceipts()
  }, [])

  useEffect(() => {
    filterReceipts()
  }, [receipts, searchQuery, dateFilter])

  async function loadReceipts() {
    setIsLoading(true)
    const salesData = await queryDb(`
      SELECT s.*, r.receipt_number, r.id as receipt_id, o.name as operator_name
      FROM sales s
      LEFT JOIN receipts r ON r.sale_id = s.id
      LEFT JOIN operators o ON o.id = s.operator_id
      ORDER BY s.created_at DESC
    `)

    const receiptPromises = salesData.map(async (sale: any) => {
      const items = await queryDb(`
        SELECT si.quantity, si.unit_price, p.generic_name
        FROM sale_items si
        LEFT JOIN batches b ON b.id = si.batch_id
        LEFT JOIN products p ON p.id = b.product_id
        WHERE si.sale_id = ?
      `, [sale.id])

      return {
        id: sale.receipt_id,
        sale_id: sale.id,
        receipt_number: sale.receipt_number || 'N/A',
        created_at: sale.created_at,
        total: sale.total,
        tax: sale.tax,
        discount: sale.discount,
        tender: sale.tender,
        change_due: sale.change_due,
        payment_method: sale.payment_method,
        operator_name: sale.operator_name,
        items: items.map((item: any) => ({
          product_name: item.generic_name || 'Unknown Product',
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      }
    })

    const allReceipts = await Promise.all(receiptPromises)
    setReceipts(allReceipts)
    setIsLoading(false)
  }

  function filterReceipts() {
    let filtered = receipts

    if (searchQuery) {
      filtered = filtered.filter(r =>
        r.receipt_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.operator_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.items.some(item => item.product_name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    }

    if (dateFilter) {
      filtered = filtered.filter(r => r.created_at.startsWith(dateFilter))
    }

    setFilteredReceipts(filtered)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">
          progress_activity
        </span>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-black text-on-surface">
            Records
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {filteredReceipts.length} receipts
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by receipt number, operator, or product..."
            className="w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary"
        />
      </div>

      <div className="bg-surface-base border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-outline-variant/50">
            <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
              <th className="px-4 py-3">Receipt #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Operator</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-5xl">receipt_long</span>
                  <p className="mt-2 font-medium">No receipts found</p>
                </td>
              </tr>
            ) : (
              filteredReceipts.map((receipt) => (
                <tr key={receipt.id || receipt.sale_id} className="border-t border-outline-variant hover:bg-outline-variant/30">
                  <td className="px-4 py-3 font-mono text-sm">{receipt.receipt_number}</td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(receipt.created_at).toLocaleDateString()} {new Date(receipt.created_at).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 text-sm">{receipt.operator_name || 'Unknown'}</td>
                  <td className="px-4 py-3 text-sm">{receipt.items.length} items</td>
                  <td className="px-4 py-3 text-right font-semibold">TZS {receipt.total.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-outline-variant/50 rounded text-xs font-medium">
                      {receipt.payment_method?.replace('_', ' ').toUpperCase() || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedReceipt(receipt)}
                      className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined">visibility</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedReceipt && (
        <ReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  )
}

interface ReceiptModalProps {
  receipt: ReceiptData
  onClose: () => void
}

function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-base rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl font-bold text-on-surface">
            Receipt {receipt.receipt_number}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-outline-variant transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">Date</span>
            <span className="font-medium">{new Date(receipt.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">Operator</span>
            <span className="font-medium">{receipt.operator_name || 'Unknown'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">Payment Method</span>
            <span className="font-medium">{receipt.payment_method?.replace('_', ' ').toUpperCase() || 'N/A'}</span>
          </div>

          <div className="border-t border-outline-variant pt-4">
            <h3 className="font-semibold text-sm mb-2">Items</h3>
            <div className="space-y-2">
              {receipt.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-on-surface">{item.product_name} x{item.quantity}</span>
                  <span className="font-medium">TZS {(item.unit_price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-outline-variant pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span>TZS {(receipt.total - receipt.tax).toLocaleString()}</span>
            </div>
            {receipt.tax > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Tax</span>
                <span>TZS {receipt.tax.toLocaleString()}</span>
              </div>
            )}
            {receipt.discount > 0 && (
              <div className="flex items-center justify-between text-sm text-secondary">
                <span>Discount</span>
                <span>-TZS {receipt.discount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-bold text-lg pt-2 border-t border-outline-variant">
              <span>Total</span>
              <span>TZS {receipt.total.toLocaleString()}</span>
            </div>
            {receipt.tender > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">Tendered</span>
                  <span>TZS {receipt.tender.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">Change</span>
                  <span className="text-secondary font-semibold">TZS {receipt.change_due.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}