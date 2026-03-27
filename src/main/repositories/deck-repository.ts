import { getDb, saveDb } from '../database'

export interface Deck {
  id: number
  name: string
  description: string
  folder_id: number | null
  created_at: string
  updated_at: string
}

export interface Folder {
  id: number
  name: string
  parent_id: number | null
  created_at: string
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
    folder_id: row[3] as number | null,
    created_at: row[4] as string,
    updated_at: row[5] as string
  }
}

function rowToFolder(row: unknown[]): Folder {
  return {
    id: row[0] as number,
    name: row[1] as string,
    parent_id: row[2] as number | null,
    created_at: row[3] as string
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
  return queryAll('SELECT id, name, description, folder_id, created_at, updated_at FROM decks ORDER BY sort_order ASC, updated_at DESC').map(rowToDeck)
}

export function setDeckFolder(deckId: number, folderId: number | null): void {
  runSql("UPDATE decks SET folder_id = ?, updated_at = datetime('now') WHERE id = ?", [folderId, deckId])
}

// Folder CRUD
export function getAllFolders(): Folder[] {
  return queryAll('SELECT * FROM folders ORDER BY sort_order ASC, name ASC').map(rowToFolder)
}

export function updateDeckOrder(ids: number[]): void {
  const db = getDb()
  for (let i = 0; i < ids.length; i++) {
    db.run('UPDATE decks SET sort_order = ? WHERE id = ?', [i, ids[i]])
  }
  saveDb()
}

export function updateFolderOrder(ids: number[]): void {
  const db = getDb()
  for (let i = 0; i < ids.length; i++) {
    db.run('UPDATE folders SET sort_order = ? WHERE id = ?', [i, ids[i]])
  }
  saveDb()
}

export function createFolder(name: string, parentId: number | null = null): Folder {
  const db = getDb()
  db.run('INSERT INTO folders (name, parent_id) VALUES (?, ?)', [name, parentId])
  const idStmt = db.prepare('SELECT last_insert_rowid()')
  idStmt.step()
  const id = idStmt.get()![0] as number
  idStmt.free()
  saveDb()
  return rowToFolder(queryOne('SELECT * FROM folders WHERE id = ?', [id])!)
}

export function renameFolder(id: number, name: string): Folder {
  runSql('UPDATE folders SET name = ? WHERE id = ?', [name, id])
  return rowToFolder(queryOne('SELECT * FROM folders WHERE id = ?', [id])!)
}

export function deleteFolder(id: number): void {
  // Unparent decks in this folder
  runSql('UPDATE decks SET folder_id = NULL WHERE folder_id = ?', [id])
  // Unparent child folders
  runSql('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', [id])
  runSql('DELETE FROM folders WHERE id = ?', [id])
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
  const db = getDb()
  // Batch cascade delete
  const cardIds = queryAll('SELECT id FROM cards WHERE deck_id = ?', [id]).map((r) => r[0] as number)
  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',')
    db.run(`DELETE FROM review_history WHERE card_id IN (${placeholders})`, cardIds)
  }
  db.run('DELETE FROM cards WHERE deck_id = ?', [id])
  db.run('DELETE FROM decks WHERE id = ?', [id])
  saveDb()
}

export function getAllDeckStats(): Record<number, DeckStats> {
  const rows = queryAll(`
    SELECT
      deck_id,
      COUNT(*) as total,
      SUM(CASE WHEN next_review <= datetime('now') AND repetition > 0 THEN 1 ELSE 0 END) as due,
      SUM(CASE WHEN repetition = 0 THEN 1 ELSE 0 END) as new_cards
    FROM cards GROUP BY deck_id
  `)
  const result: Record<number, DeckStats> = {}
  for (const row of rows) {
    result[row[0] as number] = { total: row[1] as number, due: row[2] as number, new_cards: row[3] as number }
  }
  return result
}

export function getDeckStats(id: number): DeckStats {
  const row = queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN next_review <= datetime('now') AND repetition > 0 THEN 1 ELSE 0 END) as due,
      SUM(CASE WHEN repetition = 0 THEN 1 ELSE 0 END) as new_cards
    FROM cards WHERE deck_id = ?
  `, [id])
  return {
    total: (row?.[0] as number) ?? 0,
    due: (row?.[1] as number) ?? 0,
    new_cards: (row?.[2] as number) ?? 0
  }
}
