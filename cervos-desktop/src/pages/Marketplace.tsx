import { useState, useEffect } from 'react'
import { queryDb } from '../lib/database'
import { supabase } from '../lib/supabase'

interface MarketplaceProduct {
  id: string
  supplierId: string
  supplierName: string
  productName: string
  genericName: string
  category: string
  packSize: string
  unitPrice: number
  currency: string
  minOrderQty: number
  stockAvailable: number
  verified: boolean
}

interface CartItem {
  product: MarketplaceProduct
  quantity: number
}

const WEB_URL =
  (import.meta.env.VITE_WEB_URL as string | undefined) ||
  (import.meta.env.VITE_APP_URL as string | undefined) ||
  'https://cervos.online'

interface ConnectionRequest {
  id: string
  supplierId: string
  supplierName: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  decidedAt: string | null
}

export default function Marketplace() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showCart, setShowCart] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [walletMsisdn, setWalletMsisdn] = useState('')
  const [activeTab, setActiveTab] = useState<'browse' | 'connections'>('browse')
  const [connections, setConnections] = useState<ConnectionRequest[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [connectionsError, setConnectionsError] = useState<string | null>(null)

  useEffect(() => {
    loadProducts()
    loadWallet()
  }, [])

  useEffect(() => {
    if (activeTab === 'connections') loadConnections()
  }, [activeTab])

  async function loadConnections() {
    setConnectionsLoading(true)
    setConnectionsError(null)
    try {
      const branchRes = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
      const branchId = branchRes.length > 0 ? JSON.parse(branchRes[0].value) as string : null
      if (!branchId) {
        setConnectionsError('No branch linked. Please link your pharmacy branch in Settings.')
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setConnectionsError('Not signed in — sign in to view connection requests.')
        return
      }
      const res = await fetch(`${WEB_URL}/api/marketplace/connections?branchId=${encodeURIComponent(branchId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json() as { connections?: ConnectionRequest[]; error?: string }
      if (!res.ok) throw new Error(json.error || `Failed to load connections (${res.status})`)
      setConnections(json.connections ?? [])
    } catch (e) {
      setConnectionsError(e instanceof Error ? e.message : 'Failed to load connection requests')
    } finally {
      setConnectionsLoading(false)
    }
  }

  async function respondToConnection(connectionId: string, status: 'approved' | 'rejected') {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Not signed in. Please sign in again.')
        return
      }
      const res = await fetch(`${WEB_URL}/api/marketplace/connections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ connectionId, status }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`)
      loadConnections()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update connection request')
    }
  }


  async function loadWallet() {
    try {
      const res = await queryDb("SELECT value FROM app_settings WHERE key = 'payme_wallet_number'")
      if (res.length > 0) {
        const v = JSON.parse(res[0].value) as string
        if (v) setWalletMsisdn(v)
      }
    } catch { /* ignore */ }
  }

  async function loadProducts() {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Not signed in — sign in to browse supplier catalog.')
        setLoading(false)
        return
      }

      // Try web API first (works via Bearer token, bypasses RLS)
      const webRes = await fetch(`${WEB_URL}/api/marketplace/products`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (webRes.ok) {
        const json = await webRes.json() as { products: MarketplaceProduct[] }
        setProducts(json.products ?? [])
        setLoading(false)
        return
      }

      // Fallback: query Supabase directly
      const { data, error: sbError } = await supabase
        .from('supplier_catalog')
        .select('id, supplier_id, price, currency, min_order_qty, stock_qty, lead_time_days, pack_size, products(id, generic_name, brand_name, category), accounts!supplier_id(id, name, verified)')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(100)

      if (sbError) throw new Error(sbError.message)

      type Row = {
        id: string
        supplier_id: string
        price: number
        currency: string
        min_order_qty: number
        stock_qty: number
        lead_time_days: number
        pack_size: string | null
        products: { id: string; generic_name: string; brand_name: string | null; category: string | null }[] | null
        accounts: { id: string; name: string; verified: boolean }[] | null
      }

      const mapped: MarketplaceProduct[] = ((data ?? []) as unknown as Row[]).map((row) => ({
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.accounts?.[0]?.name ?? 'Supplier',
        productName: row.products?.[0]?.brand_name ?? row.products?.[0]?.generic_name ?? 'Unnamed product',
        genericName: row.products?.[0]?.generic_name ?? '',
        category: row.products?.[0]?.category ?? 'Other',
        packSize: row.pack_size ?? '',
        unitPrice: Number(row.price),
        currency: row.currency ?? 'TZS',
        minOrderQty: row.min_order_qty ?? 1,
        stockAvailable: row.stock_qty ?? 0,
        verified: row.accounts?.[0]?.verified ?? false,
      }))
      setProducts(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load marketplace')
    } finally {
      setLoading(false)
    }
  }

  const categories = [...new Set(products.map((p) => p.category))]

  const filteredProducts = products.filter((p) => {
    const matchesSearch = !searchQuery || p.productName.toLowerCase().includes(searchQuery.toLowerCase()) || p.supplierName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || p.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  function addToCart(product: MarketplaceProduct) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id)
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [...prev, { product, quantity: product.minOrderQty }]
    })
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity < 1) return
    setCart((prev) =>
      prev.map((c) => (c.product.id === productId ? { ...c, quantity } : c))
    )
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.product.id !== productId))
  }

  function getCartTotal(): number {
    return cart.reduce((sum, item) => sum + item.product.unitPrice * item.quantity, 0)
  }

  async function placeOrder() {
    if (cart.length === 0) return

    // Enforce single supplier per checkout (escrow is per-supplier)
    const sellerIds = [...new Set(cart.map((c) => c.product.supplierId))]
    if (sellerIds.length !== 1) {
      alert('All items in one order must be from the same supplier. Please checkout per supplier.')
      return
    }

    const branchRes = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    const branchId = branchRes.length > 0 ? JSON.parse(branchRes[0].value) as string : null
    if (!branchId) {
      alert('No branch linked. Please link your pharmacy branch in Settings.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      alert('Not signed in. Please sign in again.')
      return
    }

    const msisdn = walletMsisdn.trim()
    if (!msisdn) {
      const entered = window.prompt('Enter your Payme Africa wallet phone number (e.g. +2557...). It will be saved for next time:')
      if (!entered?.trim()) {
        alert('Order not placed — Payme wallet number is required for escrow payment.')
        return
      }
      setWalletMsisdn(entered.trim())
      await queryDb(
        `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ['payme_wallet_number', JSON.stringify(entered.trim())]
      )
    }

    setPlacing(true)
    try {
      const finalMsisdn = (msisdn || walletMsisdn).trim() || (await (async () => {
        const r = await queryDb("SELECT value FROM app_settings WHERE key = 'payme_wallet_number'")
        return r.length ? JSON.parse(r[0].value) as string : ''
      })())

      const res = await fetch(`${WEB_URL}/api/marketplace/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          buyerBranchId: branchId,
          items: cart.map((c) => ({ catalogId: c.product.id, quantity: c.quantity })),
          msisdn: finalMsisdn,
          idempotencyKey: `${branchId}-${Date.now()}`,
        }),
      })

      const json = await res.json() as { error?: string; orderId?: string; orderRef?: string; total?: number; payment?: { status: string; error?: string; message?: string; reference?: string } }

      if (!res.ok) {
        throw new Error(json.error || `Checkout failed (${res.status})`)
      }

      const paymentMsg = json.payment
        ? json.payment.status === 'completed'
          ? 'Payment completed.'
          : json.payment.status === 'pending'
            ? (json.payment.message ?? 'Payment initiated — check your phone for the mobile money prompt.')
            : json.payment.error
              ? `Payment failed: ${json.payment.error}`
              : ''
        : ''

      setCart([])
      setShowCart(false)
      alert(`Order ${json.orderRef ?? json.orderId} placed. Total TZS ${Number(json.total ?? getCartTotal()).toLocaleString()}. ${paymentMsg}`.trim())
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
        </div>
      </div>
    )
  }

  return (
      <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-black text-on-surface">Marketplace</h1>
          <p className="text-sm text-on-surface-variant mt-1">Browse products from suppliers — escrow payment via Payme Africa</p>
        </div>
        {activeTab === 'browse' && (
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:opacity-90"
          >
            <span className="material-symbols-outlined">shopping_cart</span>
            Cart ({cart.length})
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-outline-variant">
        <button
          onClick={() => setActiveTab('browse')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${activeTab === 'browse' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}
        >
          Browse
        </button>
        <button
          onClick={() => setActiveTab('connections')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${activeTab === 'connections' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}
        >
          Connection Requests
          {connections.filter((c) => c.status === 'pending').length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-600 text-white text-xs">
              {connections.filter((c) => c.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'connections' ? (
        <div>
          <p className="text-sm text-on-surface-variant mb-4">
            Suppliers must be approved here before this branch can place orders with them.
            Browsing their catalog in the Marketplace stays open either way.
          </p>
          {connectionsError && (
            <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-center justify-between">
              <span>{connectionsError}</span>
              <button onClick={loadConnections} className="ml-4 px-3 py-1 rounded bg-error text-white text-xs font-semibold">Retry</button>
            </div>
          )}
          {connectionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl">link_off</span>
              <p className="mt-2">No connection requests yet</p>
            </div>
          ) : (
            <div className="bg-surface-base border border-outline-variant rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-outline-variant/50">
                  <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => (
                    <tr key={c.id} className="border-t border-outline-variant">
                      <td className="px-4 py-3 font-medium text-sm">{c.supplierName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          c.status === 'approved' ? 'bg-green-600/20 text-green-700' :
                          c.status === 'rejected' ? 'bg-error/20 text-error' :
                          'bg-amber-600/20 text-amber-700'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{new Date(c.requestedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {c.status === 'pending' && (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => respondToConnection(c.id, 'approved')}
                              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => respondToConnection(c.id, 'rejected')}
                              className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-semibold hover:bg-error/10"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadProducts} className="ml-4 px-3 py-1 rounded bg-error text-white text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products or suppliers..."
            className="w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-base focus:outline-none focus:border-primary"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl">store</span>
          <p className="mt-2 font-medium">{products.length === 0 ? 'No supplier products available yet' : 'No products found'}</p>
          <p className="text-sm">Suppliers publish active listings from the web portal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-sm flex items-center gap-1">
                    {product.productName}
                    {product.verified && <span className="material-symbols-outlined text-xs text-primary" title="Verified supplier">verified</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant">{product.supplierName}</p>
                </div>
                <span className="material-symbols-outlined text-primary">medication</span>
              </div>
              <p className="text-xs text-on-surface-variant mb-2">{product.category}{product.packSize ? ` · ${product.packSize}` : ''}</p>
              <div className="flex items-center justify-between">
                <p className="font-headline text-lg font-black text-on-surface">TZS {product.unitPrice.toLocaleString()}</p>
                <button
                  onClick={() => addToCart(product)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Add
                </button>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">Min order: {product.minOrderQty} · Stock: {product.stockAvailable}</p>
            </div>
          ))}
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-base rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-headline text-xl font-bold text-on-surface">Cart</h2>
              <button onClick={() => setShowCart(false)} className="p-1 rounded hover:bg-outline-variant">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl">shopping_cart</span>
                <p className="mt-2">Your cart is empty</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-64 overflow-auto">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{item.product.productName}</p>
                        <p className="text-xs text-on-surface-variant">TZS {item.product.unitPrice.toLocaleString()} x {item.quantity}</p>
                        <p className="text-xs text-on-surface-variant">{item.product.supplierName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-6 h-6 rounded-full bg-outline-variant hover:bg-primary hover:text-white flex items-center justify-center text-sm">-</button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-6 h-6 rounded-full bg-outline-variant hover:bg-primary hover:text-white flex items-center justify-center text-sm">+</button>
                        <button onClick={() => removeFromCart(item.product.id)} className="p-1 text-error hover:bg-error/10 rounded">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-outline-variant mt-4 pt-4 space-y-3">
                  <div className="flex justify-between font-headline text-lg font-black">
                    <span>Total</span>
                    <span>TZS {getCartTotal().toLocaleString()}</span>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant">Payme wallet (charged on order)</label>
                    <input
                      value={walletMsisdn}
                      onChange={(e) => setWalletMsisdn(e.target.value)}
                      placeholder="+255..."
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    onClick={placeOrder}
                    disabled={placing}
                    className="w-full py-3 rounded-lg bg-primary text-white font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {placing ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : null}
                    {placing ? 'Placing order...' : 'Place Order & Pay'}
                  </button>
                  <p className="text-xs text-on-surface-variant text-center">Payment held in escrow via Payme Africa until delivery. Set PAYME keys in web .env.local first.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </>
      )}
      </div>
  )
}
