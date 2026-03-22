import { getDb, saveDb } from '../database'

export interface Tag {
  id: number
  deck_id: number
  name: string
  color: string
  created_at: string
}

function queryAll(sql: string, params: unknown[] = []): unknown[][] {
  const stmt = getDb().prepare(sql)
  if (params.length) stmt.bind(params)
  const rows: unknown[][] = []
  while (stmt.step()) rows.push(stmt.get())
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

function rowToTag(row: unknown[]): Tag {
  return {
    id: row[0] as number,
    name: row[1] as string,
    deck_id: row[2] as number,
    color: row[3] as string,
    created_at: row[4] as string
  }
}

export function getTagsByDeck(deckId: number): Tag[] {
  return queryAll('SELECT id, name, deck_id, color, created_at FROM tags WHERE deck_id = ? ORDER BY name', [deckId]).map(rowToTag)
}

export function createTag(deckId: number, name: string, color: string = '#6b7280'): Tag {
  const db = getDb()
  db.run('INSERT INTO tags (deck_id, name, color) VALUES (?, ?, ?)', [deckId, name, color])
  const idStmt = db.prepare('SELECT last_insert_rowid()')
  idStmt.step()
  const id = idStmt.get()![0] as number
  idStmt.free()
  saveDb()
  return rowToTag(queryOne('SELECT id, name, deck_id, color, created_at FROM tags WHERE id = ?', [id])!)
}

export function deleteTag(id: number): void {
  runSql('DELETE FROM card_tags WHERE tag_id = ?', [id])
  runSql('DELETE FROM tags WHERE id = ?', [id])
}

export function getCardTags(cardId: number): Tag[] {
  return queryAll(
    `SELECT t.id, t.name, t.deck_id, t.color, t.created_at FROM tags t
     JOIN card_tags ct ON t.id = ct.tag_id WHERE ct.card_id = ?`,
    [cardId]
  ).map(rowToTag)
}

export function getCardTagsForDeck(deckId: number): Record<number, number[]> {
  const rows = queryAll(
    `SELECT ct.card_id, ct.tag_id FROM card_tags ct
     JOIN cards c ON ct.card_id = c.id WHERE c.deck_id = ?`,
    [deckId]
  )
  const result: Record<number, number[]> = {}
  for (const r of rows) {
    const cardId = r[0] as number
    const tagId = r[1] as number
    if (!result[cardId]) result[cardId] = []
    result[cardId].push(tagId)
  }
  return result
}

export function setCardTags(cardId: number, tagIds: number[]): void {
  runSql('DELETE FROM card_tags WHERE card_id = ?', [cardId])
  for (const tagId of tagIds) {
    runSql('INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)', [cardId, tagId])
  }
}

export function addTagToCards(tagId: number, cardIds: number[]): void {
  for (const cardId of cardIds) {
    try {
      runSql('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [cardId, tagId])
    } catch { /* ignore duplicates */ }
  }
}

export function getCardIdsByTag(tagId: number): number[] {
  return queryAll('SELECT card_id FROM card_tags WHERE tag_id = ?', [tagId]).map((r) => r[0] as number)
}
