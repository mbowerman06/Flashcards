import { create } from 'zustand'
import * as api from '../api/ipc-client'

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

interface CardStore {
  cards: Card[]
  loading: boolean
  fetchCards: (deckId: number) => Promise<void>
  addCard: (deckId: number, front: string, back: string) => Promise<Card>
  editCard: (id: number, front: string, back: string) => Promise<void>
  removeCard: (id: number) => Promise<void>
  removeCards: (ids: number[]) => Promise<void>
}

export const useCardStore = create<CardStore>((set, get) => ({
  cards: [],
  loading: false,

  fetchCards: async (deckId: number) => {
    set({ loading: true })
    const cards = await api.getCards(deckId)
    set({ cards, loading: false })
  },

  addCard: async (deckId: number, front: string, back: string) => {
    const card = await api.createCard(deckId, front, back)
    set({ cards: [card, ...get().cards] })
    return card
  },

  editCard: async (id: number, front: string, back: string) => {
    const updated = await api.updateCard(id, front, back)
    set({ cards: get().cards.map((c) => (c.id === id ? updated : c)) })
  },

  removeCard: async (id: number) => {
    await api.deleteCard(id)
    set({ cards: get().cards.filter((c) => c.id !== id) })
  },

  removeCards: async (ids: number[]) => {
    await api.deleteCards(ids)
    const idSet = new Set(ids)
    set({ cards: get().cards.filter((c) => !idSet.has(c.id)) })
  }
}))
