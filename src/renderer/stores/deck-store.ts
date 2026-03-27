import { create } from 'zustand'
import * as api from '../api/ipc-client'

export interface Deck {
  id: number
  name: string
  description: string
  folder_id: number | null
  created_at: string
  updated_at: string
}

export interface DeckStats {
  total: number
  due: number
  new_cards: number
}

interface DeckStore {
  decks: Deck[]
  stats: Record<number, DeckStats>
  loading: boolean
  error: string | null
  fetchDecks: () => Promise<void>
  fetchDeckStats: (id: number) => Promise<void>
  addDeck: (name: string) => Promise<Deck>
  renameDeck: (id: number, name: string) => Promise<void>
  removeDeck: (id: number) => Promise<void>
  mergeDecks: (sourceId: number, targetId: number) => Promise<void>
}

export const useDeckStore = create<DeckStore>((set) => ({
  decks: [],
  stats: {},
  loading: false,
  error: null,

  fetchDecks: async () => {
    set({ loading: true, error: null })
    try {
      const decks = await api.getDecks()
      set({ decks, loading: false })
    } catch (err) {
      console.error('[DeckStore] fetchDecks failed:', err)
      set({ loading: false, error: String(err) })
    }
  },

  fetchDeckStats: async (id: number) => {
    try {
      const stats = await api.getDeckStats(id)
      set((state) => ({ stats: { ...state.stats, [id]: stats } }))
    } catch (err) {
      console.error('[DeckStore] fetchDeckStats failed:', err)
    }
  },

  addDeck: async (name: string) => {
    const deck = await api.createDeck(name)
    // Re-fetch all decks from DB to ensure consistency
    try {
      const decks = await api.getDecks()
      set({ decks })
    } catch {
      // Fallback: at least add the new deck to current list
      set((state) => ({ decks: [deck, ...state.decks] }))
    }
    return deck
  },

  renameDeck: async (id: number, name: string) => {
    await api.renameDeck(id, name)
    const decks = await api.getDecks()
    set({ decks })
  },

  removeDeck: async (id: number) => {
    await api.deleteDeck(id)
    set((state) => ({
      decks: state.decks.filter((d) => d.id !== id)
    }))
  },

  mergeDecks: async (sourceId: number, targetId: number) => {
    await api.mergeDecks(sourceId, targetId)
    const decks = await api.getDecks()
    set({ decks })
  }
}))
