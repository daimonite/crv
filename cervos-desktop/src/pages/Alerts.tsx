import { useState, useEffect } from 'react'
import { queryDb, executeDb } from '../lib/database'
import { useAuthStore } from '../lib/store'
import { getSupabase } from '../lib/sync'

interface SubscriptionInfo {
  status: string
  grace_ends_at: string | null
  trial_ends_at: string | null
}

interface LocalNotification {
  id: string
  kind: string
  title: string
  body: string
  route: string | null
  admin_only: number
  read: number
  created_at: string
}

export default function Alerts() {
  const { isAdmin, isAuthenticated } = useAuthStore()
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [bannerMessage, setBannerMessage] = useState('')
  const [notifications, setNotifications] = useState<LocalNotification[]>([])

  useEffect(() => {
    loadSubscription()
    loadNotifications()
  }, [])

  async function loadNotifications() {
    const rows = (await queryDb('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50')) as LocalNotification[]
    setNotifications(rows)
  }

  async function markRead(n: LocalNotification) {
    if (n.read) return
    await executeDb('UPDATE notifications SET read = 1 WHERE id = ?', [n.id])
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)))
    // Best-effort: reflect read state back to the pharmacy portal too. If this
    // fails (offline, etc.) the next sync pull will just re-show it as
    // unread locally — not destructive, so no retry queue needed here.
    try {
      await getSupabase().from('notifications').update({ read: true }).eq('id', n.id)
    } catch {
      /* offline — fine, local read-state already stuck */
    }
  }

  async function loadSubscription() {
    const statusResult = await queryDb("SELECT value FROM app_settings WHERE key = 'subscription_status'")
    const graceResult = await queryDb("SELECT value FROM app_settings WHERE key = 'grace_ends_at'")
    const trialResult = await queryDb("SELECT value FROM app_settings WHERE key = 'trial_ends_at'")

    const status = statusResult.length > 0 ? JSON.parse(statusResult[0].value) : 'trial'
    const graceEndsAt = graceResult.length > 0 ? JSON.parse(graceResult[0].value) : null
    const trialEndsAt = trialResult.length > 0 ? JSON.parse(trialResult[0].value) : null

    setSubscription({ status, grace_ends_at: graceEndsAt, trial_ends_at: trialEndsAt })
    checkWarning(status, graceEndsAt, trialEndsAt)
  }

  function checkWarning(status: string, graceEndsAt: string | null, trialEndsAt: string | null) {
    const now = new Date()
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

    if (status === 'grace' && graceEndsAt) {
      const graceEnd = new Date(graceEndsAt)
      const daysLeft = graceEnd.getTime() - now.getTime()
      if (daysLeft <= THREE_DAYS && daysLeft > 0) {
        setShowBanner(true)
        setBannerMessage(`Your account is at risk of being locked. Contact your administrator to renew the subscription. (${Math.ceil(daysLeft / (24 * 60 * 60 * 1000))} days remaining)`)
      }
    }

    if (status === 'trial' && trialEndsAt) {
      const trialEnd = new Date(trialEndsAt)
      const daysLeft = trialEnd.getTime() - now.getTime()
      if (daysLeft <= THREE_DAYS && daysLeft > 0) {
        setShowBanner(true)
        setBannerMessage(`Your trial ends in ${Math.ceil(daysLeft / (24 * 60 * 60 * 1000))} days. Contact your administrator to subscribe.`)
      }
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="p-6">
      <h1 className="font-headline text-2xl font-black text-on-surface mb-6">
        Alerts
      </h1>

      {showBanner && !isAdmin && (
        <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-xl flex items-start gap-3">
          <span className="material-symbols-outlined text-error text-xl">warning</span>
          <div>
            <p className="font-semibold text-error">Account at Risk</p>
            <p className="text-sm text-on-surface mt-1">{bannerMessage}</p>
          </div>
        </div>
      )}

      {isAdmin && subscription && (
        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
            Subscription Status
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">Status</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                subscription.status === 'active' ? 'bg-secondary/10 text-secondary' :
                subscription.status === 'trial' ? 'bg-blue-500/10 text-blue-400' :
                subscription.status === 'grace' ? 'bg-amber-500/10 text-amber-400' :
                'bg-error/10 text-error'
              }`}>
                {subscription.status.toUpperCase()}
              </span>
            </div>
            {subscription.trial_ends_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">Trial Ends</span>
                <span className="text-sm font-medium">{new Date(subscription.trial_ends_at).toLocaleDateString()}</span>
              </div>
            )}
            {subscription.grace_ends_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">Grace Period Ends</span>
                <span className="text-sm font-medium">{new Date(subscription.grace_ends_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!showBanner && isAdmin && (
        <div className="mt-6 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl">check_circle</span>
          <p className="mt-2 font-medium">No active alerts</p>
          <p className="text-sm">Your subscription is in good standing</p>
        </div>
      )}

      {!showBanner && !isAdmin && notifications.length === 0 && (
        <div className="mt-6 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl">notifications_off</span>
          <p className="mt-2 font-medium">No alerts</p>
          <p className="text-sm">You're all caught up</p>
        </div>
      )}

      {notifications.filter((n) => isAdmin || !n.admin_only).length > 0 && (
        <div className="mt-6 bg-surface-base border border-outline-variant rounded-xl overflow-hidden">
          <h2 className="font-headline text-lg font-bold text-on-surface p-5 pb-3">
            Notifications from your pharmacy
          </h2>
          <ul className="divide-y divide-outline-variant/60">
            {notifications
              .filter((n) => isAdmin || !n.admin_only)
              .map((n) => (
                <li
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                    n.read ? 'opacity-60' : 'bg-primary/5'
                  } hover:bg-outline-variant/20`}
                >
                  <span className="material-symbols-outlined text-primary text-xl shrink-0">
                    {n.kind === 'order' ? 'receipt_long' : n.kind === 'payment' ? 'payments' : 'campaign'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface text-sm">{n.title}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5">{n.body}</p>
                    <p className="text-xs text-on-surface-variant/70 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}