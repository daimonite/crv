import { supabase, isConfigured } from './supabase'
import { queryDb, executeDb, generateId, nowIso } from './database'
import { useSyncStore } from './store'
import type { DashboardStats } from '../types'

let Ie: any = null
const SESSION_KEY = 'cervos_supabase_session'

async function saveSession(session: any): Promise<void> {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

async function loadSession(): Promise<any> {
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load session:', e)
  }
  return null
}

export async function saveSetting(n: string, t: string): Promise<void> {
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [n, JSON.stringify(t)]
  )
}

export async function getLastPullTimestamp(n: string): Promise<string | null> {
  const result = await queryDb(
    'SELECT value FROM app_settings WHERE key = ?',
    [`last_pull_${n}`]
  )
  return result.length > 0 ? result[0].value : null
}

export async function setLastPullTimestamp(n: string, t: string): Promise<void> {
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`last_pull_${n}`, t]
  )
}

export async function ensureLinked(): Promise<boolean> {
  if (!isConfigured) return false
  const storedSession = await loadSession()
  if (storedSession) {
    Ie = supabase
    const { data } = await Ie.auth.getSession()
    if (!data.session) {
      Ie = null
      await saveSession(null)
      return false
    }
    return true
  }
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    Ie = supabase
    await saveSession(data.session)
    return true
  }
  return false
}

export async function signIn(
  n: string,
  t: string
): Promise<void> {
  if (!isConfigured) throw new Error('POS not configured — Supabase keys missing. Rebuild the app with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see cervos-desktop/.env).')
  Ie = supabase
  const { error, data } = await Ie.auth.signInWithPassword({
    email: n,
    password: t,
  })
  if (error) {
    Ie = null
    throw new Error(error.message)
  }
  if (data.session) {
    await saveSession(data.session)
  }
}

export interface RemoteBranch {
  id: string
  name: string
  address: string | null
}

export interface LinkStatus {
  // true only when this device already has a valid, still-existing branch_id
  // saved locally — in that case there's nothing left to do.
  alreadyLinked: boolean
  // The signed-in account's REAL branches, as they exist in the pharmacy
  // portal right now — never fabricated. Onboarding presents these for the
  // operator to pick from; it must never invent a new branch from typed text.
  branches: RemoteBranch[]
}

/**
 * Call after signIn(). Looks at the real pharmacy account behind the
 * credentials just used and returns its actual branches from Supabase, so
 * the caller can let the operator pick which existing branch this specific
 * POS terminal belongs to. This deliberately does NOT create anything —
 * a POS device should never be able to invent a pharmacy location that
 * doesn't already exist in the web portal.
 */
export async function getLinkStatus(): Promise<LinkStatus> {
  if (!Ie) throw new Error('Not linked to Supabase — please sign in again.')
  const { data: user } = await Ie.auth.getUser()
  if (!user.user) throw new Error('No authenticated user found. Please sign in again.')

  const { data: account } = await Ie
    .from('accounts')
    .select('id')
    .eq('auth_user_id', user.user.id)
    .maybeSingle()

  if (!account) throw new Error('No pharmacy account found for this login. Create one at cervos.online/auth first.')

  // Already provisioned on this device, and that branch still exists remotely?
  const existingBranch = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
  if (existingBranch.length > 0) {
    try {
      const existingId = JSON.parse(existingBranch[0].value) as string
      const { data: existing } = await Ie.from('branches').select('id').eq('id', existingId).maybeSingle()
      if (existing) return { alreadyLinked: true, branches: [] }
    } catch { /* ignore parse error, fall through to re-link */ }
  }

  const { data: branches, error } = await Ie
    .from('branches')
    .select('id, name, address')
    .eq('account_id', account.id)
    .order('name')

  if (error) throw new Error(error.message)

  return { alreadyLinked: false, branches: (branches ?? []) as RemoteBranch[] }
}

/**
 * Links this device to a specific EXISTING branch the operator picked —
 * pulls that branch's real name/address down for local display. Never
 * writes a new row to `branches`; the pharmacy portal is the only place a
 * branch gets created.
 */
export async function linkToExistingBranch(branchId: string): Promise<void> {
  if (!Ie) throw new Error('Not linked to Supabase — please sign in again.')

  const { data: branch, error } = await Ie
    .from('branches')
    .select('id, name, address, account_id')
    .eq('id', branchId)
    .maybeSingle()

  if (error || !branch) throw new Error('That branch could not be found — it may have been removed from the portal.')

  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['branch_id', JSON.stringify(branch.id)]
  )
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['account_id', JSON.stringify(branch.account_id)]
  )
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['centre_name', JSON.stringify(branch.name)]
  )
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['centre_address', JSON.stringify(branch.address ?? '')]
  )
}

/**
 * Backwards-compatibility helper for any components still calling linkBranch().
 * Links to the first branch found if not already linked.
 */
export async function linkBranch(): Promise<void> {
  const isLinked = await ensureLinked()
  if (isLinked) {
    const status = await getLinkStatus()
    if (!status.alreadyLinked && status.branches.length > 0) {
      await linkToExistingBranch(status.branches[0].id)
    }
  }
}

export async function signOut(): Promise<void> {
  try {
    await Ie?.auth.signOut()
  } catch (e) {
    console.error('Sign out error:', e)
  }
  Ie = null
  await saveSession(null)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const linked = await ensureLinked()
  const pendingResult = await queryDb('SELECT COUNT(*) AS c FROM sync_queue')
  const pendingCount = pendingResult[0]?.c ?? 0
  const lastSyncResult = await queryDb(
    "SELECT value FROM app_settings WHERE key = 'last_synced_at'"
  )
  const lastSyncedAt = lastSyncResult[0]?.value ?? null

  return {
    linked,
    pendingCount,
    lastSyncedAt,
    isSyncing: false,
  }
}

export async function hashString(n: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(n)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function queueForSync(tableName: string, rowId: string, operation: string, payload: any): Promise<void> {
  const id = generateId()
  await executeDb(
    `INSERT INTO sync_queue (id, table_name, row_id, operation, payload, created_at, attempts) VALUES (?,?,?,?,?,?,?)`,
    [id, tableName, rowId, operation, JSON.stringify(payload), nowIso(), 0]
  )
}

export async function isPharmacyConfigured(): Promise<boolean> {
  const result = await queryDb("SELECT value FROM app_settings WHERE key = 'pharmacy_name'")
  return result.length > 0
}

export function getSupabase() {
  return Ie || supabase
}

export async function syncSubscription(branchId: string): Promise<void> {
  if (!Ie || !isConfigured) return

  try {
    const { data: branch } = await Ie
      .from('branches')
      .select('subscription_status, subscription_tier, grace_ends_at, trial_ends_at')
      .eq('id', branchId)
      .maybeSingle()

    if (branch) {
      await saveSetting('subscription_status', JSON.stringify(branch.subscription_status))
      await saveSetting('subscription_tier', JSON.stringify(branch.subscription_tier))
      await saveSetting('grace_ends_at', JSON.stringify(branch.grace_ends_at))
      await saveSetting('trial_ends_at', JSON.stringify(branch.trial_ends_at))
    }
  } catch (error) {
    console.error('Failed to sync subscription:', error)
  }
}

export async function checkSubscriptionBlocked(): Promise<{ blocked: boolean; reason?: string }> {
  const statusResult = await queryDb("SELECT value FROM app_settings WHERE key = 'subscription_status'")
  const graceResult = await queryDb("SELECT value FROM app_settings WHERE key = 'grace_ends_at'")

  const status = statusResult.length > 0 ? JSON.parse(statusResult[0].value) : 'trial'

  if (status === 'locked') {
    return { blocked: true, reason: 'Branch locked by HQ' }
  }

  if (status === 'inactive') {
    if (graceResult.length > 0) {
      const graceEndsAt = JSON.parse(graceResult[0].value)
      if (graceEndsAt && new Date() > new Date(graceEndsAt)) {
        return { blocked: true, reason: 'Subscription grace period has expired' }
      }
    }
    return { blocked: false }
  }

  if (status === 'past_due') {
    return { blocked: true, reason: 'Subscription payment is past due' }
  }

  return { blocked: false }
}

// ─── Push (upload local queue to Supabase) ──────────────────────────────────
// Batched per table+operation so a cycle makes at most a handful of requests
// instead of one per row — important on Supabase free tier.

export async function processSyncQueue(): Promise<{ uploaded: number; failed: number }> {
  return bulkPush()
}

async function bulkPush(): Promise<{ uploaded: number; failed: number }> {
  if (!Ie) return { uploaded: 0, failed: 0 }
  const queue = await queryDb('SELECT * FROM sync_queue ORDER BY created_at ASC')
  if (queue.length === 0) return { uploaded: 0, failed: 0 }

  const groups: Record<string, { item: any; payload: any }[]> = {}
  for (const item of queue) {
    try {
      const payload = JSON.parse(item.payload)
      const key = `${item.table_name}:${item.operation}`
      ;(groups[key] ||= []).push({ item, payload })
    } catch {
      await queryDb('DELETE FROM sync_queue WHERE id = ?', [item.id])
    }
  }

  let uploaded = 0
  let failed = 0
  for (const key of Object.keys(groups)) {
    const [table_name, operation] = key.split(':')
    const entries = groups[key]
    try {
      if (operation === 'insert' || operation === 'update' || operation === 'upsert') {
        const rows = entries.map((e) => e.payload)
        const { error } = await Ie.from(table_name).upsert(rows, { onConflict: 'id' })
        if (error) throw error
      } else if (operation === 'delete') {
        const ids = entries.map((e) => e.item.row_id)
        const { error } = await Ie.from(table_name).delete().in('id', ids)
        if (error) throw error
      } else {
        throw new Error('unknown operation')
      }
      for (const e of entries) await queryDb('DELETE FROM sync_queue WHERE id = ?', [e.item.id])
      uploaded += entries.length
    } catch {
      failed += entries.length
    }
  }

  if (uploaded > 0) {
    await saveSetting('last_synced_at', JSON.stringify(new Date().toISOString()))
  }
  return { uploaded, failed }
}

// ─── Pull (download delta from Supabase into local SQLite) ──────────────────
// Done directly against the authed client because the server /api/sync route
// authenticates via session cookies, which the desktop fetch cannot supply.

async function upsertLocal(table: string, row: Record<string, any>): Promise<void> {
  const cols = Object.keys(row)
  const colList = cols.join(', ')
  const placeholders = cols.map(() => '?').join(', ')
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')
  await executeDb(
    `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
    cols.map((c) => (row[c] === undefined ? null : row[c]))
  )
}

async function applyCommand(cmd: any): Promise<void> {
  const c = cmd.command
  if (c === 'lock_branch' || c === 'suspend_branch') {
    await saveSetting('subscription_status', JSON.stringify('locked'))
    await saveSetting('locked_reason', JSON.stringify(cmd.reason ?? 'hq_command'))
  } else if (c === 'unlock_branch') {
    await saveSetting('subscription_status', JSON.stringify('active'))
    await saveSetting('locked_reason', JSON.stringify(null))
  }
  // force_sync is naturally handled by the next cycle
}

async function applyPulledData(data: any): Promise<void> {
  for (const p of data.products || []) {
    await upsertLocal('products', {
      id: p.id,
      generic_name: p.generic_name,
      brand_name: p.brand_name ?? '',
      category: p.category ?? '',
      formulation: p.formulation ?? null,
      requires_prescription: p.requires_prescription ? 1 : 0,
      barcode: p.barcode ?? null,
      default_expiry: p.default_expiry ?? null,
      default_cost_price: p.default_cost_price ?? null,
      default_sale_price: p.default_sale_price ?? null,
      updated_at: p.updated_at,
    })
  }
  for (const b of data.batches || []) {
    await upsertLocal('batches', {
      id: b.id,
      branch_id: b.branch_id,
      product_id: b.product_id,
      batch_number: b.batch_number ?? null,
      quantity: b.quantity ?? 0,
      cost_price: b.cost_price ?? 0,
      sale_price: b.sale_price ?? 0,
      expiry_date: b.expiry_date ?? null,
      sync_version: b.sync_version ?? 1,
      updated_at: b.updated_at,
    })
  }
  for (const op of data.operators || []) {
    await upsertLocal('operators', {
      id: op.id,
      branch_id: op.branch_id,
      name: op.name,
      pin_hash: op.pin_hash,
      role: op.role,
      created_at: op.created_at ?? null,
    })
  }
  // NOTE: this only creates/updates operators locally. An operator deleted on the
  // web dashboard is NOT removed from the desktop's local SQLite by this cycle —
  // reconciling deletes safely (without racing a not-yet-pushed local create) needs
  // a tombstone/deleted_at approach on the operators table, not implemented here.
  for (const cmd of data.commands || []) {
    await applyCommand(cmd)
  }
  for (const o of data.orders || []) {
    await upsertLocal('orders', {
      id: o.id,
      order_reference: o.order_reference,
      // to-one embed: accounts!seller_id(name) — a Supabase object, not an array
      // (see the "to-one embeds return objects, not arrays" fix applied web-side).
      supplier_name: o.accounts?.name ?? 'Supplier',
      currency: o.currency ?? 'TZS',
      status: o.status,
      note: o.note ?? null,
      placed_at: o.placed_at ?? null,
      supplier_approved_at: o.supplier_approved_at ?? null,
      confirmed_at: o.confirmed_at ?? null,
      shipped_at: o.shipped_at ?? null,
      delivered_at: o.delivered_at ?? null,
      cancelled_at: o.cancelled_at ?? null,
      updated_at: o.updated_at ?? null,
    })
  }
  for (const li of data.orderLineItems || []) {
    await upsertLocal('order_line_items', {
      id: li.id,
      order_id: li.order_id,
      product_name: li.product_name,
      quantity: li.quantity,
      unit_price: li.unit_price,
    })
  }
  for (const n of data.notifications || []) {
    await upsertLocal('notifications', {
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      route: n.route ?? null,
      action: n.action ?? null,
      admin_only: n.admin_only ? 1 : 0,
      read: n.read ? 1 : 0,
      created_at: n.created_at,
    })
  }
}

// ─── Full sync cycle (pull + push + subscription + commands) ─────────────────

let _autoTimer: any = null
let _cleanupAuto: (() => void) | null = null
let _failStreak = 0
let _syncing = false
const BASE_INTERVAL = 5 * 60 * 1000
const MAX_BACKOFF = 30 * 60 * 1000
const FIRST_DELAY = 8000

export async function runSyncCycle(): Promise<{ ok: boolean; pulled?: number; pushed?: number; message?: string }> {
  if (typeof window === 'undefined') return { ok: false, message: 'no window' }
  if (_syncing) return { ok: false, message: 'already syncing' }
  const linked = await ensureLinked()
  if (!linked || !Ie) return { ok: false, message: 'not linked' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, message: 'offline' }

  _syncing = true
  useSyncStore.getState().setSyncing(true)
  try {
    const branchResult = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    if (!branchResult.length) return { ok: false, message: 'no branch' }
    const branchId = JSON.parse(branchResult[0].value)
    const accountResult = await queryDb("SELECT value FROM app_settings WHERE key = 'account_id'")
    const accountId = accountResult.length ? JSON.parse(accountResult[0].value) : null
    if (!accountId) return { ok: false, message: 'no account' }

    const since = (await getLastPullTimestamp(branchId)) || '1970-01-01T00:00:00Z'

    const [prodRes, batchRes, cmdRes, branchRes, opRes, orderRes] = await Promise.all([
      Ie.from('products').select('*').gt('updated_at', since),
      Ie.from('batches').select('*').eq('branch_id', branchId).gt('updated_at', since),
      Ie.from('branch_commands').select('*').eq('branch_id', branchId).eq('status', 'pending'),
      Ie.from('branches')
        .select('subscription_status, subscription_tier, grace_ends_at, trial_ends_at, locked_reason')
        .eq('id', branchId)
        .maybeSingle(),
      // operators has no updated_at column to filter incrementally on, and per-branch
      // counts are small, so pull the full set for this branch every cycle.
      Ie.from('operators').select('*').eq('branch_id', branchId),
      // Orders placed by this branch — status changes (approved/confirmed/
      // shipped/delivered) bump updated_at web-side, so this is a proper
      // incremental delta, not a full re-pull every cycle.
      Ie.from('orders')
        .select('id, order_reference, currency, status, note, placed_at, supplier_approved_at, confirmed_at, shipped_at, delivered_at, cancelled_at, updated_at, accounts!seller_id(name)')
        .eq('buyer_branch_id', branchId)
        .gt('updated_at', since),
    ])

    const products = prodRes.data || []
    const batches = batchRes.data || []
    const commands = cmdRes.data || []
    const branch = branchRes.data || null
    const operators = opRes.data || []
    const orders = orderRes.data || []

    // Line items never change after order creation, so it's enough to pull
    // them only for orders that just changed in this same cycle.
    let orderLineItems: any[] = []
    if (orders.length > 0) {
      const liRes = await Ie
        .from('order_line_items')
        .select('id, order_id, product_name, quantity, unit_price')
        .in('order_id', orders.map((o: any) => o.id))
      orderLineItems = liRes.data || []
    }

    // Notifications for this pharmacy account (order approved/paid, low
    // stock, etc.) — a simple bounded pull rather than a delta, since the
    // volume per account is small and "read" state can flip without
    // touching created_at.
    const notifRes = await Ie
      .from('notifications')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100)
    const notifications = notifRes.data || []

    const pulled = products.length + batches.length + commands.length + operators.length + orders.length + notifications.length

    await applyPulledData({ products, batches, commands, branch, operators, orders, orderLineItems, notifications })

    if (commands.length > 0) {
      await Ie.from('branch_commands')
        .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
        .eq('branch_id', branchId)
        .eq('status', 'pending')
    }

    if (branch) {
      await saveSetting('subscription_status', JSON.stringify(branch.subscription_status))
      await saveSetting('subscription_tier', JSON.stringify(branch.subscription_tier ?? null))
      await saveSetting('grace_ends_at', JSON.stringify(branch.grace_ends_at ?? null))
      await saveSetting('trial_ends_at', JSON.stringify(branch.trial_ends_at ?? null))
      await saveSetting('locked_reason', JSON.stringify(branch.locked_reason ?? null))
    }

    const pushed = await bulkPush()

    const nowIso = new Date().toISOString()
    await setLastPullTimestamp(branchId, nowIso)
    await saveSetting('last_synced_at', JSON.stringify(nowIso))

    const block = await checkSubscriptionBlocked()
    useSyncStore.getState().setBlocked(block.blocked, block.reason ?? null)
    useSyncStore.getState().setLastSyncAt(nowIso)
    const pendingRes = await queryDb('SELECT COUNT(*) AS c FROM sync_queue')
    useSyncStore.getState().setPending(pendingRes[0]?.c ?? 0)

    _failStreak = 0
    return { ok: true, pulled, pushed: pushed.uploaded }
  } catch (e: any) {
    _failStreak++
    return { ok: false, message: e?.message || 'sync error' }
  } finally {
    _syncing = false
    useSyncStore.getState().setSyncing(false)
  }
}

// ─── Auto-sync scheduler (free-tier friendly) ───────────────────────────────
// - One cycle at a time (no overlap)
// - Base interval 5 min; on failure, exponential backoff capped at 30 min
// - Also fires on tab focus / network reconnect (debounced by the single-flight guard)
// - Skips entirely when offline or not linked

export function startAutoSync(): void {
  if (_autoTimer) return

  const tick = async () => {
    try {
      await runSyncCycle()
    } catch {
      /* swallow — backoff handles retries */
    }
    const next = _failStreak > 0
      ? Math.min(BASE_INTERVAL * Math.pow(2, _failStreak), MAX_BACKOFF)
      : BASE_INTERVAL
    _autoTimer = setTimeout(tick, next)
  }
  _autoTimer = setTimeout(tick, FIRST_DELAY)

  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      runSyncCycle().catch(() => {})
    }
  }
  const onOnline = () => runSyncCycle().catch(() => {})

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline)

  _cleanupAuto = () => {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
  }
}

export function stopAutoSync(): void {
  if (_autoTimer) {
    clearTimeout(_autoTimer)
    _autoTimer = null
  }
  if (_cleanupAuto) {
    _cleanupAuto()
    _cleanupAuto = null
  }
}
