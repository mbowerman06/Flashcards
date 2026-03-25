import { getDb, saveDb } from '../database'

export interface CardTemplate {
  id: number
  name: string
  front_content: string
  back_content: string
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

function rowToTemplate(row: unknown[]): CardTemplate {
  return {
    id: row[0] as number,
    name: row[1] as string,
    front_content: row[2] as string,
    back_content: row[3] as string,
    created_at: row[4] as string
  }
}

export function getAllTemplates(): CardTemplate[] {
  return queryAll('SELECT id, name, front_content, back_content, created_at FROM card_templates ORDER BY name').map(rowToTemplate)
}

export function createTemplate(name: string, frontContent: string, backContent: string): CardTemplate {
  const db = getDb()
  db.run('INSERT INTO card_templates (name, front_content, back_content) VALUES (?, ?, ?)', [name, frontContent, backContent])
  const idStmt = db.prepare('SELECT last_insert_rowid()')
  idStmt.step()
  const id = idStmt.get()![0] as number
  idStmt.free()
  saveDb()
  return rowToTemplate(queryOne('SELECT id, name, front_content, back_content, created_at FROM card_templates WHERE id = ?', [id])!)
}

export function deleteTemplate(id: number): void {
  getDb().run('DELETE FROM card_templates WHERE id = ?', [id])
  saveDb()
}
