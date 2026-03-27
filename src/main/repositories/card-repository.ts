import { getDb, saveDb } from '../database'

export interface Card {
  id: number
  deck_id: number
  front_content: string
  back_content: string
  ease_factor: number
  interval: number
  repetition: number
  next_review: string
  created_at: string
  updated_at: string
}

function rowToCard(row: unknown[]): Card {
  return {
    id: row[0] as number,
    deck_id: row[1] as number,
    front_content: row[2] as string,
    back_content: row[3] as string,
    ease_factor: row[4] as number,
    interval: row[5] as number,
    repetition: row[6] as number,
    next_review: row[7] as string,
    created_at: row[8] as string,
    updated_at: row[9] as string
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

export function getCardsByDeck(deckId: number): Card[] {
  return queryAll('SELECT * FROM cards WHERE deck_id = ? ORDER BY sort_order ASC, created_at DESC', [deckId]).map(
    rowToCard
  )
}

export function updateCardOrder(ids: number[]): void {
  const db = getDb()
  for (let i = 0; i < ids.length; i++) {
    db.run('UPDATE cards SET sort_order = ? WHERE id = ?', [i, ids[i]])
  }
  saveDb()
}

export function getCard(id: number): Card | undefined {
  const row = queryOne('SELECT * FROM cards WHERE id = ?', [id])
  return row ? rowToCard(row) : undefined
}

export function createCard(deckId: number, frontContent: string, backContent: string): Card {
  const db = getDb()
  db.run('INSERT INTO cards (deck_id, front_content, back_content) VALUES (?, ?, ?)', [
    deckId,
    frontContent,
    backContent
  ])
  // Get ID immediately before saveDb() resets last_insert_rowid
  const idStmt = db.prepare('SELECT last_insert_rowid()')
  idStmt.step()
  const id = idStmt.get()![0] as number
  idStmt.free()
  saveDb()
  runSql("UPDATE decks SET updated_at = datetime('now') WHERE id = ?", [deckId])
  return rowToCard(queryOne('SELECT * FROM cards WHERE id = ?', [id])!)
}

export function updateCard(id: number, frontContent: string, backContent: string): Card {
  runSql(
    "UPDATE cards SET front_content = ?, back_content = ?, updated_at = datetime('now') WHERE id = ?",
    [frontContent, backContent, id]
  )
  return rowToCard(queryOne('SELECT * FROM cards WHERE id = ?', [id])!)
}

export function deleteCard(id: number): void {
  const db = getDb()
  db.run('DELETE FROM review_history WHERE card_id = ?', [id])
  db.run('DELETE FROM cards WHERE id = ?', [id])
  saveDb()
}

export function moveCardsToDeck(cardIds: number[], targetDeckId: number): void {
  const placeholders = cardIds.map(() => '?').join(',')
  runSql(`UPDATE cards SET deck_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`, [targetDeckId, ...cardIds])
}

export function moveAllCardsToDeck(sourceDeckId: number, targetDeckId: number): void {
  runSql("UPDATE cards SET deck_id = ?, updated_at = datetime('now') WHERE deck_id = ?", [targetDeckId, sourceDeckId])
}

export function duplicateCardsToDeck(cardIds: number[], targetDeckId: number): void {
  const db = getDb()
  for (const id of cardIds) {
    const card = getCard(id)
    if (!card) continue
    db.run('INSERT INTO cards (deck_id, front_content, back_content) VALUES (?, ?, ?)', [
      targetDeckId, card.front_content, card.back_content
    ])
  }
  saveDb()
}

export function deleteCards(ids: number[]): void {
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  db.run(`DELETE FROM review_history WHERE card_id IN (${placeholders})`, ids)
  db.run(`DELETE FROM cards WHERE id IN (${placeholders})`, ids)
  saveDb()
}

export function getDueCards(deckId: number): Card[] {
  return queryAll(
    "SELECT * FROM cards WHERE deck_id = ? AND next_review <= datetime('now') ORDER BY next_review ASC",
    [deckId]
  ).map(rowToCard)
}

export function getCardsByTag(deckId: number, tagId: number): Card[] {
  return queryAll(
    `SELECT c.* FROM cards c JOIN card_tags ct ON c.id = ct.card_id WHERE c.deck_id = ? AND ct.tag_id = ? ORDER BY c.sort_order ASC, c.created_at DESC`,
    [deckId, tagId]
  ).map(rowToCard)
}

export function searchCards(query: string, deckId?: number, limit: number = 100): Card[] {
  if (deckId) {
    return queryAll(
      `SELECT * FROM cards WHERE deck_id = ? AND (front_content LIKE ? OR back_content LIKE ?) ORDER BY created_at DESC LIMIT ?`,
      [deckId, `%${query}%`, `%${query}%`, limit]
    ).map(rowToCard)
  }
  return queryAll(
    `SELECT * FROM cards WHERE front_content LIKE ? OR back_content LIKE ? ORDER BY created_at DESC LIMIT ?`,
    [`%${query}%`, `%${query}%`, limit]
  ).map(rowToCard)
}

export function getAllCards(): Card[] {
  return queryAll('SELECT * FROM cards ORDER BY created_at DESC').map(rowToCard)
}

export function updateCardReview(
  id: number,
  easeFactor: number,
  interval: number,
  repetition: number,
  nextReview: string
): void {
  runSql(
    "UPDATE cards SET ease_factor = ?, interval = ?, repetition = ?, next_review = ?, updated_at = datetime('now') WHERE id = ?",
    [easeFactor, interval, repetition, nextReview, id]
  )
}
