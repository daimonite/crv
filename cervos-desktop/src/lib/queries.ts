import { queryDb, executeDb, generateId } from './database'
import { queueForSync } from './sync'
import type { Operator, Branch } from '../types'

export async function fetchOperator(id: string): Promise<Operator | null> {
  const results = await queryDb('SELECT * FROM operators WHERE id = ?', [id])
  return results.length > 0 ? results[0] : null
}

export async function fetchOperators(branchId: string): Promise<Operator[]> {
  return queryDb('SELECT * FROM operators WHERE branch_id = ? ORDER BY name', [branchId])
}

export async function validateOperatorPin(a: string, b: string, c?: string): Promise<Operator | null> {
  // Supports: validateOperatorPin(operatorId, pin) and legacy validateOperatorPin(operatorId, branchId, pin)
  const operatorId = a
  const pin = c !== undefined ? c : b
  const op = await fetchOperator(operatorId)
  if (!op) return null
  const hash = await hashPin(pin)
  if (op.pin_hash === hash) return op
  return null
}

export async function createOperator(data: {
  branch_id: string
  name: string
  pin: string
  role: 'admin' | 'operator'
}): Promise<Operator> {
  const id = generateId()
  const pinHash = await hashPin(data.pin)
  const created_at = new Date().toISOString()
  await executeDb(
    'INSERT INTO operators (id, branch_id, name, pin_hash, role, created_at) VALUES (?,?,?,?,?,?)',
    [id, data.branch_id, data.name, pinHash, data.role, created_at]
  )
  await queueForSync('operators', id, 'insert', {
    id, branch_id: data.branch_id, name: data.name, pin_hash: pinHash, role: data.role, created_at,
  })
  return { id, branch_id: data.branch_id, name: data.name, pin_hash: pinHash, role: data.role, created_at }
}

export async function updateOperator(id: string, data: { name?: string; pin?: string; role?: 'admin' | 'operator' }): Promise<void> {
  if (data.name !== undefined) {
    await executeDb('UPDATE operators SET name = ? WHERE id = ?', [data.name, id])
  }
  if (data.pin !== undefined) {
    const hash = await hashPin(data.pin)
    await executeDb('UPDATE operators SET pin_hash = ? WHERE id = ?', [hash, id])
  }
  if (data.role !== undefined) {
    await executeDb('UPDATE operators SET role = ? WHERE id = ?', [data.role, id])
  }
  const updated = await fetchOperator(id)
  if (updated) {
    await queueForSync('operators', id, 'update', {
      id: updated.id, branch_id: updated.branch_id, name: updated.name, pin_hash: updated.pin_hash,
      role: updated.role, created_at: updated.created_at,
    })
  }
}

export async function deleteOperator(id: string): Promise<void> {
  await executeDb('DELETE FROM operators WHERE id = ?', [id])
  await queueForSync('operators', id, 'delete', { id })
}

export async function fetchBranch(id: string): Promise<Branch | null> {
  const results = await queryDb('SELECT * FROM branches WHERE id = ?', [id])
  return results.length > 0 ? results[0] : null
}

export async function fetchBranchSubscription(branchId: string): Promise<{
  subscription_status: string
  subscription_tier: string
  grace_ends_at: string | null
  locked_reason: string | null
} | null> {
  // Subscription/lock state lives in app_settings, not the local `branches`
  // row (which has no locked_reason column) — app_settings is what every
  // sync cycle writes to from the real branches row in Supabase, and it's
  // also what an instant HQ lock command updates directly, so it's the
  // more current of the two for this device's own branch.
  void branchId
  const statusRes = await queryDb("SELECT value FROM app_settings WHERE key = 'subscription_status'")
  if (statusRes.length === 0) return null
  const tierRes = await queryDb("SELECT value FROM app_settings WHERE key = 'subscription_tier'")
  const graceRes = await queryDb("SELECT value FROM app_settings WHERE key = 'grace_ends_at'")
  const lockedRes = await queryDb("SELECT value FROM app_settings WHERE key = 'locked_reason'")
  return {
    subscription_status: JSON.parse(statusRes[0].value) || 'trial',
    subscription_tier: tierRes.length ? JSON.parse(tierRes[0].value) || 'free' : 'free',
    grace_ends_at: graceRes.length ? JSON.parse(graceRes[0].value) : null,
    locked_reason: lockedRes.length ? JSON.parse(lockedRes[0].value) : null,
  }
}

export async function updateBranchSubscription(branchId: string, data: {
  subscription_status?: string
  subscription_tier?: string
  grace_ends_at?: string
}): Promise<void> {
  if (data.subscription_status !== undefined) {
    await executeDb('UPDATE branches SET subscription_status = ? WHERE id = ?', [data.subscription_status, branchId])
  }
  if (data.subscription_tier !== undefined) {
    await executeDb('UPDATE branches SET subscription_tier = ? WHERE id = ?', [data.subscription_tier, branchId])
  }
  if (data.grace_ends_at !== undefined) {
    await executeDb('UPDATE branches SET grace_ends_at = ? WHERE id = ?', [data.grace_ends_at, branchId])
  }
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
