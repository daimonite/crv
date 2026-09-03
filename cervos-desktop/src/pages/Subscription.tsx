import { useState, useEffect, useCallback } from 'react'
import { queryDb, executeDb } from '../lib/database'
import { supabase } from '../lib/supabase'
import { runSyncCycle } from '../lib/sync'
import { invoke } from '@tauri-apps/api/core'

interface BranchInfo {
  id: string
  status: string
  tier: string
  grace_ends_at: string | null
  trial_ends_at: string | null
}

interface Plan {
  id: string
  name: string
  price_monthly_tzs: number
  price_annual_tzs: number
  max_stock_value_tzs: number | null
  features: string[]
}

const WEB_URL =
  (import.meta.env.VITE_WEB_URL as string | undefined) ||
  (import.meta.env.VITE_APP_URL as string | undefined) ||
  'https://cervos.online'

function formatTzs(n: number): string {
  return `TZS ${Math.round(n).toLocaleString()}`
}

export default function Subscription() {
  const [branch, setBranch] = useState<BranchInfo | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [stockValue, setStockValue] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [wallet, setWallet] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const bidRow = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
      if (bidRow.length === 0) {
        setIsLoading(false)
        return
      }
      const bid = JSON.parse(bidRow[0].value)

      const branchRows = await queryDb(
        'SELECT subscription_status, subscription_tier, grace_ends_at, trial_ends_at FROM branches WHERE id = ?',
        [bid]
      )
      if (branchRows.length > 0) {
        const b = branchRows[0]
        setBranch({
          id: bid,
          status: b.subscription_status || 'trial',
          tier: b.subscription_tier || '',
          grace_ends_at: b.grace_ends_at || null,
          trial_ends_at: b.trial_ends_at || null,
        })
      }

      // Real stock value: quantity x sale_price across this branch's locally
      // synced batches. This is the actual metric the plans below are priced
      // against — not a placeholder.
      const stockRows = await queryDb('SELECT COALESCE(SUM(quantity * sale_price), 0) as total FROM batches')
      setStockValue(Number(stockRows[0]?.total ?? 0))

      const { data: planRows, error: planError } = await supabase
        .from('branch_subscription_plans')
        .select('id, name, price_monthly_tzs, price_annual_tzs, max_stock_value_tzs, features')
        .order('price_monthly_tzs', { ascending: true })
      if (planError) throw planError
      setPlans((planRows ?? []) as Plan[])

      const walletRow = await queryDb("SELECT value FROM app_settings WHERE key = 'payme_wallet_number'")
      if (walletRow.length) setWallet(JSON.parse(walletRow[0].value))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscription info')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function suggestedPlanId(): string | null {
    if (plans.length === 0) return null
    const fit = plans.find((p) => p.max_stock_value_tzs == null || stockValue <= p.max_stock_value_tzs)
    return (fit ?? plans[plans.length - 1]).id
  }

  function countdown(dateStr: string | null): string {
    if (!dateStr) return ''
    const end = new Date(dateStr)
    const now = new Date()
    if (now > end) return 'Expired'
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} day${days === 1 ? '' : 's'} remaining`
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'active': return 'bg-secondary/10 text-secondary'
      case 'trial': return 'bg-primary/10 text-primary'
      case 'grace': return 'bg-amber-100 text-amber-700'
      case 'locked': return 'bg-error/10 text-error'
      default: return 'bg-outline-variant text-on-surface-variant'
    }
  }

  async function upgrade(plan: Plan) {
    if (!branch) return
    setError(null)
    setMessage(null)
    const w = wallet.trim()
    if (!w) {
      setError('Enter a Payme Africa mobile money number to pay with.')
      return
    }
    setUpgrading(plan.id)
    try {
      await executeDb(
        `INSERT INTO app_settings (key, value) VALUES ('payme_wallet_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(w)]
      )

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in — sign in again.')

      const res = await fetch(`${WEB_URL}/api/subscription/subscribe-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ branchId: branch.id, planId: plan.id, msisdn: w }),
      })
      const json = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) throw new Error(json.error || `Upgrade failed (${res.status})`)

      setMessage(json.message || 'Payment initiated — confirm the mobile money prompt on your phone.')
      await runSyncCycle()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upgrade failed')
    } finally {
      setUpgrading(null)
    }
  }

  async function manageOnWeb() {
    // Vite/Tauri webviews can't reliably open a system browser via a plain
    // <a target="_blank">; the rest of this app already routes external
    // links through the opener plugin (see Onboarding's signup button).
    try {
      await invoke('plugin:opener|open_url', { url: `${WEB_URL}/dashboard/billing` })
    } catch {
      window.open(`${WEB_URL}/dashboard/billing`, '_blank')
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-variant rounded w-48" />
          <div className="h-40 bg-surface-variant rounded-xl" />
        </div>
      </div>
    )
  }

  const suggested = suggestedPlanId()

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="font-headline text-2xl font-black text-on-surface mb-2">POS Subscription</h1>
      <p className="text-sm text-on-surface-variant mb-6">
        Priced by this branch's current stock value — separate from the pharmacy portal's network-wide plan.
      </p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {message && <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">{message}</div>}

      <div className="bg-surface-base border border-outline-variant rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Current Plan</p>
            <p className="font-headline text-3xl font-black text-on-surface mt-1">{branch?.tier || 'No plan yet'}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${statusColor(branch?.status || 'trial')}`}>
            {(branch?.status || 'trial').replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2 p-3 bg-outline-variant/20 rounded-lg mb-3">
          <span className="material-symbols-outlined text-on-surface-variant">inventory_2</span>
          <div>
            <p className="text-sm font-medium text-on-surface">Current stock value</p>
            <p className="text-xs text-on-surface-variant">{formatTzs(stockValue)}</p>
          </div>
        </div>

        {branch?.status === 'trial' && branch.trial_ends_at && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
            <span className="material-symbols-outlined text-primary">schedule</span>
            <div>
              <p className="text-sm font-medium text-on-surface">Trial period</p>
              <p className="text-xs text-on-surface-variant">{countdown(branch.trial_ends_at)}</p>
            </div>
          </div>
        )}

        {branch?.status === 'grace' && branch.grace_ends_at && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg">
            <span className="material-symbols-outlined text-amber-700">warning</span>
            <div>
              <p className="text-sm font-medium text-on-surface">Grace period</p>
              <p className="text-xs text-on-surface-variant">{countdown(branch.grace_ends_at)}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Mobile money number (0712 345 678)"
            className="w-full px-3 py-2 border border-outline-variant rounded-lg text-sm"
          />
          <button
            onClick={manageOnWeb}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-outline-variant text-on-surface font-semibold hover:bg-outline-variant/20"
          >
            <span className="material-symbols-outlined">open_in_new</span>
            Manage Plan & Payment on the Web Portal
          </button>
        </div>
      </div>

      <h2 className="font-headline text-xl font-bold text-on-surface mb-4">Available Plans</h2>
      <div className="grid grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.name === branch?.tier
          const isSuggested = plan.id === suggested && !isCurrent
          return (
            <div
              key={plan.id}
              className={`bg-surface-base border rounded-xl p-5 relative ${isCurrent ? 'border-primary' : 'border-outline-variant'}`}
            >
              {isSuggested && (
                <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">
                  Fits your stock
                </span>
              )}
              <p className="font-headline text-lg font-bold text-on-surface">{plan.name}</p>
              <p className="text-2xl font-black text-on-surface my-2">{formatTzs(plan.price_monthly_tzs)}/mo</p>
              <p className="text-xs text-on-surface-variant mb-2">
                {plan.max_stock_value_tzs ? `Up to ${formatTzs(plan.max_stock_value_tzs)} stock value` : 'Unlimited stock value'}
              </p>
              <ul className="space-y-1">
                {(plan.features ?? []).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-xs text-secondary">check</span>
                    {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && (
                <button
                  onClick={() => upgrade(plan)}
                  disabled={upgrading === plan.id}
                  className="mt-4 w-full py-2 rounded-md border border-primary text-primary text-sm font-semibold hover:bg-primary/10 text-center disabled:opacity-60"
                >
                  {upgrading === plan.id ? 'Processing…' : 'Upgrade'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
