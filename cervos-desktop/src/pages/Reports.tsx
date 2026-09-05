import { useState, useEffect } from 'react'
import { queryDb } from '../lib/database'
import { runSyncCycle } from '../lib/sync'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

export interface StockDetailItem {
  id: string
  productName: string
  brandName: string
  category: string
  batchNumber: string | null
  quantity: number
  costPrice: number
  salePrice: number
  totalCostValue: number
  totalSaleValue: number
  expiryDate: string | null
}

interface ReportData {
  sales: {
    totalRevenue: number
    totalSales: number
    avgTransaction: number
    totalTax: number
    totalDiscount: number
    byPaymentMethod: { name: string; value: number }[]
    chartData: { label: string; revenue: number; sales: number }[]
  }
  inventory: {
    totalProducts: number
    totalBatches: number
    totalStockValue: number
    lowStockItems: { name: string; stock: number }[]
    outOfStock: number
    stockDetails: StockDetailItem[]
  }
  products: {
    topByRevenue: { name: string; revenue: number }[]
    topByQuantity: { name: string; quantity: number }[]
  }
  expiry: {
    expired: number
    expiring7days: number
    expiring30days: number
    expiring90days: number
    expiringList: { name: string; batchId: string; expiry: string; stock: number; daysLeft: number }[]
  }
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']

export default function Reports() {
  const [data, setData] = useState<ReportData | null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'products' | 'expiry'>('sales')
  const [stockSearch, setStockSearch] = useState('')
  const [branchInfo, setBranchInfo] = useState<{ branchName: string; centreName: string; lastSyncedAt: string | null }>({
    branchName: '',
    centreName: '',
    lastSyncedAt: null,
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo])

  async function loadData() {
    setIsLoading(true)
    try {
      const [sales, batches, products, branchRes, centreRes, syncRes] = await Promise.all([
        queryDb(
          `SELECT s.*, si.quantity, si.unit_price, p.generic_name FROM sales s
           LEFT JOIN sale_items si ON si.sale_id = s.id
           LEFT JOIN batches b ON b.id = si.batch_id
           LEFT JOIN products p ON p.id = b.product_id
           WHERE s.created_at >= ? AND s.created_at <= ?
           ORDER BY s.created_at DESC`,
          [`${dateFrom}T00:00:00`, `${dateTo}T23:59:59`]
        ),
        queryDb('SELECT * FROM batches'),
        queryDb('SELECT * FROM products'),
        queryDb("SELECT value FROM app_settings WHERE key = 'branch_name'"),
        queryDb("SELECT value FROM app_settings WHERE key = 'centre_name'"),
        queryDb("SELECT value FROM app_settings WHERE key = 'last_synced_at'"),
      ])

      const bName = branchRes.length > 0 ? JSON.parse(branchRes[0].value) : 'This Branch'
      const cName = centreRes.length > 0 ? JSON.parse(centreRes[0].value) : 'Main Pharmacy'
      const sAt = syncRes.length > 0 ? JSON.parse(syncRes[0].value) : null
      setBranchInfo({ branchName: bName, centreName: cName, lastSyncedAt: sAt })

      const totalRevenue = sales.reduce((sum: number, s: any) => sum + (s.total || 0), 0)
      const totalSales = sales.length
      const avgTransaction = totalSales > 0 ? totalRevenue / totalSales : 0
      const totalTax = sales.reduce((sum: number, s: any) => sum + (s.tax || 0), 0)
      const totalDiscount = sales.reduce((sum: number, s: any) => sum + (s.discount || 0), 0)

      const paymentMap = new Map<string, number>()
      for (const s of sales) {
        const method = s.payment_method || 'unknown'
        paymentMap.set(method, (paymentMap.get(method) || 0) + (s.total || 0))
      }
      const byPaymentMethod = Array.from(paymentMap.entries()).map(([name, value]) => ({
        name: name.replace('_', ' ').toUpperCase(),
        value,
      }))

      const dayMap = new Map<string, { revenue: number; sales: number }>()
      for (const s of sales) {
        const day = s.created_at?.slice(0, 10) || ''
        const existing = dayMap.get(day) || { revenue: 0, sales: 0 }
        existing.revenue += s.total || 0
        existing.sales += 1
        dayMap.set(day, existing)
      }
      const chartData = Array.from(dayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, vals]) => ({
          label: day.slice(5),
          revenue: vals.revenue,
          sales: vals.sales,
        }))

      const productRevenueMap = new Map<string, number>()
      const productQuantityMap = new Map<string, number>()
      for (const s of sales) {
        if (s.generic_name) {
          productRevenueMap.set(
            s.generic_name,
            (productRevenueMap.get(s.generic_name) || 0) + (s.unit_price || 0) * (s.quantity || 0)
          )
          productQuantityMap.set(
            s.generic_name,
            (productQuantityMap.get(s.generic_name) || 0) + (s.quantity || 0)
          )
        }
      }
      const topByRevenue = Array.from(productRevenueMap.entries())
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
      const topByQuantity = Array.from(productQuantityMap.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)

      const stockMap = new Map<string, number>()
      for (const b of batches) {
        stockMap.set(b.product_id, (stockMap.get(b.product_id) || 0) + (b.quantity || 0))
      }
      const totalStockValue = batches.reduce(
        (sum: number, b: any) => sum + (b.cost_price || 0) * (b.quantity || 0),
        0
      )
      const lowStockItems = Array.from(stockMap.entries())
        .filter(([_, qty]) => qty > 0 && qty <= 10)
        .map(([pid, stock]) => {
          const prod = products.find((p: any) => p.id === pid)
          return { name: prod?.generic_name || 'Unknown', stock }
        })
        .slice(0, 10)
      const outOfStock = Array.from(stockMap.entries()).filter(([_, qty]) => qty <= 0).length

      // Comprehensive stock details list
      const stockDetails: StockDetailItem[] = batches.map((b: any) => {
        const prod = products.find((p: any) => p.id === b.product_id)
        const quantity = b.quantity || 0
        const costPrice = b.cost_price || 0
        const salePrice = b.sale_price || 0
        return {
          id: b.id,
          productName: prod?.generic_name || 'Unknown Product',
          brandName: prod?.brand_name || '',
          category: prod?.category || 'General',
          batchNumber: b.batch_number || b.id.slice(0, 8),
          quantity,
          costPrice,
          salePrice,
          totalCostValue: quantity * costPrice,
          totalSaleValue: quantity * salePrice,
          expiryDate: b.expiry_date || null,
        }
      })

      const now = Date.now()
      const expiringList: { name: string; batchId: string; expiry: string; stock: number; daysLeft: number }[] = []
      let expired = 0,
        expiring7days = 0,
        expiring30days = 0,
        expiring90days = 0

      for (const b of batches) {
        if (!b.expiry_date) continue
        const expiryDate = new Date(b.expiry_date).getTime()
        const daysLeft = Math.ceil((expiryDate - now) / 86400000)
        const prod = products.find((p: any) => p.id === b.product_id)

        if (daysLeft < 0) expired++
        else if (daysLeft <= 7) {
          expiring7days++
          expiringList.push({
            name: prod?.generic_name || 'Unknown',
            batchId: b.id,
            expiry: b.expiry_date,
            stock: b.quantity || 0,
            daysLeft,
          })
        } else if (daysLeft <= 30) expiring30days++
        else if (daysLeft <= 90) expiring90days++
      }

      expiringList.sort((a, b) => a.daysLeft - b.daysLeft)

      setData({
        sales: { totalRevenue, totalSales, avgTransaction, totalTax, totalDiscount, byPaymentMethod, chartData },
        inventory: {
          totalProducts: products.length,
          totalBatches: batches.length,
          totalStockValue,
          lowStockItems,
          outOfStock,
          stockDetails,
        },
        products: { topByRevenue, topByQuantity },
        expiry: { expired, expiring7days, expiring30days, expiring90days, expiringList },
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSync() {
    setIsSyncing(true)
    setSyncFeedback(null)
    try {
      const res = await runSyncCycle()
      if (res.ok) {
        setSyncFeedback('Successfully synced branch data to main pharmacy.')
      } else {
        setSyncFeedback(`Sync completed with status: ${res.message || 'Updated'}`)
      }
      await loadData()
    } catch (e: any) {
      setSyncFeedback(e?.message || 'Sync failed. Terminal is operating offline.')
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncFeedback(null), 5000)
    }
  }

  function exportCSV() {
    if (!data) return
    const lines = [`Branch Report: ${branchInfo.branchName} (${branchInfo.centreName})`, `Period: ${dateFrom} to ${dateTo}`, '']
    lines.push('=== SALES SUMMARY ===')
    lines.push(`Total Revenue,TZS ${data.sales.totalRevenue.toLocaleString()}`)
    lines.push(`Total Transactions,${data.sales.totalSales}`)
    lines.push(`Average Transaction,TZS ${data.sales.avgTransaction.toLocaleString()}`)
    lines.push(`Tax,TZS ${data.sales.totalTax.toLocaleString()}`)
    lines.push(`Discount,TZS ${data.sales.totalDiscount.toLocaleString()}`, '')
    lines.push('=== INVENTORY SUMMARY ===')
    lines.push(`Total Products,${data.inventory.totalProducts}`)
    lines.push(`Total Batches,${data.inventory.totalBatches}`)
    lines.push(`Stock Value,TZS ${data.inventory.totalStockValue.toLocaleString()}`)
    lines.push(`Out of Stock,${data.inventory.outOfStock}`, '')
    lines.push('=== STOCK DETAILS BREAKDOWN ===')
    lines.push('Product,Brand,Category,Batch Number,Quantity,Cost Price (TZS),Sale Price (TZS),Total Cost Value (TZS),Expiry')
    data.inventory.stockDetails.forEach((s) => {
      lines.push(
        `"${s.productName}","${s.brandName}","${s.category}","${s.batchNumber || ''}",${s.quantity},${s.costPrice},${s.salePrice},${s.totalCostValue},"${s.expiryDate || 'N/A'}"`
      )
    })
    lines.push('', '=== EXPIRY ===')
    lines.push(`Expired,${data.expiry.expired}`)
    lines.push(`Expiring within 7 days,${data.expiry.expiring7days}`)
    lines.push(`Expiring within 30 days,${data.expiry.expiring30days}`)
    lines.push(`Expiring within 90 days,${data.expiry.expiring90days}`, '')
    lines.push('Date,Revenue (TZS),Transactions')
    data.sales.chartData.forEach((d) => lines.push(`${d.label},TZS ${d.revenue.toLocaleString()},${d.sales}`))

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `branch-report-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    )
  }

  const filteredStock = data.inventory.stockDetails.filter((s) => {
    if (!stockSearch.trim()) return true
    const q = stockSearch.toLowerCase()
    return (
      s.productName.toLowerCase().includes(q) ||
      s.brandName.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.batchNumber && s.batchNumber.toLowerCase().includes(q))
    )
  })

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Branch & Main Pharmacy Connection Banner */}
      <div className="bg-surface-base border border-outline-variant rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined">hub</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-on-surface text-base">{branchInfo.branchName || 'Current Branch'}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-semibold">
                Connected
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              Main Pharmacy: <span className="font-medium text-on-surface">{branchInfo.centreName || 'Pharmacy Network'}</span>
              {branchInfo.lastSyncedAt ? (
                <> • Last synced: {new Date(branchInfo.lastSyncedAt).toLocaleString()}</>
              ) : (
                <> • Never synced</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncFeedback && (
            <span className="text-xs font-medium text-secondary animate-fadeIn">{syncFeedback}</span>
          )}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-primary/40 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
            {isSyncing ? 'Syncing to Pharmacy...' : 'Sync to Pharmacy'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-headline text-2xl font-black text-on-surface">Reports & Analytics</h1>
          <p className="text-sm text-on-surface-variant">Live branch records connected to the pharmacy portal</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-base text-sm"
          />
          <span className="text-on-surface-variant text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-base text-sm"
          />
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:opacity-90"
          >
            <span className="material-symbols-outlined">download</span>
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-outline-variant">
        {(['sales', 'inventory', 'products', 'expiry'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-semibold capitalize transition-colors ${
              activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'sales' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total Revenue</p>
              <p className="font-headline text-2xl font-black text-primary mt-1">
                TZS {data.sales.totalRevenue.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Transactions</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{data.sales.totalSales}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Avg Transaction</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">
                TZS {data.sales.avgTransaction.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total Tax</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">
                TZS {data.sales.totalTax.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Discounts Given</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">
                TZS {data.sales.totalDiscount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-surface-base border border-outline-variant rounded-xl p-5">
              <h3 className="font-headline font-bold text-on-surface mb-4">Revenue Trend</h3>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.sales.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [`TZS ${value.toLocaleString()}`, 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
              <h3 className="font-headline font-bold text-on-surface mb-4">Payment Methods</h3>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.sales.byPaymentMethod}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {data.sales.byPaymentMethod.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`TZS ${value.toLocaleString()}`, 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'inventory' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total Products</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{data.inventory.totalProducts}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total Batches</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{data.inventory.totalBatches}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Stock Value</p>
              <p className="font-headline text-2xl font-black text-secondary mt-1">
                TZS {data.inventory.totalStockValue.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Out of Stock</p>
              <p className="font-headline text-2xl font-black text-error mt-1">{data.inventory.outOfStock}</p>
            </div>
          </div>

          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h3 className="font-headline font-bold text-on-surface mb-3">Low Stock Alerts (≤ 10 units)</h3>
            {data.inventory.lowStockItems.length === 0 ? (
              <p className="text-sm text-on-surface-variant">All items are sufficiently stocked.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.inventory.lowStockItems.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-surface-container rounded-lg">
                    <span className="font-medium text-sm text-on-surface">{item.name}</span>
                    <span className="text-error text-sm font-bold">{item.stock} units left</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full Stock Details Table */}
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="font-headline font-bold text-on-surface">Branch Stock Details</h3>
                <p className="text-xs text-on-surface-variant">Synchronized batch records for this branch</p>
              </div>
              <input
                type="text"
                placeholder="Search stock by product, brand, batch..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm w-72"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-outline-variant/30 text-xs uppercase font-semibold text-on-surface-variant">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Batch #</th>
                    <th className="p-3 text-right">In Stock</th>
                    <th className="p-3 text-right">Cost (TZS)</th>
                    <th className="p-3 text-right">Sale (TZS)</th>
                    <th className="p-3 text-right">Total Value</th>
                    <th className="p-3">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-on-surface-variant">
                        No matching stock records found.
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((s) => (
                      <tr key={s.id} className="hover:bg-outline-variant/10 transition-colors">
                        <td className="p-3">
                          <p className="font-semibold text-on-surface">{s.productName}</p>
                          {s.brandName && <p className="text-xs text-on-surface-variant">{s.brandName}</p>}
                        </td>
                        <td className="p-3 text-xs text-on-surface-variant">{s.category}</td>
                        <td className="p-3 font-mono text-xs">{s.batchNumber || '—'}</td>
                        <td className="p-3 text-right">
                          <span
                            className={`font-bold ${
                              s.quantity <= 0 ? 'text-error' : s.quantity <= 10 ? 'text-amber-500' : 'text-on-surface'
                            }`}
                          >
                            {s.quantity}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-xs">TZS {s.costPrice.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-xs">TZS {s.salePrice.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-xs font-semibold text-primary">
                          TZS {s.totalCostValue.toLocaleString()}
                        </td>
                        <td className="p-3 text-xs">
                          {s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h3 className="font-headline font-bold text-on-surface mb-4">Top Products by Revenue</h3>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.products.topByRevenue.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(value: number) => [`TZS ${value.toLocaleString()}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h3 className="font-headline font-bold text-on-surface mb-4">Top Products by Quantity Sold</h3>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.products.topByQuantity.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(value: number) => [value, 'Units Sold']} />
                  <Bar dataKey="quantity" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expiry' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expired</p>
              <p className="font-headline text-2xl font-black text-error mt-1">{data.expiry.expired}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expiring ≤ 7 Days</p>
              <p className="font-headline text-2xl font-black text-amber-500 mt-1">{data.expiry.expiring7days}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expiring ≤ 30 Days</p>
              <p className="font-headline text-2xl font-black text-amber-400 mt-1">{data.expiry.expiring30days}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expiring ≤ 90 Days</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{data.expiry.expiring90days}</p>
            </div>
          </div>
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h3 className="font-headline font-bold text-on-surface mb-4">Expiring Soon (Next 7 Days)</h3>
            {data.expiry.expiringList.length === 0 ? (
              <p className="text-on-surface-variant">No batches expiring soon</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase text-on-surface-variant">
                    <th className="pb-2">Product</th>
                    <th className="pb-2">Batch</th>
                    <th className="pb-2">Expiry</th>
                    <th className="pb-2 text-right">Stock</th>
                    <th className="pb-2 text-right">Days Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {data.expiry.expiringList.map((item) => (
                    <tr key={item.batchId}>
                      <td className="py-2 font-medium">{item.name}</td>
                      <td className="py-2 text-sm text-on-surface-variant font-mono">{item.batchId.slice(0, 8)}...</td>
                      <td className="py-2 text-sm">{new Date(item.expiry).toLocaleDateString()}</td>
                      <td className="py-2 text-right font-semibold">{item.stock}</td>
                      <td className="py-2 text-right">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            item.daysLeft <= 3 ? 'bg-error-container text-error' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {item.daysLeft} days
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
