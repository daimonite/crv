import { useState, useEffect } from 'react'
import { queryDb } from '../lib/database'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

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

  useEffect(() => {
    loadData()
  }, [dateFrom, dateTo])

  async function loadData() {
    setIsLoading(true)
    const [sales, batches, products] = await Promise.all([
      queryDb(`SELECT s.*, si.quantity, si.unit_price, p.generic_name FROM sales s
          LEFT JOIN sale_items si ON si.sale_id = s.id
          LEFT JOIN batches b ON b.id = si.batch_id
          LEFT JOIN products p ON p.id = b.product_id
          WHERE s.created_at >= ? AND s.created_at <= ?
          ORDER BY s.created_at DESC`,
        [`${dateFrom}T00:00:00`, `${dateTo}T23:59:59`]),
      queryDb('SELECT * FROM batches'),
      queryDb('SELECT * FROM products')
    ])

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
    const byPaymentMethod = Array.from(paymentMap.entries()).map(([name, value]) => ({ name: name.replace('_', ' ').toUpperCase(), value }))

    const dayMap = new Map<string, { revenue: number; sales: number }>()
    for (const s of sales) {
      const day = s.created_at?.slice(0, 10) || ''
      const existing = dayMap.get(day) || { revenue: 0, sales: 0 }
      existing.revenue += s.total || 0
      existing.sales += 1
      dayMap.set(day, existing)
    }
    const chartData = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, vals]) => ({
      label: day.slice(5),
      revenue: vals.revenue,
      sales: vals.sales
    }))

    const productRevenueMap = new Map<string, number>()
    const productQuantityMap = new Map<string, number>()
    for (const s of sales) {
      if (s.generic_name) {
        productRevenueMap.set(s.generic_name, (productRevenueMap.get(s.generic_name) || 0) + ((s.unit_price || 0) * (s.quantity || 0)))
        productQuantityMap.set(s.generic_name, (productQuantityMap.get(s.generic_name) || 0) + (s.quantity || 0))
      }
    }
    const topByRevenue = Array.from(productRevenueMap.entries()).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    const topByQuantity = Array.from(productQuantityMap.entries()).map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 10)

    const stockMap = new Map<string, number>()
    for (const b of batches) {
      stockMap.set(b.product_id, (stockMap.get(b.product_id) || 0) + (b.quantity || 0))
    }
    const totalStockValue = batches.reduce((sum: number, b: any) => sum + ((b.cost_price || 0) * (b.quantity || 0)), 0)
    const lowStockItems = Array.from(stockMap.entries()).filter(([_, qty]) => qty > 0 && qty <= 10).map(([pid, stock]) => {
      const prod = products.find((p: any) => p.id === pid)
      return { name: prod?.generic_name || 'Unknown', stock }
    }).slice(0, 10)
    const outOfStock = Array.from(stockMap.entries()).filter(([_, qty]) => qty <= 0).length

    const now = Date.now()
    const expiringList: { name: string; batchId: string; expiry: string; stock: number; daysLeft: number }[] = []
    let expired = 0, expiring7days = 0, expiring30days = 0, expiring90days = 0

    for (const b of batches) {
      if (!b.expiry_date) continue
      const expiryDate = new Date(b.expiry_date).getTime()
      const daysLeft = Math.ceil((expiryDate - now) / 86400000)
      const prod = products.find((p: any) => p.id === b.product_id)

      if (daysLeft < 0) expired++
      else if (daysLeft <= 7) { expiring7days++; expiringList.push({ name: prod?.generic_name || 'Unknown', batchId: b.id, expiry: b.expiry_date, stock: b.quantity || 0, daysLeft }) }
      else if (daysLeft <= 30) expiring30days++
      else if (daysLeft <= 90) expiring90days++
    }

    expiringList.sort((a, b) => a.daysLeft - b.daysLeft)

    setData({
      sales: { totalRevenue, totalSales, avgTransaction, totalTax, totalDiscount, byPaymentMethod, chartData },
      inventory: { totalProducts: products.length, totalBatches: batches.length, totalStockValue, lowStockItems, outOfStock },
      products: { topByRevenue, topByQuantity },
      expiry: { expired, expiring7days, expiring30days, expiring90days, expiringList }
    })
    setIsLoading(false)
  }

  function exportCSV() {
    if (!data) return
    const lines = [`Sales Report ${dateFrom} to ${dateTo}`, '']
    lines.push('=== SALES ===')
    lines.push(`Total Revenue,$TZS {data.sales.totalRevenue.toLocaleString()}`)
    lines.push(`Total Transactions,${data.sales.totalSales}`)
    lines.push(`Average Transaction,$TZS {data.sales.avgTransaction.toLocaleString()}`)
    lines.push(`Tax,$TZS {data.sales.totalTax.toLocaleString()}`)
    lines.push(`Discount,$TZS {data.sales.totalDiscount.toLocaleString()}`, '')
    lines.push('=== INVENTORY ===')
    lines.push(`Total Products,${data.inventory.totalProducts}`)
    lines.push(`Total Batches,${data.inventory.totalBatches}`)
    lines.push(`Stock Value,$TZS {data.inventory.totalStockValue.toLocaleString()}`)
    lines.push(`Out of Stock,${data.inventory.outOfStock}`, '')
    lines.push('=== EXPIRY ===')
    lines.push(`Expired,${data.expiry.expired}`)
    lines.push(`Expiring within 7 days,${data.expiry.expiring7days}`)
    lines.push(`Expiring within 30 days,${data.expiry.expiring30days}`)
    lines.push(`Expiring within 90 days,${data.expiry.expiring90days}`, '')
    lines.push('Date,Revenue,Transactions')
    data.sales.chartData.forEach(d => lines.push(`${d.label},TZS {d.revenue.toLocaleString()},${d.sales}`))

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `full-report-${dateFrom}-${dateTo}.csv`
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

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-headline text-2xl font-black text-on-surface">Reports</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-base text-sm" />
          <span className="text-gray-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant bg-surface-base text-sm" />
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:opacity-90">
            <span className="material-symbols-outlined">download</span>
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-outline-variant">
        {(['sales', 'inventory', 'products', 'expiry'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 font-semibold capitalize ${activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'sales' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total Revenue</p>
              <p className="font-headline text-2xl font-black text-primary mt-1">TZS {data.sales.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Transactions</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">{data.sales.totalSales}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Avg Transaction</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">TZS {data.sales.avgTransaction.toLocaleString()}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Tax Collected</p>
              <p className="font-headline text-2xl font-black text-on-surface mt-1">TZS {data.sales.totalTax.toLocaleString()}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Discounts Given</p>
              <p className="font-headline text-2xl font-black text-error mt-1">TZS {data.sales.totalDiscount.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
              <h3 className="font-headline font-bold text-on-surface mb-4">Revenue Over Time</h3>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.sales.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => [`TZS ${value.toLocaleString()}`, 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
              <h3 className="font-headline font-bold text-on-surface mb-4">Revenue by Payment Method</h3>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.sales.byPaymentMethod} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {data.sales.byPaymentMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
              <p className="font-headline text-2xl font-black text-secondary mt-1">TZS {data.inventory.totalStockValue.toLocaleString()}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Out of Stock</p>
              <p className="font-headline text-2xl font-black text-error mt-1">{data.inventory.outOfStock}</p>
            </div>
          </div>
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h3 className="font-headline font-bold text-on-surface mb-4">Low Stock Items (â‰¤10 units)</h3>
            {data.inventory.lowStockItems.length === 0 ? (
              <p className="text-on-surface-variant">No low stock items</p>
            ) : (
              <div className="space-y-2">
                {data.inventory.lowStockItems.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-surface-container rounded">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-error font-bold">{item.stock} units</span>
                  </div>
                ))}
              </div>
            )}
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
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expiring â‰¤7 Days</p>
              <p className="font-headline text-2xl font-black text-amber-500 mt-1">{data.expiry.expiring7days}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expiring â‰¤30 Days</p>
              <p className="font-headline text-2xl font-black text-amber-400 mt-1">{data.expiry.expiring30days}</p>
            </div>
            <div className="bg-surface-base border border-outline-variant rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Expiring â‰¤90 Days</p>
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
                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.daysLeft <= 3 ? 'bg-error-container text-error' : 'bg-amber-50 text-amber-700'}`}>
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
