import { getDb, saveDb } from '../database'

export interface Deck {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface DeckStats {
  total: number
  due: number
  new_cards: number
}

function rowToDeck(row: unknown[]): Deck {
  return {
    id: row[0] as number,
    name: row[1] as string,
    description: row[2] as string,
    created_at: row[3] as string,
    updated_at: row[4] as string
  }
}

function queryAll(sql: string, params: unknown[] = []): unknown[][] {
  const stmt = getDb().prepare(sql)
  if (params.length) stmt.bind(params)
  const rows: unknown[][] = []
  while (stmt.step()) {
    rows.push(stmt.get())
  }
  stmt.free()
  return rows
}

function queryOne(sql: string, params: unknown[] = []): unknown[] | null {
  const stmt = getDb().prepare(sql)
  if (params.length) stmt.bind(params)
  const result = stmt.step() ? stmt.get() : null
  stmt.free()
  return result
}

function runSql(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params)
  saveDb()
}

export function getAllDecks(): Deck[] {
  return queryAll('SELECT * FROM decks ORDER BY updated_at DESC').map(rowToDeck)
}

export function createDeck(name: string, description = ''): Deck {
  const db = getDb()
  db.run('INSERT INTO decks (name, description) VALUES (?, ?)', [name, description])
  // Get ID immediately before saveDb() resets last_insert_rowid
  const idStmt = db.prepare('SELECT last_insert_rowid()')
  idStmt.step()
  const id = idStmt.get()![0] as number
  idStmt.free()
  saveDb()
  return rowToDeck(queryOne('SELECT * FROM decks WHERE id = ?', [id])!)
}

export function renameDeck(id: number, name: string): Deck {
  runSql("UPDATE decks SET name = ?, updated_at = datetime('now') WHERE id = ?", [name, id])
  return rowToDeck(queryOne('SELECT * FROM decks WHERE id = ?', [id])!)
}

export function deleteDeck(id: number): void {
  // Manual cascade since sql.js foreign key cascade can be unreliable
  const cards = queryAll('SELECT id FROM cards WHERE deck_id = ?', [id])
  for (const card of cards) {
    runSql('DELETE FROM review_history WHERE card_id = ?', [card[0]])
  }
  runSql('DELETE FROM cards WHERE deck_id = ?', [id])
  runSql('DELETE FROM decks WHERE id = ?', [id])
}

export function getDeckStats(id: number): DeckStats {
  const total = queryOne('SELECT COUNT(*) FROM cards WHERE deck_id = ?', [id])![0] as number
  const due = queryOne(
    "SELECT COUNT(*) FROM cards WHERE deck_id = ? AND next_review <= datetime('now') AND repetition > 0",
    [id]
  )![0] as number
  const new_cards = queryOne(
    'SELECT COUNT(*) FROM cards WHERE deck_id = ? AND repetition = 0',
    [id]
  )![0] as number

  return { total, due, new_cards }
}
