import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { writeFileSync, existsSync, mkdirSync, readFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import * as deckRepo from './repositories/deck-repository'
import * as cardRepo from './repositories/card-repository'
import * as reviewRepo from './repositories/review-repository'
import * as tagRepo from './repositories/tag-repository'
import * as templateRepo from './repositories/template-repository'
import * as edgeTts from './edge-tts'

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

  // Templates
  ipcMain.handle('template:getAll', () => templateRepo.getAllTemplates())
  ipcMain.handle('template:create', (_, name: string, front: string, back: string) => templateRepo.createTemplate(name, front, back))
  ipcMain.handle('template:delete', (_, id: number) => templateRepo.deleteTemplate(id))

  // Fetch URL content (for Quizlet import)
  ipcMain.handle('util:fetchUrl', async (_, url: string) => {
    const { net } = require('electron')
    return new Promise((resolve, reject) => {
      const request = net.request(url)
      let data = ''
      request.on('response', (response: any) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => resolve(data))
      })
      request.on('error', (err: Error) => reject(err.message))
      request.end()
    })
  })

  // Backup/Restore
  ipcMain.handle('backup:export', () => {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const { app } = require('electron')
    const dbPath = join(app.getPath('userData'), 'flashcards.db')
    const buffer = readFileSync(dbPath)
    return buffer.toString('base64')
  })

  ipcMain.handle('backup:import', async (_: any, data: string) => {
    const { writeFileSync, copyFileSync, existsSync, unlinkSync } = require('fs')
    const { join } = require('path')
    const { app } = require('electron')
    const dbPath = join(app.getPath('userData'), 'flashcards.db')
    const backupPath = dbPath + '.backup'
    const buffer = Buffer.from(data, 'base64')

    // Basic validation: SQLite files start with "SQLite format 3\0"
    const header = buffer.slice(0, 16).toString('ascii')
    if (!header.startsWith('SQLite format 3')) {
      throw new Error('Invalid database file. Not a valid SQLite database.')
    }

    // Backup current DB before overwriting
    try {
      if (existsSync(dbPath)) {
        copyFileSync(dbPath, backupPath)
      }
    } catch (e) {
      console.error('Failed to create backup:', e)
    }

    try {
      writeFileSync(dbPath, buffer)
      app.relaunch()
      app.exit(0)
    } catch (e) {
      // Restore backup on failure
      try {
        if (existsSync(backupPath)) {
          copyFileSync(backupPath, dbPath)
        }
      } catch {}
      throw new Error('Failed to import database. Previous data has been restored.')
    }
  })

  ipcMain.handle('card:getByTag', (_, deckId: number, tagId: number) => cardRepo.getCardsByTag(deckId, tagId))

  ipcMain.handle('deck:allStats', () => deckRepo.getAllDeckStats())

  // Combined deck data (reduces 6 IPC calls to 1)
  ipcMain.handle('deck:getCardListData', (_, deckId: number) => {
    return {
      cards: cardRepo.getCardsByDeck(deckId),
      timeStats: reviewRepo.getDeckTimeStats(deckId),
      cardTimes: reviewRepo.getCardTimeStats(deckId),
      tags: tagRepo.getTagsByDeck(deckId),
      cardTagMap: tagRepo.getCardTagsForDeck(deckId),
      templates: templateRepo.getAllTemplates()
    }
  })

  // Ordering
  ipcMain.handle('deck:updateOrder', (_, ids: number[]) => deckRepo.updateDeckOrder(ids))
  ipcMain.handle('folder:updateOrder', (_, ids: number[]) => deckRepo.updateFolderOrder(ids))
  ipcMain.handle('card:updateOrder', (_, ids: number[]) => cardRepo.updateCardOrder(ids))

  // Folders
  ipcMain.handle('folder:getAll', () => deckRepo.getAllFolders())
  ipcMain.handle('folder:create', (_, name: string, parentId?: number) => deckRepo.createFolder(name, parentId ?? null))
  ipcMain.handle('folder:rename', (_, id: number, name: string) => deckRepo.renameFolder(id, name))
  ipcMain.handle('folder:delete', (_, id: number) => deckRepo.deleteFolder(id))
  ipcMain.handle('deck:setFolder', (_, deckId: number, folderId: number | null) => deckRepo.setDeckFolder(deckId, folderId))

  // Save drawing as PDF
  ipcMain.handle('util:saveDrawingPDF', async (event, imageDataUrl: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(parent!, {
      title: 'Save Drawing as PDF',
      defaultPath: `drawing-${Date.now()}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return false
    // Create a hidden window, load the image, print to PDF
    const win = new BrowserWindow({ show: false, width: 800, height: 600 })
    const html = `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${imageDataUrl}" /></body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfData = await win.webContents.printToPDF({ printBackground: true })
    writeFileSync(result.filePath, pdfData)
    win.destroy()
    return true
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

  // Edge TTS (neural voices)
  ipcMain.handle('tts:getVoices', async () => {
    try {
      return await edgeTts.getVoices()
    } catch (err) {
      console.error('[IPC] tts:getVoices error:', err)
      return []
    }
  })

  ipcMain.handle('tts:synthesize', async (_event, text: string, voice: string, rate?: string) => {
    try {
      const result = await edgeTts.synthesize(text, voice, rate || '+0%')
      return {
        audio: result.audio.toString('base64'),
        words: result.words
      }
    } catch (err) {
      console.error('[IPC] tts:synthesize error:', err)
      return null
    }
  })

  // ========== GitHub Sync ==========

  const runGit = (args: string[], cwd: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout.trim())
      })
    })
  }

  const getSyncDir = () => join(app.getPath('userData'), 'sync')

  ipcMain.handle('github:push', async (_event, repoUrl: string) => {
    const syncDir = getSyncDir()
    const dbPath = join(app.getPath('userData'), 'flashcards.db')

    try {
      // Initialize or update the sync repo
      if (!existsSync(join(syncDir, '.git'))) {
        mkdirSync(syncDir, { recursive: true })
        await runGit(['init'], syncDir)
        await runGit(['remote', 'add', 'origin', repoUrl], syncDir)
      } else {
        // Update remote URL in case it changed
        try { await runGit(['remote', 'set-url', 'origin', repoUrl], syncDir) } catch {}
      }

      // Copy current database to sync dir
      copyFileSync(dbPath, join(syncDir, 'flashcards.db'))

      // Stage, commit, push
      await runGit(['add', 'flashcards.db'], syncDir)

      // Check if there's anything to commit
      try {
        await runGit(['diff', '--cached', '--quiet'], syncDir)
        // No changes — still push in case local is ahead
      } catch {
        // There are changes to commit
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
        await runGit(['commit', '-m', `Sync: ${timestamp}`], syncDir)
      }

      // Ensure we're on main branch
      try { await runGit(['branch', '-M', 'main'], syncDir) } catch {}

      await runGit(['push', '-u', 'origin', 'main'], syncDir)
      return { success: true }
    } catch (err: any) {
      console.error('[IPC] github:push error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('github:pull', async (_event, repoUrl: string) => {
    const syncDir = getSyncDir()
    const dbPath = join(app.getPath('userData'), 'flashcards.db')
    const backupPath = dbPath + '.pre-sync-backup'

    try {
      if (!existsSync(join(syncDir, '.git'))) {
        // Clone the repo
        mkdirSync(syncDir, { recursive: true })
        await runGit(['clone', repoUrl, '.'], syncDir)
      } else {
        // Update remote and pull
        try { await runGit(['remote', 'set-url', 'origin', repoUrl], syncDir) } catch {}
        await runGit(['fetch', 'origin'], syncDir)
        await runGit(['reset', '--hard', 'origin/main'], syncDir)
      }

      const pulledDb = join(syncDir, 'flashcards.db')
      if (!existsSync(pulledDb)) {
        return { success: false, error: 'No flashcards.db found in the repository.' }
      }

      // Validate SQLite header
      const header = readFileSync(pulledDb, { encoding: null }).slice(0, 16).toString('ascii')
      if (!header.startsWith('SQLite format 3')) {
        return { success: false, error: 'Pulled file is not a valid SQLite database.' }
      }

      // Backup current DB then replace
      if (existsSync(dbPath)) {
        copyFileSync(dbPath, backupPath)
      }
      copyFileSync(pulledDb, dbPath)

      // Relaunch to load new database
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (err: any) {
      console.error('[IPC] github:pull error:', err)
      return { success: false, error: err.message }
    }
  })
}
