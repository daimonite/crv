import { useState, useEffect } from 'react'
import { useAuth } from '../lib/hooks'
import { fetchProducts } from '../lib/queries'
import { Product } from '../lib/types'
import StockBadge from '../components/StockBadge'

export default function Storefront() {
  const { supplier } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (supplier) {
      fetchProducts(supplier.id)
        .then((data) => setProducts(data.filter((p) => p.is_active)))
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [supplier])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Your Storefront</h2>
        <p className="text-gray-400 mt-1">Public view of your product catalog</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-primary-400">Loading...</div>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-gray-600">storefront</span>
          <h3 className="text-xl font-semibold text-white mt-4">No products to display</h3>
          <p className="text-gray-400 mt-2">Add products to your catalog to see them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-surface-100 rounded-xl border border-surface-300 overflow-hidden hover:border-accent transition-colors"
            >
              <div className="aspect-square bg-surface-200 flex items-center justify-center">
                {product.images && product.images[0] ? (
                  <img src={product.images[0]} alt={product.generic_name || product.name} className="object-cover w-full h-full" />
                ) : (
                  <span className="material-symbols-outlined text-6xl text-gray-600">inventory_2</span>
                )}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-white">{product.generic_name || product.name}</h3>
                  <StockBadge status={product.stock_status} showLabel={false} />
                </div>
                <p className="text-sm text-gray-400 mb-4 line-clamp-2">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-white">TZS {product.price.toLocaleString()}</span>
                  <span className="text-sm text-gray-500">{product.stock_quantity} in stock</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Storefront URL</h3>
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={`https://cervos.market/s/${supplier?.company_name?.toLowerCase().replace(/\s+/g, '-')}`}
            readOnly
            className="flex-1 px-4 py-3 bg-surface border border-surface-300 rounded-lg text-gray-400 font-mono text-sm"
          />
          <button className="px-4 py-3 bg-accent hover:bg-accent2 text-white rounded-lg transition-colors">
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}
