import { useState, useEffect } from 'react'
import { queryDb } from '../lib/database'
import { fetchOperators, createOperator, updateOperator, deleteOperator } from '../lib/queries'
import { runSyncCycle } from '../lib/sync'
import type { Operator } from '../types'

export default function Users() {
  const [operators, setOperators] = useState<Operator[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingOp, setEditingOp] = useState<Operator | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)

  useEffect(() => {
    loadOperators()
  }, [])

  async function loadOperators() {
    const result = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    if (result.length > 0) {
      const bid = JSON.parse(result[0].value)
      setBranchId(bid)
      const ops = await fetchOperators(bid)
      setOperators(ops)
    }
    setIsLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this operator?')) return
    await deleteOperator(id)
    runSyncCycle().catch(() => {})
    loadOperators()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-2xl font-black text-on-surface">Operators</h1>
          <p className="text-sm text-on-surface-variant mt-1">{operators.length} operators</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:opacity-90"
        >
          <span className="material-symbols-outlined">person_add</span>
          Add Operator
        </button>
      </div>

      <div className="bg-surface-base border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-outline-variant/50">
            <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} className="border-t border-outline-variant">
                <td className="px-4 py-3">
                  <p className="font-medium text-sm">{op.name}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${op.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-surface text-on-surface-variant'}`}>
                    {op.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-on-surface-variant">
                  {op.created_at ? new Date(op.created_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingOp(op)}
                      className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(op.id)}
                      className="p-1 rounded hover:bg-error/10 text-error transition-colors"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {operators.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl">group</span>
            <p className="mt-2 font-medium">No operators yet</p>
          </div>
        )}
      </div>

      {(showAddModal || editingOp) && (
        <OperatorModal
          operator={editingOp}
          branchId={branchId}
          onClose={() => { setShowAddModal(false); setEditingOp(null) }}
          onSave={async (data) => {
            if (editingOp) {
              await updateOperator(editingOp.id, data)
            } else if (branchId && data.name && data.pin) {
              await createOperator({ branch_id: branchId, name: data.name, pin: data.pin, role: data.role || 'operator' })
            }
            runSyncCycle().catch(() => {})
            loadOperators()
            setShowAddModal(false)
            setEditingOp(null)
          }}
        />
      )}
    </div>
  )
}

interface OperatorModalProps {
  operator: Operator | null
  branchId: string | null
  onClose: () => void
  onSave: (data: { name?: string; pin?: string; role?: 'admin' | 'operator' }) => void
}

function OperatorModal({ operator, onClose, onSave }: OperatorModalProps) {
  const [name, setName] = useState(operator?.name || '')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<'admin' | 'operator'>(operator?.role || 'operator')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name: name.trim() || undefined,
      pin: pin || undefined,
      role: role,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-base rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline text-xl font-bold text-on-surface">
            {operator ? 'Edit Operator' : 'Add Operator'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-outline-variant transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
              placeholder="Operator name"
            />
          </div>
          {!operator && (
            <>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">PIN (min 4 digits)</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  minLength={4}
                  className="w-full px-3 py-2.5 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
                  placeholder="----"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'operator')}
                  className="w-full px-3 py-2.5 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
                >
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </>
          )}
          {operator && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">New PIN (leave blank to keep current)</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                minLength={4}
                className="w-full px-3 py-2.5 rounded-md border border-outline-variant bg-surface-base text-sm focus:outline-none focus:border-primary"
                placeholder="----"
              />
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-md border border-outline-variant text-on-surface font-medium hover:bg-outline-variant/30">
              Cancel
            </button>
            <button type="submit" className="flex-1 py-2.5 rounded-md bg-primary text-white font-semibold hover:opacity-90">
              {operator ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
