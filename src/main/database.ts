import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

let db: SqlJsDatabase
let dbPath: string

function findWasmFile(): string | undefined {
  // In dev mode, the WASM file is in node_modules
  // In production, it's alongside the bundled main process or in node_modules
  const candidates = [
    join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(dirname(process.execPath), 'resources', 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(dirname(process.execPath), 'resources', 'app', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(process.resourcesPath || '', 'app', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      console.log('[DB] Found WASM at:', candidate)
      return candidate
    }
  }
  console.log('[DB] WASM not found at any candidate path, falling back to default resolution')
  return undefined
}

export async function initDatabase(): Promise<void> {
  console.log('[DB] Initializing database...')

  const wasmFile = findWasmFile()
  const initOptions: Record<string, unknown> = {}
  if (wasmFile) {
    initOptions.locateFile = () => wasmFile
  }

  const SQL = await initSqlJs(initOptions as Parameters<typeof initSqlJs>[0])
  console.log('[DB] sql.js initialized')

  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  dbPath = join(userData, 'flashcards.db')
  console.log('[DB] Database path:', dbPath)

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
    console.log('[DB] Loaded existing database')
  } else {
    db = new SQL.Database()
    console.log('[DB] Created new database')
  }

  db.run('PRAGMA foreign_keys = ON')
  runMigrations()
  saveDb()
  console.log('[DB] Database ready')
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function saveDb(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

function runMigrations(): void {
  // Folders table
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Migration: add folder_id to decks if missing
  try {
    const cols = db.exec("PRAGMA table_info(decks)")
    if (cols.length > 0) {
      const hasFolderId = cols[0].values.some((row) => row[1] === 'folder_id')
      if (!hasFolderId) {
        db.run('ALTER TABLE decks ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL')
      }
    }
  } catch { /* ignore */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      front_content TEXT NOT NULL DEFAULT '{"markdown":"","drawing":null}',
      back_content TEXT NOT NULL DEFAULT '{"markdown":"","drawing":null}',
      ease_factor REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      repetition INTEGER DEFAULT 0,
      next_review TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review)')
  db.run('CREATE INDEX IF NOT EXISTS idx_cards_sort ON cards(sort_order)')
  db.run('CREATE INDEX IF NOT EXISTS idx_review_history_card ON review_history(card_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_card_tags_card ON card_tags(card_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_tags_deck ON tags(deck_id)')

  db.run(`
    CREATE TABLE IF NOT EXISTS review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      grade INTEGER NOT NULL,
      ease_factor_before REAL,
      ease_factor_after REAL,
      interval_before INTEGER,
      interval_after INTEGER,
      time_taken_ms INTEGER DEFAULT 0,
      reviewed_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Tags table
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6b7280',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS card_tags (
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (card_id, tag_id)
    )
  `)

  // Card templates table
  db.run(`
    CREATE TABLE IF NOT EXISTS card_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      front_content TEXT NOT NULL DEFAULT '{"markdown":"","drawing":null}',
      back_content TEXT NOT NULL DEFAULT '{"markdown":"","drawing":null}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Migration: add time_taken_ms if missing (existing databases)
  try {
    const cols = db.exec("PRAGMA table_info(review_history)")
    if (cols.length > 0) {
      const hasTimeTaken = cols[0].values.some((row) => row[1] === 'time_taken_ms')
      if (!hasTimeTaken) {
        db.run('ALTER TABLE review_history ADD COLUMN time_taken_ms INTEGER DEFAULT 0')
      }
    }
  } catch { /* ignore */ }

  // Migration: add sort_order columns for drag-and-drop reordering
  const addSortOrder = (table: string) => {
    try {
      const cols = db.exec(`PRAGMA table_info(${table})`)
      if (cols.length > 0) {
        const has = cols[0].values.some((row) => row[1] === 'sort_order')
        if (!has) {
          db.run(`ALTER TABLE ${table} ADD COLUMN sort_order INTEGER DEFAULT 0`)
        }
      }
    } catch { /* ignore */ }
  }
  addSortOrder('decks')
  addSortOrder('cards')
  addSortOrder('folders')
}
