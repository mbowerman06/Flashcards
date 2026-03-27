import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Decks
  getDecks: () => ipcRenderer.invoke('deck:getAll'),
  createDeck: (name: string) => ipcRenderer.invoke('deck:create', name),
  renameDeck: (id: number, name: string) => ipcRenderer.invoke('deck:rename', id, name),
  deleteDeck: (id: number) => ipcRenderer.invoke('deck:delete', id),
  getDeckStats: (id: number) => ipcRenderer.invoke('deck:stats', id),

  // Cards
  getCards: (deckId: number) => ipcRenderer.invoke('card:getByDeck', deckId),
  getCard: (id: number) => ipcRenderer.invoke('card:get', id),
  createCard: (deckId: number, front: string, back: string) =>
    ipcRenderer.invoke('card:create', deckId, front, back),
  updateCard: (id: number, front: string, back: string) =>
    ipcRenderer.invoke('card:update', id, front, back),
  deleteCard: (id: number) => ipcRenderer.invoke('card:delete', id),
  deleteCards: (ids: number[]) => ipcRenderer.invoke('card:deleteMany', ids),
  moveCards: (ids: number[], targetDeckId: number) => ipcRenderer.invoke('card:moveMany', ids, targetDeckId),
  duplicateCards: (ids: number[], targetDeckId: number) => ipcRenderer.invoke('card:duplicateMany', ids, targetDeckId),
  mergeDecks: (sourceDeckId: number, targetDeckId: number) => ipcRenderer.invoke('deck:merge', sourceDeckId, targetDeckId),

  // Search
  searchCards: (query: string, deckId?: number) =>
    ipcRenderer.invoke('search:cards', query, deckId),
  getAllCards: () => ipcRenderer.invoke('search:allCards'),

  // Study
  getDueCards: (deckId: number) => ipcRenderer.invoke('study:getDue', deckId),
  submitReview: (cardId: number, grade: number, timeTakenMs: number = 0) =>
    ipcRenderer.invoke('study:review', cardId, grade, timeTakenMs),
  getStreak: (deckId?: number) => ipcRenderer.invoke('study:streak', deckId),
  getDeckTimeStats: (deckId: number) => ipcRenderer.invoke('study:deckTimeStats', deckId),
  getCardTimeStats: (deckId: number) => ipcRenderer.invoke('study:cardTimeStats', deckId),
  getDeckReviewHistory: (deckId: number) => ipcRenderer.invoke('study:deckReviewHistory', deckId),

  // Tags
  getTagsByDeck: (deckId: number) => ipcRenderer.invoke('tag:getByDeck', deckId),
  createTag: (deckId: number, name: string, color: string) => ipcRenderer.invoke('tag:create', deckId, name, color),
  deleteTag: (id: number) => ipcRenderer.invoke('tag:delete', id),
  getCardTagsForDeck: (deckId: number) => ipcRenderer.invoke('tag:getCardTags', deckId),
  setCardTags: (cardId: number, tagIds: number[]) => ipcRenderer.invoke('tag:setCardTags', cardId, tagIds),
  addTagToCards: (tagId: number, cardIds: number[]) => ipcRenderer.invoke('tag:addToCards', tagId, cardIds),
  getCardIdsByTag: (tagId: number) => ipcRenderer.invoke('tag:getCardIds', tagId),
  getSlowestCards: (deckId: number, limit: number) => ipcRenderer.invoke('study:slowestCards', deckId, limit),

  // Templates
  getTemplates: () => ipcRenderer.invoke('template:getAll'),
  createTemplate: (name: string, front: string, back: string) => ipcRenderer.invoke('template:create', name, front, back),
  deleteTemplate: (id: number) => ipcRenderer.invoke('template:delete', id),

  getCardsByTag: (deckId: number, tagId: number) => ipcRenderer.invoke('card:getByTag', deckId, tagId),
  getAllDeckStats: () => ipcRenderer.invoke('deck:allStats'),

  // Combined
  getCardListData: (deckId: number) => ipcRenderer.invoke('deck:getCardListData', deckId),

  // Ordering
  updateDeckOrder: (ids: number[]) => ipcRenderer.invoke('deck:updateOrder', ids),
  updateFolderOrder: (ids: number[]) => ipcRenderer.invoke('folder:updateOrder', ids),
  updateCardOrder: (ids: number[]) => ipcRenderer.invoke('card:updateOrder', ids),

  // Folders
  getFolders: () => ipcRenderer.invoke('folder:getAll'),
  createFolder: (name: string, parentId?: number) => ipcRenderer.invoke('folder:create', name, parentId),
  renameFolder: (id: number, name: string) => ipcRenderer.invoke('folder:rename', id, name),
  deleteFolder: (id: number) => ipcRenderer.invoke('folder:delete', id),
  setDeckFolder: (deckId: number, folderId: number | null) => ipcRenderer.invoke('deck:setFolder', deckId, folderId),

  // Utility
  fetchUrl: (url: string) => ipcRenderer.invoke('util:fetchUrl', url),
  saveDrawingPDF: (imageDataUrl: string) => ipcRenderer.invoke('util:saveDrawingPDF', imageDataUrl),

  // Backup
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: (data: string) => ipcRenderer.invoke('backup:import', data),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close')
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
