import { getDb, saveDb } from '../database'

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

export function insertReview(
  cardId: number,
  grade: number,
  easeFactorBefore: number,
  easeFactorAfter: number,
  intervalBefore: number,
  intervalAfter: number,
  timeTakenMs: number = 0
): void {
  getDb().run(
    `INSERT INTO review_history
     (card_id, grade, ease_factor_before, ease_factor_after, interval_before, interval_after, time_taken_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [cardId, grade, easeFactorBefore, easeFactorAfter, intervalBefore, intervalAfter, timeTakenMs]
  )
  saveDb()
}

export interface StreakInfo {
  currentStreak: number
  longestStreak: number
  studiedToday: boolean
}

export function getStreakInfo(deckId?: number): StreakInfo {
  // Get distinct study dates ordered descending, optionally filtered by deck
  const rows = deckId
    ? queryAll(
        `SELECT DISTINCT date(rh.reviewed_at) as study_date FROM review_history rh
         JOIN cards c ON rh.card_id = c.id WHERE c.deck_id = ?
         ORDER BY study_date DESC`,
        [deckId]
      )
    : queryAll(
        "SELECT DISTINCT date(reviewed_at) as study_date FROM review_history ORDER BY study_date DESC"
      )

  if (rows.length === 0) {
    return { currentStreak: 0, longestStreak: 0, studiedToday: false }
  }

  const dates = rows.map((r) => r[0] as string)
  const today = new Date().toISOString().substring(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10)

  const studiedToday = dates[0] === today

  // Calculate current streak
  let currentStreak = 0
  let checkDate = studiedToday ? today : yesterday

  // If the most recent study day isn't today or yesterday, streak is 0
  if (dates[0] !== today && dates[0] !== yesterday) {
    // Calculate longest streak still
    let longest = 1
    let streak = 1
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1])
      const curr = new Date(dates[i])
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000
      if (Math.round(diffDays) === 1) {
        streak++
        longest = Math.max(longest, streak)
      } else {
        streak = 1
      }
    }
    return { currentStreak: 0, longestStreak: longest, studiedToday: false }
  }

  for (const date of dates) {
    if (date === checkDate) {
      currentStreak++
      // Move checkDate back one day
      const d = new Date(checkDate)
      d.setDate(d.getDate() - 1)
      checkDate = d.toISOString().substring(0, 10)
    } else {
      break
    }
  }

  // Calculate longest streak
  let longestStreak = 1
  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const curr = new Date(dates[i])
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000
    if (Math.round(diffDays) === 1) {
      streak++
      longestStreak = Math.max(longestStreak, streak)
    } else {
      streak = 1
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak)

  return { currentStreak, longestStreak, studiedToday }
}

export function getSessionStats(cardIds: number[]): { avgTimeMs: number; totalTimeMs: number } {
  if (cardIds.length === 0) return { avgTimeMs: 0, totalTimeMs: 0 }

  const placeholders = cardIds.map(() => '?').join(',')
  const row = queryOne(
    `SELECT AVG(time_taken_ms), SUM(time_taken_ms) FROM review_history
     WHERE card_id IN (${placeholders}) AND time_taken_ms > 0
     ORDER BY reviewed_at DESC LIMIT ${cardIds.length}`,
    cardIds
  )

  return {
    avgTimeMs: row ? Math.round((row[0] as number) || 0) : 0,
    totalTimeMs: row ? Math.round((row[1] as number) || 0) : 0
  }
}

export function getCardTimeStats(deckId: number): Record<number, { avg: number; best: number }> {
  const rows = queryAll(
    `SELECT rh.card_id, AVG(rh.time_taken_ms) as avg_time, MIN(rh.time_taken_ms) as best_time
     FROM review_history rh JOIN cards c ON rh.card_id = c.id
     WHERE c.deck_id = ? AND rh.time_taken_ms > 0
     GROUP BY rh.card_id`,
    [deckId]
  )
  const result: Record<number, { avg: number; best: number }> = {}
  for (const r of rows) {
    result[r[0] as number] = {
      avg: Math.round(r[1] as number),
      best: Math.round(r[2] as number)
    }
  }
  return result
}

export function getSlowestCardIds(deckId: number, limit: number): number[] {
  const rows = queryAll(
    `SELECT rh.card_id, AVG(rh.time_taken_ms) as avg_time
     FROM review_history rh JOIN cards c ON rh.card_id = c.id
     WHERE c.deck_id = ? AND rh.time_taken_ms > 0
     GROUP BY rh.card_id ORDER BY avg_time DESC LIMIT ?`,
    [deckId, limit]
  )
  return rows.map((r) => r[0] as number)
}

export interface DeckTimeStats {
  totalTimeMs: number
  avgTimePerCardMs: number
  totalReviews: number
  fastestCardId: number | null
  fastestCardMs: number
  slowestCardId: number | null
  slowestCardMs: number
}

export function getDeckTimeStats(deckId: number): DeckTimeStats {
  // Overall stats
  const overall = queryOne(
    `SELECT COUNT(*), SUM(rh.time_taken_ms), AVG(rh.time_taken_ms)
     FROM review_history rh JOIN cards c ON rh.card_id = c.id
     WHERE c.deck_id = ? AND rh.time_taken_ms > 0`,
    [deckId]
  )

  const totalReviews = overall ? (overall[0] as number) || 0 : 0
  const totalTimeMs = overall ? Math.round((overall[1] as number) || 0) : 0
  const avgTimePerCardMs = overall ? Math.round((overall[2] as number) || 0) : 0

  // Fastest card (by average time across reviews)
  const fastest = queryOne(
    `SELECT rh.card_id, AVG(rh.time_taken_ms) as avg_time
     FROM review_history rh JOIN cards c ON rh.card_id = c.id
     WHERE c.deck_id = ? AND rh.time_taken_ms > 0
     GROUP BY rh.card_id ORDER BY avg_time ASC LIMIT 1`,
    [deckId]
  )

  // Slowest card (by average time across reviews)
  const slowest = queryOne(
    `SELECT rh.card_id, AVG(rh.time_taken_ms) as avg_time
     FROM review_history rh JOIN cards c ON rh.card_id = c.id
     WHERE c.deck_id = ? AND rh.time_taken_ms > 0
     GROUP BY rh.card_id ORDER BY avg_time DESC LIMIT 1`,
    [deckId]
  )

  return {
    totalTimeMs,
    avgTimePerCardMs,
    totalReviews,
    fastestCardId: fastest ? (fastest[0] as number) : null,
    fastestCardMs: fastest ? Math.round(fastest[1] as number) : 0,
    slowestCardId: slowest ? (slowest[0] as number) : null,
    slowestCardMs: slowest ? Math.round(slowest[1] as number) : 0
  }
}

export interface DeckReviewHistory {
  date: string
  reviewCount: number
  avgTimeMs: number
  correctCount: number
  totalCount: number
}

export function getDeckReviewHistory(deckId: number): DeckReviewHistory[] {
  const rows = queryAll(
    `SELECT date(rh.reviewed_at) as review_date,
            COUNT(*) as review_count,
            AVG(rh.time_taken_ms) as avg_time,
            SUM(CASE WHEN rh.grade >= 3 THEN 1 ELSE 0 END) as correct_count,
            COUNT(*) as total_count
     FROM review_history rh JOIN cards c ON rh.card_id = c.id
     WHERE c.deck_id = ? AND rh.time_taken_ms > 0
     GROUP BY review_date ORDER BY review_date ASC`,
    [deckId]
  )

  return rows.map((r) => ({
    date: r[0] as string,
    reviewCount: r[1] as number,
    avgTimeMs: Math.round(r[2] as number),
    correctCount: r[3] as number,
    totalCount: r[4] as number
  }))
}
