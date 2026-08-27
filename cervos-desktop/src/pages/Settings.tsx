import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { queryDb, executeDb } from '../lib/database'
import { getDashboardStats, signOut, runSyncCycle } from '../lib/sync'
import { useAuthStore } from '../lib/store'
import { useI18nStore, t } from '../lib/i18n'
import { fetchOperators, createOperator, deleteOperator } from '../lib/queries'
import type { Operator } from '../types'

export default function Settings() {
  const navigate = useNavigate()
  const { logout, currentOperator, isAdmin } = useAuthStore()
  const { locale, setLocale } = useI18nStore()
  const [pharmacyName, setPharmacyName] = useState('')
  const [stats, setStats] = useState({ linked: false, pendingCount: 0, lastSyncedAt: null as string | null })
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [operators, setOperators] = useState<Operator[]>([])
  const [showAddOperator, setShowAddOperator] = useState(false)
  const [newOpName, setNewOpName] = useState('')
  const [newOpPin, setNewOpPin] = useState('')
  const [newOpRole, setNewOpRole] = useState<'admin' | 'operator'>('operator')
  const [branchId, setBranchId] = useState<string | null>(null)
  const [showPinChange, setShowPinChange] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')
  const [taxRate, setTaxRate] = useState('10')
  const [lowStockThreshold, setLowStockThreshold] = useState('10')
  const [expiryDaysThreshold, setExpiryDaysThreshold] = useState('30')

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadOperators()
    }
  }, [isAdmin])

  async function loadSettings() {
    const nameResult = await queryDb("SELECT value FROM app_settings WHERE key = 'pharmacy_name'")
    if (nameResult.length > 0) {
      setPharmacyName(JSON.parse(nameResult[0].value))
    }
    const branchResult = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    if (branchResult.length > 0) {
      setBranchId(JSON.parse(branchResult[0].value))
    }
    const s = await getDashboardStats()
    setStats(s)
    const config = await queryDb("SELECT key, value FROM app_settings WHERE key IN ('tax_rate', 'low_stock_threshold', 'expiry_days_threshold')")
    for (const setting of config) {
      const value = JSON.parse(setting.value)
      if (setting.key === 'tax_rate') setTaxRate(String(value))
      if (setting.key === 'low_stock_threshold') setLowStockThreshold(String(value))
      if (setting.key === 'expiry_days_threshold') setExpiryDaysThreshold(String(value))
    }
  }

  async function loadOperators() {
    if (!branchId) return
    const ops = await fetchOperators(branchId)
    setOperators(ops)
  }

  async function handleAddOperator(e: React.FormEvent) {
    e.preventDefault()
    if (!branchId || !newOpName.trim() || newOpPin.length < 4) return
    try {
      await createOperator({
        branch_id: branchId,
        name: newOpName.trim(),
        pin: newOpPin,
        role: newOpRole,
      })
      setNewOpName('')
      setNewOpPin('')
      setNewOpRole('operator')
      setShowAddOperator(false)
      loadOperators()
    } catch (err: any) {
      console.error('Failed to create operator:', err)
    }
  }

  async function handleDeleteOperator(id: string) {
    if (id === currentOperator?.id) return
    if (!confirm('Delete this operator?')) return
    await deleteOperator(id)
    loadOperators()
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault()
    setPinError('')
    setPinSuccess('')
    if (!currentOperator) return
    if (newPin.length < 4) { setPinError('PIN must be at least 4 digits'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return }
    try {
      const { validateOperatorPin, updateOperator } = await import('../lib/queries')
      const valid = await validateOperatorPin(currentOperator.id, currentOperator.branch_id, currentPin)
      if (!valid) { setPinError('Current PIN is incorrect'); return }
      await updateOperator(currentOperator.id, { pin: newPin })
      setPinSuccess('PIN changed successfully')
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setTimeout(() => { setShowPinChange(false); setPinSuccess('') }, 1500)
    } catch (err: any) {
      setPinError(err.message || 'Failed to change PIN')
    }
  }

  async function handleSaveName() {
    await executeDb(
      `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['pharmacy_name', JSON.stringify(pharmacyName)]
    )
    const settings = [
      ['tax_rate', Number(taxRate)],
      ['low_stock_threshold', Number(lowStockThreshold)],
      ['expiry_days_threshold', Number(expiryDaysThreshold)],
    ] as const
    for (const [key, value] of settings) {
      if (Number.isFinite(value) && value >= 0) {
        await executeDb(
          `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, JSON.stringify(value)]
        )
      }
    }
  }

  async function handleSync() {
    setIsSyncing(true)
    setSyncMessage('')
    try {
      const result = await runSyncCycle()
      if (!result.ok) {
        setSyncMessage(`Sync failed: ${result.message || 'unknown error'}`)
      } else {
        setSyncMessage(
          `Synced at ${new Date().toLocaleTimeString()} â€” pulled ${result.pulled ?? 0}, pushed ${result.pushed ?? 0}`
        )
      }
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message}`)
    } finally {
      const s = await getDashboardStats()
      setStats(s)
      setIsSyncing(false)
    }
  }

  async function handleUnlink() {
    await signOut()
    logout()
    navigate('/login')
  }

  async function handleSignOut() {
    await signOut()
    logout()
    navigate('/login')
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="font-headline text-2xl font-black text-on-surface mb-6">
        {t('settings.title')}
      </h1>

      <div className="space-y-6">
        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
            {t('settings.storeInfo')}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                {t('settings.pharmacyName')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pharmacyName}
                  onChange={(e) => setPharmacyName(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder={t('settings.pharmacyName')}
                />
                <button
                  onClick={handleSaveName}
                  className="px-4 py-2.5 rounded-md bg-primary text-white font-semibold hover:opacity-90 transition-opacity"
                >
                  {t('settings.save')}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <label className="text-xs font-semibold text-on-surface-variant">
                {t('settings.taxRate')}
                <input type="number" min="0" max="100" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm" />
              </label>
              <label className="text-xs font-semibold text-on-surface-variant">
                {t('settings.lowStock')}
                <input type="number" min="0" step="1" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm" />
              </label>
              <label className="text-xs font-semibold text-on-surface-variant">
                {t('settings.expiryWarning')}
                <input type="number" min="0" step="1" value={expiryDaysThreshold} onChange={(e) => setExpiryDaysThreshold(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm" />
              </label>
            </div>
          </div>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
            {t('settings.language')}
          </h2>
          <p className="text-xs text-on-surface-variant mb-4">
            {t('settings.languageDesc')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setLocale('en')}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                locale === 'en'
                  ? 'bg-primary text-white'
                  : 'border border-outline-variant hover:bg-outline-variant/30'
              }`}
            >
              {t('settings.english')}
            </button>
            <button
              onClick={() => setLocale('sw')}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                locale === 'sw'
                  ? 'bg-primary text-white'
                  : 'border border-outline-variant hover:bg-outline-variant/30'
              }`}
            >
              {t('settings.swahili')}
            </button>
          </div>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline text-lg font-bold text-on-surface">{t('settings.security')}</h2>
              <p className="text-xs text-on-surface-variant mt-1">{t('settings.securityDesc')}</p>
            </div>
            <button type="button" onClick={() => setShowPinChange((visible) => !visible)} className="px-3 py-2 rounded-md border border-outline-variant text-sm hover:bg-outline-variant/30">
              {showPinChange ? t('settings.cancel') : t('settings.changePin')}
            </button>
          </div>
          {showPinChange && (
            <form onSubmit={handleChangePin} className="mt-4 space-y-3">
              <input type="password" inputMode="numeric" minLength={4} maxLength={8} required value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} placeholder={t('settings.currentPin')} className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm" />
              <input type="password" inputMode="numeric" minLength={4} maxLength={8} required value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder={t('settings.newPin')} className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm" />
              <input type="password" inputMode="numeric" minLength={4} maxLength={8} required value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder={t('settings.confirmPin')} className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm" />
              {pinError && <p className="text-sm text-error">{pinError}</p>}
              {pinSuccess && <p className="text-sm text-secondary">{pinSuccess}</p>}
              <button type="submit" className="px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold hover:opacity-90">{t('settings.savePin')}</button>
            </form>
          )}
        </div>

        {isAdmin && (
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-lg font-bold text-on-surface">
                {t('settings.teamManagement')}
              </h2>
              <button
                onClick={() => setShowAddOperator(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {t('settings.addOperator')}
              </button>
            </div>

            {showAddOperator && (
              <form onSubmit={handleAddOperator} className="mb-4 p-4 bg-surface border border-outline rounded-lg space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">{t('settings.name')}</label>
                    <input
                      type="text"
                      value={newOpName}
                      onChange={(e) => setNewOpName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm"
                      placeholder="Operator name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">{t('settings.pin4')}</label>
                    <input
                      type="password"
                      value={newOpPin}
                      onChange={(e) => setNewOpPin(e.target.value)}
                      required
                      minLength={4}
                      className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm"
                      placeholder="----"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">{t('settings.role')}</label>
                    <select
                      value={newOpRole}
                      onChange={(e) => setNewOpRole(e.target.value as 'admin' | 'operator')}
                      className="w-full px-3 py-2 rounded-md border border-outline-variant bg-surface-base text-sm"
                    >
                      <option value="operator">{t('settings.operator')}</option>
                      <option value="admin">{t('settings.admin')}</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold hover:opacity-90"
                  >
                    {t('settings.create')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddOperator(false)}
                    className="px-4 py-2 rounded-md border border-outline-variant text-sm hover:bg-outline-variant/30"
                  >
                    {t('settings.cancel')}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {operators.map((op) => (
                <div key={op.id} className="flex items-center justify-between p-3 bg-surface rounded-lg border border-outline-variant">
                  <div>
                    <p className="font-medium text-sm">{op.name}</p>
                    <p className="text-xs text-on-surface-variant capitalize">{op.role}</p>
                  </div>
                  {op.id !== currentOperator?.id && (
                    <button
                      onClick={() => handleDeleteOperator(op.id)}
                      className="p-1.5 rounded hover:bg-error/10 text-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
            {t('settings.cloudSync')}
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{t('settings.connectionStatus')}</p>
                <p className="text-xs text-on-surface-variant">
                  {stats.linked ? t('settings.connected') : t('settings.notLinked')}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  stats.linked
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-outline-variant text-on-surface-variant'
                }`}
              >
                {stats.linked ? t('settings.linked') : t('settings.offline')}
              </span>
            </div>

            {stats.linked && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{t('settings.pendingChanges')}</p>
                    <p className="text-xs text-on-surface-variant">
                      {stats.pendingCount} {t('settings.changesWaiting')}
                    </p>
                  </div>
                  <span className="font-semibold">{stats.pendingCount}</span>
                </div>

                {stats.lastSyncedAt && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{t('settings.lastSynced')}</p>
                      <p className="text-xs text-on-surface-variant">
                        {new Date(stats.lastSyncedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md bg-primary text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSyncing ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-xl">
                          progress_activity
                        </span>
                        {t('settings.syncing')}
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-xl">sync</span>
                        {t('settings.syncNow')}
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleUnlink}
                    className="px-4 py-2.5 rounded-md border border-error text-error font-semibold hover:bg-error/10 transition-colors"
                  >
                    {t('settings.unlink')}
                  </button>
                </div>

                {syncMessage && (
                  <p
                    className={`text-sm ${
                      syncMessage.includes('failed') ? 'text-error' : 'text-secondary'
                    }`}
                  >
                    {syncMessage}
                  </p>
                )}
              </>
            )}

            {!stats.linked && (
              <div className="pt-2">
                <Link
                  to="/onboarding"
                  className="flex items-center justify-center gap-2 py-2.5 rounded-md border border-outline-variant text-on-surface font-medium hover:bg-outline-variant/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">link</span>
                  {t('settings.linkAccount')}
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
            {t('settings.dataManagement')}
          </h2>

          <div className="space-y-3">
            <button
              onClick={async () => {
                if (confirm('Export all data as JSON?')) {
                  const data = {
                    products: await queryDb('SELECT * FROM products'),
                    batches: await queryDb('SELECT * FROM batches'),
                    sales: await queryDb('SELECT * FROM sales'),
                    operators: await queryDb('SELECT * FROM operators'),
                    settings: await queryDb('SELECT * FROM app_settings'),
                  }
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `cervos-export-${new Date().toISOString().slice(0, 10)}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-outline-variant hover:bg-outline-variant/30 transition-colors"
            >
              <span className="material-symbols-outlined text-xl text-primary">
                download
              </span>
              <span className="font-medium">{t('settings.exportData')}</span>
            </button>

            <button
              onClick={() => {
                if (
                  confirm(
                    'This will clear all local data. This action cannot be undone. Continue?'
                  )
                ) {
                  localStorage.clear()
                  window.location.reload()
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-error text-error hover:bg-error/10 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">delete_forever</span>
              <span className="font-medium">{t('settings.clearAll')}</span>
            </button>
          </div>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">
            {t('settings.account')}
          </h2>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-error text-error hover:bg-error/10 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            <span className="font-medium">{t('settings.signOut')}</span>
          </button>
        </div>

        <div className="text-center text-xs text-on-surface-variant">
          <p>Cervos Pharmacy OS v0.1.0</p>
          <p className="mt-1">Built with Tauri 2 + React</p>
        </div>
      </div>
    </div>
  )
}
