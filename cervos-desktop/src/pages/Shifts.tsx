import { useState, useEffect } from 'react'
import { queryDb, executeDb, generateId } from '../lib/database'
import { queueForSync } from '../lib/sync'
import { useAuthStore } from '../lib/store'
import type { Shift } from '../types'

export default function Shifts() {
  const { currentOperator } = useAuthStore()
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [history, setHistory] = useState<Shift[]>([])
  const [countedCash, setCountedCash] = useState('')
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [operatorNames, setOperatorNames] = useState<Record<string, string>>({})

  useEffect(() => {
    loadShifts()
  }, [])

  async function loadShifts() {
    if (!currentOperator) return
    const rows = await queryDb(
      `SELECT * FROM shifts WHERE branch_id = ? ORDER BY opened_at DESC`,
      [currentOperator.branch_id]
    )
    const open = rows.find((r: any) => !r.closed_at)
    setActiveShift(open ?? null)
    setHistory(rows.filter((r: any) => r.closed_at))

    const ids = [...new Set(rows.map((r: any) => r.operator_id))]
    const names: Record<string, string> = {}
    for (const id of ids) {
      const op = await queryDb('SELECT name FROM operators WHERE id = ?', [id])
      names[id] = op.length > 0 ? op[0].name : 'Unknown'
    }
    setOperatorNames(names)
  }

  async function handleOpenShift() {
    if (!currentOperator || activeShift) return
    const branchResult = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    const branchId = branchResult.length > 0 ? JSON.parse(branchResult[0].value) : currentOperator.branch_id
    const id = generateId()
    const now = new Date().toISOString()

    await executeDb(
      `INSERT INTO shifts (id, branch_id, operator_id, opened_at, expected_cash, synced) VALUES (?, ?, ?, ?, 0, 0)`,
      [id, branchId, currentOperator.id, now]
    )
    await queueForSync('shifts', id, 'upsert', {
      id, branch_id: branchId, operator_id: currentOperator.id, opened_at: now, expected_cash: 0, synced: 0
    })
    loadShifts()
  }

  async function handleCloseShift() {
    if (!activeShift) return
    const now = new Date().toISOString()
    const counted = parseFloat(countedCash) || 0

    await executeDb(
      `UPDATE shifts SET closed_at = ?, counted_cash = ?, synced = 0 WHERE id = ?`,
      [now, counted, activeShift.id]
    )
    await queueForSync('shifts', activeShift.id, 'upsert', {
      ...activeShift, closed_at: now, counted_cash: counted, synced: 0
    })
    setShowCloseForm(false)
    setCountedCash('')
    loadShifts()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString()
  }

  function fmtDuration(opened: string, closed: string) {
    const ms = new Date(closed).getTime() - new Date(opened).getTime()
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="font-headline text-2xl font-black text-on-surface mb-6">Shifts</h1>

      <div className="space-y-6">
        {activeShift ? (
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h2 className="font-headline text-lg font-bold text-on-surface mb-4">Active Shift</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">Opened At</p>
                <p className="text-sm mt-0.5">{fmtDate(activeShift.opened_at)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">Expected Cash</p>
                <p className="text-sm mt-0.5">{activeShift.expected_cash.toFixed(2)}</p>
              </div>
            </div>

            {!showCloseForm ? (
              <button
                onClick={() => setShowCloseForm(true)}
                className="w-full py-2.5 rounded-md bg-error text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Close Shift
              </button>
            ) : (
              <div className="space-y-3 pt-2 border-t border-outline-variant">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Counted Cash
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="0.00"
                  />
                </div>
                {countedCash && (
                  <div className="text-sm">
                    <span className="text-on-surface-variant">Difference: </span>
                    <span className={`font-semibold ${(parseFloat(countedCash) || 0) - activeShift.expected_cash >= 0 ? 'text-secondary' : 'text-error'}`}>
                      {((parseFloat(countedCash) || 0) - activeShift.expected_cash).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleCloseShift}
                    className="px-4 py-2 rounded-md bg-error text-white text-sm font-semibold hover:opacity-90"
                  >
                    Confirm Close
                  </button>
                  <button
                    onClick={() => { setShowCloseForm(false); setCountedCash('') }}
                    className="px-4 py-2 rounded-md border border-outline-variant text-sm hover:bg-outline-variant/30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
            <h2 className="font-headline text-lg font-bold text-on-surface mb-2">No Active Shift</h2>
            <p className="text-sm text-on-surface-variant mb-4">Open a new shift to start recording sales.</p>
            <button
              onClick={handleOpenShift}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md bg-primary text-white font-semibold hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-xl">schedule</span>
              Open Shift
            </button>
          </div>
        )}

        <div className="bg-surface-base border border-outline-variant rounded-xl p-5">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-4">Shift History</h2>

          {history.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No completed shifts yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((shift) => {
                const diff = (shift.counted_cash ?? 0) - shift.expected_cash
                return (
                  <div
                    key={shift.id}
                    className="p-3 bg-surface rounded-lg border border-outline-variant"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">
                        {fmtDate(shift.opened_at)}
                      </p>
                      <span className="text-xs text-on-surface-variant">
                        {fmtDuration(shift.opened_at, shift.closed_at!)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-on-surface-variant">
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide">Operator</span>
                        <span className="text-sm text-on-surface">{operatorNames[shift.operator_id] || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide">Expected</span>
                        <span className="text-sm text-on-surface">{shift.expected_cash.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide">Counted</span>
                        <span className="text-sm text-on-surface">{shift.counted_cash?.toFixed(2) ?? '—'}</span>
                      </div>
                    </div>
                    {shift.counted_cash != null && (
                      <div className="mt-2 pt-2 border-t border-outline-variant flex items-center justify-between">
                        <span className="text-xs text-on-surface-variant">Difference</span>
                        <span className={`text-sm font-semibold ${diff >= 0 ? 'text-secondary' : 'text-error'}`}>
                          {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
