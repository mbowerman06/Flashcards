function api() {
  if (!window.electronAPI) {
    throw new Error('electronAPI not available - preload script may have failed to load')
  }
  return window.electronAPI
}

// Decks
export const getDecks = async () => {
  console.log('[API] getDecks')
  const result = await api().getDecks()
  console.log('[API] getDecks result:', result)
  return result
}

export const createDeck = async (name: string) => {
  console.log('[API] createDeck:', name)
  const result = await api().createDeck(name)
  console.log('[API] createDeck result:', result)
  return result
}

export const renameDeck = (id: number, name: string) => api().renameDeck(id, name)
export const deleteDeck = (id: number) => api().deleteDeck(id)
export const getDeckStats = (id: number) => api().getDeckStats(id)

// Cards
export const getCards = (deckId: number) => api().getCards(deckId)
export const getCard = (id: number) => api().getCard(id)
export const createCard = (deckId: number, front: string, back: string) =>
  api().createCard(deckId, front, back)
export const updateCard = (id: number, front: string, back: string) =>
  api().updateCard(id, front, back)
export const deleteCard = (id: number) => api().deleteCard(id)
export const deleteCards = (ids: number[]) => api().deleteCards(ids)
export const moveCards = (ids: number[], targetDeckId: number) => api().moveCards(ids, targetDeckId)
export const duplicateCards = (ids: number[], targetDeckId: number) => api().duplicateCards(ids, targetDeckId)
export const mergeDecks = (sourceDeckId: number, targetDeckId: number) => api().mergeDecks(sourceDeckId, targetDeckId)

// Search
export const searchCards = (query: string, deckId?: number) => api().searchCards(query, deckId)
export const getAllCards = () => api().getAllCards()

// Study
export const getDueCards = (deckId: number) => api().getDueCards(deckId)
export const submitReview = (cardId: number, grade: number, timeTakenMs: number = 0) =>
  api().submitReview(cardId, grade, timeTakenMs)
export const getStreak = (deckId?: number) => api().getStreak(deckId)

// Tags
export const getTagsByDeck = (deckId: number) => api().getTagsByDeck(deckId)
export const createTag = (deckId: number, name: string, color: string) => api().createTag(deckId, name, color)
export const deleteTag = (id: number) => api().deleteTag(id)
export const getCardTagsForDeck = (deckId: number) => api().getCardTagsForDeck(deckId)
export const setCardTags = (cardId: number, tagIds: number[]) => api().setCardTags(cardId, tagIds)
export const addTagToCards = (tagId: number, cardIds: number[]) => api().addTagToCards(tagId, cardIds)
export const getCardIdsByTag = (tagId: number) => api().getCardIdsByTag(tagId)
export const getSlowestCards = (deckId: number, limit: number) => api().getSlowestCards(deckId, limit)
export const getDeckTimeStats = (deckId: number) => api().getDeckTimeStats(deckId)
export const getCardTimeStats = (deckId: number) => api().getCardTimeStats(deckId)
export const getDeckReviewHistory = (deckId: number) => api().getDeckReviewHistory(deckId)
