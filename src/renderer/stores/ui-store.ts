import { create } from 'zustand'

type SortMode = 'newest' | 'oldest' | 'az' | 'za'

interface UIStore {
  cardSortMode: SortMode
  setCardSortMode: (mode: SortMode) => void
  filterTagId: number | null
  setFilterTagId: (id: number | null) => void
  selectedCards: Set<number>
  setSelectedCards: (cards: Set<number>) => void
}

export const useUIStore = create<UIStore>((set) => ({
  cardSortMode: 'newest',
  setCardSortMode: (mode) => set({ cardSortMode: mode }),
  filterTagId: null,
  setFilterTagId: (id) => set({ filterTagId: id }),
  selectedCards: new Set(),
  setSelectedCards: (cards) => set({ selectedCards: cards })
}))
