import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useSubscription } from '../lib/hooks'
import { checkSubscriptionValidity, syncSubscriptionStatus } from '../lib/queries'

export default function Subscription() {
  const navigate = useNavigate()
  const { supplier } = useAuth()
  const { subscriptionStatus, subscriptionTier, graceEndsAt, trialEndsAt } = useSubscription()
  const [loading, setLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  checkSubscriptionValidity()

  const getStatusBadge = () => {
    const statusConfig = {
      active: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' },
      trial: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Trial' },
      inactive: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Inactive' },
      past_due: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Past Due' },
    }

    const config = statusConfig[subscriptionStatus || 'inactive']
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  const getTierDisplayName = (tier: string | null) => {
    const tierNames: Record<string, string> = {
      free: 'Free',
      starter: 'Starter',
      professional: 'Professional',
      enterprise: 'Enterprise',
    }
    return tierNames[tier || 'free'] || 'Free'
  }

  const getDaysRemaining = () => {
    if (subscriptionStatus === 'trial' && trialEndsAt) {
      const trialEnd = new Date(trialEndsAt)
      const now = new Date()
      const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return days > 0 ? days : 0
    }
    if (subscriptionStatus === 'past_due' && graceEndsAt) {
      const graceEnd = new Date(graceEndsAt)
      const now = new Date()
      const days = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return days > 0 ? days : 0
    }
    return null
  }

  const handleRefresh = async () => {
    if (!supplier?.id || !isOnline) return
    setLoading(true)
    try {
      await syncSubscriptionStatus(supplier.id)
    } catch (error) {
      console.error('Failed to refresh subscription:', error)
    } finally {
      setLoading(false)
    }
  }

  const daysRemaining = getDaysRemaining()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-white">Subscription</h1>
        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400">
              Offline Mode
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading || !isOnline}
            className="p-2 rounded-lg hover:bg-surface-300 transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-gray-400 ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">
              {getTierDisplayName(subscriptionTier)} Plan
            </h2>
            <p className="text-gray-400 text-sm">Current subscription tier</p>
          </div>
          {getStatusBadge()}
        </div>

        {subscriptionStatus === 'trial' && daysRemaining !== null && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-400">schedule</span>
              <div>
                <p className="text-blue-400 font-medium">Trial Period Active</p>
                <p className="text-blue-400/80 text-sm">
                  {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
                </p>
              </div>
            </div>
          </div>
        )}

        {subscriptionStatus === 'past_due' && daysRemaining !== null && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400">warning</span>
              <div>
                <p className="text-red-400 font-medium">Grace Period Active</p>
                <p className="text-red-400/80 text-sm">
                  {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining to update payment
                </p>
              </div>
            </div>
          </div>
        )}

        {subscriptionStatus === 'inactive' && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400">cancel</span>
              <div>
                <p className="text-red-400 font-medium">Subscription Inactive</p>
                <p className="text-red-400/80 text-sm">
                  Update your payment method to restore access
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-surface-300 pt-6">
          <h3 className="text-lg font-semibold text-white mb-4">Plan Features</h3>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${subscriptionTier !== 'free' ? 'text-green-400' : 'text-gray-500'}`}>
                {subscriptionTier !== 'free' ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={subscriptionTier !== 'free' ? 'text-white' : 'text-gray-400'}>
                Unlimited Products
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${subscriptionTier === 'professional' || subscriptionTier === 'enterprise' ? 'text-green-400' : 'text-gray-500'}`}>
                {subscriptionTier === 'professional' || subscriptionTier === 'enterprise' ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={subscriptionTier === 'professional' || subscriptionTier === 'enterprise' ? 'text-white' : 'text-gray-400'}>
                Advanced Analytics
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${subscriptionTier === 'enterprise' ? 'text-green-400' : 'text-gray-500'}`}>
                {subscriptionTier === 'enterprise' ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={subscriptionTier === 'enterprise' ? 'text-white' : 'text-gray-400'}>
                Priority Support
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${subscriptionTier !== 'free' ? 'text-green-400' : 'text-gray-500'}`}>
                {subscriptionTier !== 'free' ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={subscriptionTier !== 'free' ? 'text-white' : 'text-gray-400'}>
                API Access
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Payment Information</h3>
        <p className="text-gray-400 text-sm mb-4">
          To update your payment method, please contact our support team or visit the billing portal.
        </p>
        <a
          href="https://cervos.online/supplier/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent2 text-white rounded-lg font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          Update Payment Method
        </a>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}