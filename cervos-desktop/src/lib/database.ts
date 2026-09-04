let db: any = null
let SQL: any = null

// Vite resolves this at build time to the correct hashed asset URL, which
// works with Tauri's tauri://localhost/ custom protocol on Windows.
import sqlWasmUrl from '/sql-wasm.wasm?url'

const DB_KEY = 'cervos_db'

export async function initDb(): Promise<void> {
  if (db) return

  try {
    const initSqlJs = (await import('sql.js')).default

    const locateWasm = (file: string) => {
      if (file === 'sql-wasm.wasm') return sqlWasmUrl
      return `https://cdn.jsdelivr.net/npm/sql.js/dist/${file}`
    }

    SQL = await initSqlJs({ locateFile: locateWasm })

    const savedDb = localStorage.getItem(DB_KEY)
    if (savedDb) {
      try {
        const data = Uint8Array.from(atob(savedDb), (c) => c.charCodeAt(0))
        db = new SQL.Database(data)
      } catch {
        db = new SQL.Database()
      }
    } else {
      db = new SQL.Database()
    }

    await runMigrations()
    saveDb()
  } catch (err) {
    console.error('initDb failed:', err)
    try {
      db = new SQL.Database()
      await runMigrations()
    } catch {
      console.error('Failed to create database')
    }
  }
}

function saveDb(): void {
  if (!db) return
  const data = db.export()
  // Converting the whole exported DB to a binary string via
  // String.fromCharCode(...data) blows the call stack once the array gets
  // large enough — spreading a big typed array into individual function
  // arguments hits the JS engine's argument-count limit ("Maximum call
  // stack size exceeded"). This grows with real usage (more products,
  // batches, orders, notifications), so it will eventually trip even if it
  // didn't before. Converting in fixed-size chunks avoids the limit
  // entirely regardless of how large the database gets.
  const CHUNK_SIZE = 0x8000 // 32768 bytes per chunk
  let binary = ''
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...data.subarray(i, i + CHUNK_SIZE))
  }
  try {
    localStorage.setItem(DB_KEY, btoa(binary))
  } catch (err) {
    // localStorage has a hard per-origin quota (commonly 5-10MB). The whole
    // SQLite DB is stored here as base64, so it can eventually exceed that
    // quota as real data accumulates over time — that's a separate,
    // larger problem (moving persistence to an actual file via
    // @tauri-apps/plugin-fs, already a project dependency, instead of
    // localStorage) that should be addressed before this becomes a
    // recurring failure, not patched further here.
    console.error('saveDb: localStorage write failed (possibly over quota):', err)
  }
}

async function runMigrations(): Promise<void> {
  if (!db) return

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      name TEXT NOT NULL,
      lat REAL,
      lng REAL,
      subscription_status TEXT DEFAULT 'trial',
      subscription_tier TEXT DEFAULT 'free',
      trial_ends_at TEXT,
      payment_due_at TEXT,
      grace_ends_at TEXT,
      last_synced_at TEXT,
      updated_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      generic_name TEXT NOT NULL,
      brand_name TEXT,
      category TEXT,
      formulation TEXT,
      requires_prescription INTEGER DEFAULT 0,
      barcode TEXT,
      updated_at TEXT,
      default_expiry TEXT,
      default_cost_price REAL,
      default_sale_price REAL,
      low_stock_threshold INTEGER DEFAULT 10,
      notify_threshold INTEGER DEFAULT 5
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      product_id TEXT NOT NULL,
      batch_number TEXT,
      quantity INTEGER DEFAULT 0,
      cost_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      expiry_date TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      name TEXT NOT NULL,
      pin_hash TEXT,
      role TEXT DEFAULT 'operator',
      created_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      operator_id TEXT,
      total REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      tender REAL DEFAULT 0,
      change_due REAL DEFAULT 0,
      payment_method TEXT,
      payment_ref TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0,
      sync_error TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      created_at TEXT,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      operator_id TEXT,
      opened_at TEXT,
      closed_at TEXT,
      expected_cash REAL DEFAULT 0,
      counted_cash REAL,
      synced INTEGER DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      operator_id TEXT,
      actor TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      detail TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT,
      row_id TEXT,
      operation TEXT,
      payload TEXT,
      created_at TEXT,
      attempts INTEGER DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      kind TEXT,
      title TEXT,
      body TEXT,
      route TEXT,
      action TEXT,
      admin_only INTEGER DEFAULT 0,
      read INTEGER DEFAULT 0,
      created_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_reference TEXT,
      supplier_name TEXT,
      currency TEXT DEFAULT 'TZS',
      status TEXT DEFAULT 'pending',
      note TEXT,
      placed_at TEXT,
      approved_at TEXT,
      confirmed_at TEXT,
      shipped_at TEXT,
      delivered_at TEXT,
      cancelled_at TEXT,
      updated_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS order_line_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_name TEXT,
      quantity INTEGER DEFAULT 0,
      unit_price REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)

  const operatorCheck = db.exec('SELECT COUNT(*) as count FROM operators')
  const operatorCount = operatorCheck.length > 0 && operatorCheck[0].values.length > 0 ? operatorCheck[0].values[0][0] : 0
  if (operatorCount === 0) {
    const branchCheck = db.exec("SELECT COUNT(*) as count FROM app_settings WHERE key = 'branch_id'")
    const hasBranch = branchCheck.length > 0 && branchCheck[0].values.length > 0 && branchCheck[0].values[0][0] > 0
    if (!hasBranch) {
      const defaultId = crypto.randomUUID()
      db.run(
        `INSERT INTO app_settings (key, value) VALUES ('branch_id', ?)`,
        [JSON.stringify(defaultId)]
      )
    }
  }

  // Idempotent column additions for databases created before these columns existed
  const addColumn = (table: string, column: string, definition: string) => {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    } catch (e) {
      // Column likely already exists â€” safe to ignore
    }
  }
  addColumn('products', 'formulation', 'TEXT')
  addColumn('products', 'default_expiry', 'TEXT')
  addColumn('products', 'default_cost_price', 'REAL')
  addColumn('products', 'default_sale_price', 'REAL')
  addColumn('batches', 'batch_number', 'TEXT')
  addColumn('batches', 'updated_at', 'TEXT')
  addColumn('products', 'low_stock_threshold', 'INTEGER DEFAULT 10')
  addColumn('products', 'notify_threshold', 'INTEGER DEFAULT 5')
}

export async function queryDb(sql: string, params: any[] = [], timeoutMs = 5000): Promise<any[]> {
  if (!db) {
    const initPromise = initDb()
    const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('initDb timeout')), timeoutMs))
    await Promise.race([initPromise, timeout])
  }
  if (!db) return []
  try {
    const stmt = db.prepare(sql)
    if (params.length > 0) stmt.bind(params)
    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  } catch (err) {
    console.error('queryDb error:', err)
    return []
  }
}

export async function executeDb(sql: string, params: any[] = []): Promise<void> {
  if (!db) await initDb()
  if (!db) throw new Error('Database not initialized — sql.js failed to load.')
  db.run(sql, params)
  saveDb()
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
