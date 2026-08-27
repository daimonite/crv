import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { useI18nStore, t } from '../lib/i18n'
import { queryDb } from '../lib/database'
import Logo from './Logo'

export default function TopBar() {
  const navigate = useNavigate()
  const { currentOperator, logout } = useAuthStore()
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('trial')

  useEffect(() => {
    async function loadSubscription() {
      const result = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
      if (result.length > 0) {
        const bid = JSON.parse(result[0].value)
        const branchResult = await queryDb('SELECT subscription_status FROM branches WHERE id = ?', [bid])
        if (branchResult.length > 0) {
          setSubscriptionStatus(branchResult[0].subscription_status || 'trial')
        }
      }
    }
    loadSubscription()
    const interval = setInterval(loadSubscription, 30000)
    return () => clearInterval(interval)
  }, [])

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'bg-secondary'
      case 'trial': return 'bg-primary animate-pulse'
      case 'past_due': return 'bg-warning'
      case 'inactive': return 'bg-error'
      default: return 'bg-outline-variant'
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'active': return 'Active'
      case 'trial': return 'Trial'
      case 'past_due': return 'Past Due'
      case 'inactive': return 'Inactive'
      default: return status
    }
  }

  async function handleLock() {
    logout()
    navigate('/login')
  }

  const { locale, toggleLocale } = useI18nStore()

  return (
    <header className="h-14 bg-surface-base border-b border-outline-variant/60 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <Logo size="sm" />
        <span className="font-headline font-semibold text-on-surface">Cervos POS</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusColor(subscriptionStatus)}`} />
          <span className="text-xs text-on-surface-variant">{getStatusLabel(subscriptionStatus)}</span>
        </div>

        <button
          onClick={toggleLocale}
          title={locale === 'en' ? 'Switch to Swahili' : 'Switch to English'}
          className="p-2 rounded-lg hover:bg-outline-variant/50 transition-colors"
        >
          <span className="material-symbols-outlined text-xl text-on-surface-variant">
            language
          </span>
        </button>

        {currentOperator && (
          <button
            onClick={handleLock}
            title={t('common.lock')}
            className="p-2 rounded-lg hover:bg-outline-variant/50 transition-colors"
          >
            <span className="material-symbols-outlined text-xl text-on-surface-variant">
              lock
            </span>
          </button>
        )}
      </div>
    </header>
  )
}
