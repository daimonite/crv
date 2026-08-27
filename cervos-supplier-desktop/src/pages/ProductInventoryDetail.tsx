import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchProduct, updateProduct } from '../lib/queries'
import { Product } from '../lib/types'
import { showToast } from '../components/ToastContainer'

interface StockHistory {
  id: string
  quantity_change: number
  reason: string
  created_at: string
}

export default function ProductInventoryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [stockHistory] = useState<StockHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [adjustment, setAdjustment] = useState({ quantity: 0, reason: '' })

  useEffect(() => {
    if (id) {
      loadProduct()
    }
  }, [id])

  const loadProduct = async () => {
    if (!id) return
    try {
      const data = await fetchProduct(id)
      setProduct(data)
    } catch (error) {
      console.error('Failed to load product:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdjustment = async (type: 'add' | 'remove') => {
    if (!id || !product || adjustment.quantity === 0) return

    const change = type === 'add' ? adjustment.quantity : -adjustment.quantity
    const newQuantity = Math.max(0, product.stock_quantity + change)
    const threshold = product.low_stock_threshold ?? 10
    const newStatus = newQuantity > threshold ? 'in_stock' : newQuantity > 0 ? 'low_stock' : 'out_of_stock'

    try {
      const updated = await updateProduct(id, {
        stock_quantity: newQuantity,
        stock_status: newStatus,
      })
      setProduct(updated)
      setAdjustment({ quantity: 0, reason: '' })
      showToast('success', 'Stock updated')
    } catch (error) {
      showToast('error', 'Failed to update stock')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-primary-400">Loading...</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Product not found</p>
        <button onClick={() => navigate('/catalog')} className="mt-4 text-accent hover:text-accent2">
          Back to Catalog
        </button>
      </div>
    )
  }

  const statusColors = {
    in_stock: 'bg-green-500/20 text-green-400',
    low_stock: 'bg-yellow-500/20 text-yellow-400',
    out_of_stock: 'bg-red-500/20 text-red-400',
    discontinued: 'bg-gray-500/20 text-gray-400',
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/catalog')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to Catalog
        </button>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[product.stock_status]}`}>
          {product.stock_status.replace('_', ' ')}
        </span>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <h2 className="text-xl font-semibold text-white mb-1">{product.name}</h2>
        <p className="text-gray-400 font-mono text-sm mb-6">SKU: {product.sku}</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-lg p-4 text-center">
            <p className="text-sm text-gray-400 mb-1">Current Stock</p>
            <p className="text-3xl font-bold text-white">{product.stock_quantity}</p>
          </div>
          <div className="bg-surface rounded-lg p-4 text-center">
            <p className="text-sm text-gray-400 mb-1">Min Order Qty</p>
            <p className="text-3xl font-bold text-white">{product.min_order_quantity}</p>
          </div>
          <div className="bg-surface rounded-lg p-4 text-center">
            <p className="text-sm text-gray-400 mb-1">Unit Price</p>
            <p className="text-3xl font-bold text-white">TZS ${product.price.toLocaleString()}</p>
          </div>
        </div>

        <div className="border-t border-surface-300 pt-6">
          <h3 className="font-medium text-white mb-4">Stock Adjustment</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Quantity</label>
              <input
                type="number"
                min="1"
                value={adjustment.quantity || ''}
                onChange={(e) => setAdjustment({ ...adjustment, quantity: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                placeholder="Enter quantity"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Reason</label>
              <select
                value={adjustment.reason}
                onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white focus:outline-none focus:border-accent"
              >
                <option value="">Select reason</option>
                <option value="restock">Restock</option>
                <option value="return">Return</option>
                <option value="adjustment">Inventory Adjustment</option>
                <option value="damaged">Damaged</option>
                <option value="sold">Manual Sale</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleAdjustment('add')}
              disabled={adjustment.quantity === 0}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Add Stock
            </button>
            <button
              onClick={() => handleAdjustment('remove')}
              disabled={adjustment.quantity === 0 || adjustment.quantity > product.stock_quantity}
              className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Remove Stock
            </button>
          </div>
        </div>
      </div>

      {stockHistory.length > 0 && (
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <h3 className="font-medium text-white mb-4">Stock History</h3>
          <div className="space-y-3">
            {stockHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-3 border-b border-surface-300 last:border-0">
                <div>
                  <p className="text-white">{entry.reason}</p>
                  <p className="text-sm text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`font-medium ${entry.quantity_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.quantity_change > 0 ? '+' : ''}{entry.quantity_change}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
