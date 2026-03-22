import { ipcMain, BrowserWindow } from 'electron'
import * as deckRepo from './repositories/deck-repository'
import * as cardRepo from './repositories/card-repository'
import * as reviewRepo from './repositories/review-repository'
import * as tagRepo from './repositories/tag-repository'

function sm2(
  grade: number,
  repetition: number,
  easeFactor: number,
  interval: number
): { repetition: number; easeFactor: number; interval: number; nextReview: string } {
  let newEF = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  newEF = Math.max(1.3, newEF)

  let newInterval: number
  let newRepetition: number

  if (grade < 3) {
    newRepetition = 0
    newInterval = 1
  } else {
    newRepetition = repetition + 1
    if (repetition === 0) newInterval = 1
    else if (repetition === 1) newInterval = 6
    else newInterval = Math.round(interval * newEF)
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)

  return {
    repetition: newRepetition,
    easeFactor: newEF,
    interval: newInterval,
    nextReview: nextReview.toISOString().replace('T', ' ').substring(0, 19)
  }
}

export function registerIpcHandlers(): void {
  // Deck handlers
  ipcMain.handle('deck:getAll', () => {
    try {
      return deckRepo.getAllDecks()
    } catch (err) {
      console.error('[IPC] deck:getAll error:', err)
      throw err
    }
  })
  ipcMain.handle('deck:create', (_, name: string) => {
    try {
      console.log('[IPC] deck:create called with:', name)
      const result = deckRepo.createDeck(name)
      console.log('[IPC] deck:create result:', result)
      return result
    } catch (err) {
      console.error('[IPC] deck:create error:', err)
      throw err
    }
  })
  ipcMain.handle('deck:rename', (_, id: number, name: string) => deckRepo.renameDeck(id, name))
  ipcMain.handle('deck:delete', (_, id: number) => deckRepo.deleteDeck(id))
  ipcMain.handle('deck:stats', (_, id: number) => deckRepo.getDeckStats(id))

  // Card handlers
  ipcMain.handle('card:getByDeck', (_, deckId: number) => cardRepo.getCardsByDeck(deckId))
  ipcMain.handle('card:get', (_, id: number) => cardRepo.getCard(id))
  ipcMain.handle('card:create', (_, deckId: number, front: string, back: string) =>
    cardRepo.createCard(deckId, front, back)
  )
  ipcMain.handle('card:update', (_, id: number, front: string, back: string) =>
    cardRepo.updateCard(id, front, back)
  )
  ipcMain.handle('card:delete', (_, id: number) => cardRepo.deleteCard(id))
  ipcMain.handle('card:deleteMany', (_, ids: number[]) => cardRepo.deleteCards(ids))
  ipcMain.handle('card:moveMany', (_, ids: number[], targetDeckId: number) => cardRepo.moveCardsToDeck(ids, targetDeckId))
  ipcMain.handle('card:duplicateMany', (_, ids: number[], targetDeckId: number) => cardRepo.duplicateCardsToDeck(ids, targetDeckId))
  ipcMain.handle('deck:merge', (_, sourceDeckId: number, targetDeckId: number) => {
    cardRepo.moveAllCardsToDeck(sourceDeckId, targetDeckId)
    deckRepo.deleteDeck(sourceDeckId)
  })

  // Search handlers
  ipcMain.handle('search:cards', (_, query: string, deckId?: number) =>
    cardRepo.searchCards(query, deckId)
  )
  ipcMain.handle('search:allCards', () => cardRepo.getAllCards())

  // Study handlers
  ipcMain.handle('study:getDue', (_, deckId: number) => cardRepo.getDueCards(deckId))
  ipcMain.handle('study:review', (_, cardId: number, grade: number, timeTakenMs: number = 0) => {
    const card = cardRepo.getCard(cardId)
    if (!card) throw new Error(`Card ${cardId} not found`)

    const result = sm2(grade, card.repetition, card.ease_factor, card.interval)

    reviewRepo.insertReview(
      cardId,
      grade,
      card.ease_factor,
      result.easeFactor,
      card.interval,
      result.interval,
      timeTakenMs
    )

    cardRepo.updateCardReview(
      cardId,
      result.easeFactor,
      result.interval,
      result.repetition,
      result.nextReview
    )

    return result
  })

  // Streak handler
  ipcMain.handle('study:streak', (_, deckId?: number) => reviewRepo.getStreakInfo(deckId))

  // Deck time stats
  ipcMain.handle('study:deckTimeStats', (_, deckId: number) => reviewRepo.getDeckTimeStats(deckId))

  // Per-card time stats for a deck
  ipcMain.handle('study:cardTimeStats', (_, deckId: number) => reviewRepo.getCardTimeStats(deckId))

  // Deck review history (for graphs)
  ipcMain.handle('study:deckReviewHistory', (_, deckId: number) => reviewRepo.getDeckReviewHistory(deckId))

  // Tags
  ipcMain.handle('tag:getByDeck', (_, deckId: number) => tagRepo.getTagsByDeck(deckId))
  ipcMain.handle('tag:create', (_, deckId: number, name: string, color: string) => tagRepo.createTag(deckId, name, color))
  ipcMain.handle('tag:delete', (_, id: number) => tagRepo.deleteTag(id))
  ipcMain.handle('tag:getCardTags', (_, deckId: number) => tagRepo.getCardTagsForDeck(deckId))
  ipcMain.handle('tag:setCardTags', (_, cardId: number, tagIds: number[]) => tagRepo.setCardTags(cardId, tagIds))
  ipcMain.handle('tag:addToCards', (_, tagId: number, cardIds: number[]) => tagRepo.addTagToCards(tagId, cardIds))
  ipcMain.handle('tag:getCardIds', (_, tagId: number) => tagRepo.getCardIdsByTag(tagId))

  // Slowest cards for study
  ipcMain.handle('study:slowestCards', (_, deckId: number, limit: number) => {
    const cardIds = reviewRepo.getSlowestCardIds(deckId, limit)
    return cardIds.map((id) => cardRepo.getCard(id)).filter(Boolean)
  })

  // Window controls
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}
