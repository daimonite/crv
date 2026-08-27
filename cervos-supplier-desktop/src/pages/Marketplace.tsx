import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/hooks'

interface MarketplaceProduct {
  id: string
  supplierId: string
  supplierName: string
  productName: string
  category: string
  unitPrice: number
  verified: boolean
}

const WEB_URL =
  (import.meta.env.VITE_WEB_URL as string | undefined) ||
  (import.meta.env.VITE_APP_URL as string | undefined) ||
  'https://cervos.online'

export default function Marketplace() {
  const { supplier } = useAuth()
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Not signed in — sign in to browse marketplace.')
        setLoading(false)
        return
      }

      const webRes = await fetch(`${WEB_URL}/api/marketplace/products`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (webRes.ok) {
        const json = await webRes.json() as { products: { id: string; supplierId: string; supplierName: string; productName: string; category: string; unitPrice: number; verified: boolean }[] }
        // Exclude own listings for supplier view
        const filtered = (json.products ?? []).filter((p) => p.supplierId !== supplier?.id)
        setProducts(filtered.map((p) => ({
          id: p.id,
          supplierId: p.supplierId,
          supplierName: p.supplierName,
          productName: p.productName,
          category: p.category,
          unitPrice: p.unitPrice,
          verified: p.verified,
        })))
        setLoading(false)
        return
      }

      // Fallback direct query
      const { data, error: sbError } = await supabase
        .from('supplier_catalog')
        .select('id, supplier_id, price, products(brand_name, generic_name, category), accounts!supplier_id(name, verified)')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(100)

      if (sbError) throw new Error(sbError.message)

      type Row = {
        id: string
        supplier_id: string
        price: number
        products: { brand_name: string | null; generic_name: string; category: string | null }[] | null
        accounts: { name: string; verified: boolean }[] | null
      }
      const mapped: MarketplaceProduct[] = ((data ?? []) as unknown as Row[])
        .filter((r) => r.supplier_id !== supplier?.id)
        .map((row) => ({
          id: row.id,
          supplierId: row.supplier_id,
          supplierName: row.accounts?.[0]?.name ?? 'Supplier',
          productName: row.products?.[0]?.brand_name ?? row.products?.[0]?.generic_name ?? 'Product',
          category: row.products?.[0]?.category ?? 'Other',
          unitPrice: Number(row.price),
          verified: row.accounts?.[0]?.verified ?? false,
        }))
      setProducts(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load marketplace')
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = products.filter(
    (p) =>
      p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Marketplace</h2>
        <p className="text-gray-400 mt-1">Discover products from other suppliers — live catalog via Cervos web</p>
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search marketplace..."
          className="w-full pl-10 pr-4 py-3 bg-surface-100 border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-500">
          search
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadProducts} className="ml-4 px-3 py-1 rounded bg-red-500 text-white text-xs font-semibold">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-primary-400">Loading...</div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <span className="material-symbols-outlined text-5xl text-gray-600">store</span>
          <p className="mt-2 font-medium">{products.length === 0 ? 'No marketplace listings yet' : 'No products match your search'}</p>
          <p className="text-sm">Active supplier listings appear here once suppliers publish from the web portal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-surface-100 rounded-xl border border-surface-300 p-6 hover:border-accent transition-colors"
            >
              <div className="w-12 h-12 bg-surface-300 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-gray-400">inventory_2</span>
              </div>
              <h3 className="font-semibold text-white flex items-center gap-1">
                {product.productName}
                {product.verified && <span className="material-symbols-outlined text-xs text-primary">verified</span>}
              </h3>
              <p className="text-sm text-gray-400 mt-1">{product.supplierName}</p>
              <div className="flex items-center justify-between mt-4">
                <span className="text-accent font-medium">TZS {product.unitPrice.toLocaleString()}</span>
                <span className="text-xs text-gray-500 bg-surface px-2 py-1 rounded">{product.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
