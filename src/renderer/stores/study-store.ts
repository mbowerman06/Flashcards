import { create } from 'zustand'
import * as api from '../api/ipc-client'
import type { Card } from './card-store'

interface CardTimeRecord {
  cardId: number
  timeMs: number
}

interface StudyStore {
  cards: Card[]
  currentIndex: number
  flipped: boolean
  sessionComplete: boolean
  loading: boolean
  reviewed: number
  isReviewAll: boolean
  cardStartTime: number  // timestamp when current card was shown
  cardTimes: CardTimeRecord[]  // time records for this session

  startSession: (deckId: number) => Promise<void>
  startWithCards: (cards: Card[]) => void
  flipCard: () => void
  rateCard: (grade: number) => Promise<void>
  reset: () => void
}

export const useStudyStore = create<StudyStore>((set, get) => ({
  cards: [],
  currentIndex: 0,
  flipped: false,
  sessionComplete: false,
  loading: false,
  reviewed: 0,
  isReviewAll: false,
  cardStartTime: 0,
  cardTimes: [],

  startSession: async (deckId: number) => {
    set({
      loading: true, currentIndex: 0, flipped: false, sessionComplete: false,
      reviewed: 0, isReviewAll: false, cardStartTime: Date.now(), cardTimes: []
    })

    // First try due cards
    let cards = await api.getDueCards(deckId)

    if (cards.length === 0) {
      // No due cards — fetch ALL cards for a mastery review
      cards = await api.getCards(deckId)
      if (cards.length === 0) {
        set({ cards: [], loading: false, sessionComplete: true })
        return
      }
      // Shuffle for variety
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[cards[i], cards[j]] = [cards[j], cards[i]]
      }
      set({ cards, loading: false, isReviewAll: true, cardStartTime: Date.now() })
    } else {
      set({ cards, loading: false, cardStartTime: Date.now() })
    }
  },

  startWithCards: (cards: Card[]) => {
    if (cards.length === 0) {
      set({ cards: [], loading: false, sessionComplete: true, currentIndex: 0, flipped: false, reviewed: 0, isReviewAll: true, cardStartTime: 0, cardTimes: [] })
      return
    }
    // Shuffle
    const shuffled = [...cards]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    set({
      cards: shuffled, loading: false, currentIndex: 0, flipped: false,
      sessionComplete: false, reviewed: 0, isReviewAll: true,
      cardStartTime: Date.now(), cardTimes: []
    })
  },

  flipCard: () => {
    set((state) => ({ flipped: !state.flipped }))
  },

  rateCard: async (grade: number) => {
    const { cards, currentIndex, reviewed, cardStartTime, cardTimes } = get()
    const card = cards[currentIndex]
    if (!card) return

    const timeTakenMs = Date.now() - cardStartTime
    await api.submitReview(card.id, grade, timeTakenMs)

    const newCardTimes = [...cardTimes, { cardId: card.id, timeMs: timeTakenMs }]

    // If "Again" (grade < 3), re-queue this card later in the session
    let updatedCards = cards
    if (grade < 3) {
      updatedCards = [...cards]
      const reinsertAt = Math.min(currentIndex + 3, updatedCards.length)
      updatedCards.splice(reinsertAt, 0, card)
    }

    const nextIndex = currentIndex + 1
    if (nextIndex >= updatedCards.length) {
      set({ cards: updatedCards, sessionComplete: true, reviewed: reviewed + 1, cardTimes: newCardTimes })
    } else {
      set({
        cards: updatedCards, currentIndex: nextIndex, flipped: false,
        reviewed: reviewed + 1, cardStartTime: Date.now(), cardTimes: newCardTimes
      })
    }
  },

  reset: () => {
    set({
      cards: [], currentIndex: 0, flipped: false,
      sessionComplete: false, loading: false, reviewed: 0,
      isReviewAll: false, cardStartTime: 0, cardTimes: []
    })
  }
}))
