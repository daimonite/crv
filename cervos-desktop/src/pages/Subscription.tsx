import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { queryDb } from '../lib/database'

interface SubscriptionInfo {
  status: string
  tier: string
  grace_ends_at: string | null
  trial_ends_at: string | null
}

export default function Subscription() {
  const [sub, setSub] = useState<SubscriptionInfo>({
    status: 'trial',
    tier: 'free',
    grace_ends_at: null,
    trial_ends_at: null,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSubscription()
  }, [])

  async function loadSubscription() {
    const result = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    if (result.length > 0) {
      const bid = JSON.parse(result[0].value)
      const branchResult = await queryDb('SELECT subscription_status, subscription_tier, grace_ends_at, trial_ends_at FROM branches WHERE id = ?', [bid])
      if (branchResult.length > 0) {
        const b = branchResult[0]
        setSub({
          status: b.subscription_status || 'trial',
          tier: b.subscription_tier || 'free',
          grace_ends_at: b.grace_ends_at || null,
          trial_ends_at: b.trial_ends_at || null,
        })
      }
    }
    setIsLoading(false)
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'bg-secondary/10 text-secondary'
      case 'trial': return 'bg-primary/10 text-primary'
      case 'past_due': return 'bg-warning/10 text-warning'
      case 'inactive': return 'bg-error/10 text-error'
      default: return 'bg-outline-variant text-on-surface-variant'
    }
  }

  function getGraceCountdown(): string {
    if (!sub.grace_ends_at) return ''
    const graceEnd = new Date(sub.grace_ends_at)
    const now = new Date()
    if (now > graceEnd) return 'Expired'
    const days = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} days remaining`
  }

  function getTrialCountdown(): string {
    if (!sub.trial_ends_at) return ''
    const trialEnd = new Date(sub.trial_ends_at)
    const now = new Date()
    if (now > trialEnd) return 'Expired'
    const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} days remaining`
  }

  const plans = [
    { tier: 'free', name: 'Free', price: '$0/mo', features: ['Basic POS', 'Local-only storage', '50 products'] },
    { tier: 'starter', name: 'Starter', price: '$29/mo', features: ['Full POS', 'Cloud sync', '500 products', 'Basic reports'] },
    { tier: 'professional', name: 'Professional', price: '$79/mo', features: ['Everything in Starter', 'Unlimited products', 'Advanced reports', 'Multi-operator'] },
    { tier: 'enterprise', name: 'Enterprise', price: '$199/mo', features: ['Everything in Pro', 'Marketplace access', 'API access', 'Priority support'] },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="font-headline text-2xl font-black text-on-surface mb-6">Subscription</h1>

      <div className="bg-surface-base border border-outline-variant rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Current Plan</p>
            <p className="font-headline text-3xl font-black text-on-surface mt-1">
              {plans.find((p) => p.tier === sub.tier)?.name || 'Free'}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${getStatusColor(sub.status)}`}>
            {sub.status.replace('_', ' ')}
          </span>
        </div>

        {(sub.status === 'trial') && sub.trial_ends_at && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
            <span className="material-symbols-outlined text-primary">schedule</span>
            <div>
              <p className="text-sm font-medium text-on-surface">Trial period</p>
              <p className="text-xs text-on-surface-variant">{getTrialCountdown()}</p>
            </div>
          </div>
        )}

        {(sub.status === 'past_due' || sub.status === 'inactive') && sub.grace_ends_at && (
          <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg">
            <span className="material-symbols-outlined text-warning">warning</span>
            <div>
              <p className="text-sm font-medium text-on-surface">Grace period</p>
              <p className="text-xs text-on-surface-variant">{getGraceCountdown()}</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link
            to="/settings"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-primary text-white font-semibold hover:opacity-90"
          >
            <span className="material-symbols-outlined">payments</span>
            Update Payment Method
          </Link>
        </div>
      </div>

      <h2 className="font-headline text-xl font-bold text-on-surface mb-4">Available Plans</h2>
      <div className="grid grid-cols-2 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.tier}
            className={`bg-surface-base border rounded-xl p-5 ${plan.tier === sub.tier ? 'border-primary' : 'border-outline-variant'}`}
          >
            <p className="font-headline text-lg font-bold text-on-surface">{plan.name}</p>
            <p className="text-2xl font-black text-on-surface my-2">{plan.price}</p>
            <ul className="space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-xs text-secondary">check</span>
                  {f}
                </li>
              ))}
            </ul>
            {plan.tier !== sub.tier && (
              <a
                href="https://cervos.online/dashboard/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full py-2 rounded-md border border-primary text-primary text-sm font-semibold hover:bg-primary/10 text-center inline-block"
              >
                Upgrade
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
