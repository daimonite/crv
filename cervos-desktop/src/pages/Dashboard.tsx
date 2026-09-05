import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { queryDb } from '../lib/database'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DashboardData {
  currency: string
  todayRevenue: number
  todaySales: number
  pendingSync: number
  lowStock: number
  expiringSoon: number
  chartData: { label: string; value: number }[]
}

const LOW_STOCK_THRESHOLD = 10
const EXPIRY_DAYS_THRESHOLD = 30

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({
    currency: 'TZS',
    todayRevenue: 0,
    todaySales: 0,
    pendingSync: 0,
    lowStock: 0,
    expiringSoon: 0,
    chartData: [],
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const today = new Date().toDateString()
    const sales = await queryDb(
      `SELECT * FROM sales ORDER BY created_at DESC LIMIT 50`
    )
    const batches = await queryDb('SELECT * FROM batches')

    const todaySales = sales.filter(
      (s: any) => s.created_at && new Date(s.created_at).toDateString() === today
    )
    const todayRevenue = todaySales.reduce(
      (sum: number, s: any) => sum + (s.total || 0),
      0
    )
    const pendingSync = sales.filter((s: any) => !s.synced).length

    const stockMap = new Map<string, number>()
    for (const batch of batches) {
      const current = stockMap.get(batch.product_id) || 0
      stockMap.set(batch.product_id, current + (batch.quantity || 0))
    }

    const lowStockCount = Array.from(stockMap.values()).filter(
      (q) => q <= LOW_STOCK_THRESHOLD
    ).length

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + EXPIRY_DAYS_THRESHOLD)
    const expiringSoonCount = batches.filter((b: any) => {
      if (!b.expiry_date || b.quantity <= 0) return false
      return new Date(b.expiry_date) <= expiryDate
    }).length

    const last7Days: Map<string, number> = new Map()
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const key = date.toISOString().slice(0, 10)
      last7Days.set(key, 0)
    }
    for (const sale of sales) {
      const date = sale.created_at?.slice(0, 10)
      if (date && last7Days.has(date)) {
        last7Days.set(date, (last7Days.get(date) || 0) + (sale.total || 0))
      }
    }

    const chartData = Array.from(last7Days.entries()).map(([date, value]) => ({
      label: date.slice(5),
      value,
    }))

    setData({
      currency: 'TZS',
      todayRevenue,
      todaySales: todaySales.length,
      pendingSync,
      lowStock: lowStockCount,
      expiringSoon: expiringSoonCount,
      chartData,
    })
    setIsLoading(false)
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

  const stats = [
    {
      label: "Today's revenue",
      value: `TZS ${data.todayRevenue.toLocaleString()}`,
      sub: `${data.todaySales} sales`,
    },
    {
      label: 'Pending sync',
      value: String(data.pendingSync),
      sub: 'offline changes',
      alert: data.pendingSync > 0,
    },
    {
      label: 'Low stock',
      value: String(data.lowStock),
      sub: `< ${LOW_STOCK_THRESHOLD} units`,
      alert: data.lowStock > 0,
    },
    {
      label: 'Expiring soon',
      value: String(data.expiringSoon),
      sub: `< ${EXPIRY_DAYS_THRESHOLD} days`,
      alert: data.expiringSoon > 0,
    },
  ]

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface-base border border-outline-variant rounded-xl p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {stat.label}
            </p>
            <p
              className={`font-headline text-2xl font-black mt-1 ${
                stat.alert ? 'text-error' : 'text-on-surface'
              }`}
            >
              {stat.value}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface-base border border-outline-variant rounded-xl p-5">
          <h3 className="font-headline font-bold text-on-surface mb-4">
            Revenue - last 7 days
          </h3>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [
                    `TZS ${value.toLocaleString()}`,
                    'Revenue',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h3 className="font-headline font-bold text-on-surface mb-4">
            Quick actions
          </h3>
          <div className="space-y-2">
            <Link
              to="/pos"
              className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant hover:bg-outline-variant/30 transition-colors"
            >
              <span className="material-symbols-outlined text-primary">
                point_of_sale
              </span>
              <span className="text-sm font-medium">Open POS Terminal</span>
            </Link>
            <Link
              to="/inventory"
              className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant hover:bg-outline-variant/30 transition-colors"
            >
              <span className="material-symbols-outlined text-primary">
                inventory_2
              </span>
              <span className="text-sm font-medium">Manage Inventory</span>
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant hover:bg-outline-variant/30 transition-colors"
            >
              <span className="material-symbols-outlined text-primary">
                settings
              </span>
              <span className="text-sm font-medium">Settings</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
