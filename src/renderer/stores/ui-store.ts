import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PaperMode } from '../lib/card-content'

type SortMode = 'newest' | 'oldest' | 'az' | 'za' | 'bestTime' | 'avgTime'
export type RatingMode = 'simple' | 'detailed'
export type Theme = 'light' | 'dark'

interface UIStore {
  cardSortMode: SortMode
  setCardSortMode: (mode: SortMode) => void
  filterTagId: number | null
  setFilterTagId: (id: number | null) => void
  selectedCards: Set<number>
  setSelectedCards: (cards: Set<number>) => void
  pinnedDeckIds: Set<number>
  togglePinDeck: (id: number) => void
  ratingMode: RatingMode
  setRatingMode: (mode: RatingMode) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  defaultPaperMode: PaperMode
  setDefaultPaperMode: (mode: PaperMode) => void
  drawingFontSize: number
  setDrawingFontSize: (size: number) => void
  startFullscreen: boolean
  setStartFullscreen: (v: boolean) => void
  autoSaveInterval: number
  setAutoSaveInterval: (ms: number) => void
  defaultGridSpacing: number
  setDefaultGridSpacing: (v: number) => void
  defaultMargin: number
  setDefaultMargin: (v: number) => void
  defaultDeckSort: 'newest' | 'az'
  setDefaultDeckSort: (v: 'newest' | 'az') => void
  defaultCardSort: SortMode
  setDefaultCardSort: (v: SortMode) => void
  snapToGrid: boolean
  setSnapToGrid: (v: boolean) => void
  hotkeys: Record<string, string>
  setHotkey: (action: string, key: string) => void
  githubRepo: string
  setGithubRepo: (url: string) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      cardSortMode: 'newest',
      setCardSortMode: (mode) => set({ cardSortMode: mode }),
      filterTagId: null,
      setFilterTagId: (id) => set({ filterTagId: id }),
      selectedCards: new Set(),
      setSelectedCards: (cards) => set({ selectedCards: cards }),
      ratingMode: 'simple' as RatingMode,
      setRatingMode: (mode) => set({ ratingMode: mode }),
      theme: 'light' as Theme,
      setTheme: (theme) => set({ theme }),
      defaultPaperMode: 'plain' as PaperMode,
      setDefaultPaperMode: (mode) => set({ defaultPaperMode: mode }),
      drawingFontSize: 18,
      setDrawingFontSize: (size) => set({ drawingFontSize: size }),
      startFullscreen: true,
      setStartFullscreen: (v) => set({ startFullscreen: v }),
      autoSaveInterval: 1000,
      setAutoSaveInterval: (ms) => set({ autoSaveInterval: ms }),
      defaultGridSpacing: 30,
      setDefaultGridSpacing: (v) => set({ defaultGridSpacing: v }),
      defaultMargin: 0,
      setDefaultMargin: (v) => set({ defaultMargin: v }),
      defaultDeckSort: 'newest',
      setDefaultDeckSort: (v) => set({ defaultDeckSort: v }),
      defaultCardSort: 'newest' as SortMode,
      setDefaultCardSort: (v) => set({ defaultCardSort: v }),
      snapToGrid: false,
      setSnapToGrid: (v) => set({ snapToGrid: v }),
      hotkeys: {
        // Navigation
        back: 'Escape',
        newCard: 'Ctrl+n',
        newDeck: 'Ctrl+Shift+n',
        showShortcuts: 'Ctrl+/',
        // Drawing tools
        select: 'v', pan: 'h', pen: 'p', eraser: 'e',
        rectangle: 'r', circle: 'o', arrow: 'a', text: 't',
        togglePenEraser: 'Space',
        // Drawing actions
        undo: 'Ctrl+z', redo: 'Ctrl+y',
        zoomIn: 'Ctrl+=', zoomOut: 'Ctrl+-',
        pasteImage: 'Ctrl+v',
        deleteSelected: 'Delete',
        // Text editor
        bold: 'Ctrl+b', italic: 'Ctrl+i', underline: 'Ctrl+u',
        checklist: 'Ctrl+l', search: 'Ctrl+f',
        // Study
        flipCard: 'Space',
        rateAgain: '1', rateHard: '2', rateGood: '3', rateEasy: '4',
        submitAnswer: 'Enter',
      } as Record<string, string>,
      setHotkey: (action, key) => set((state) => ({
        hotkeys: { ...state.hotkeys, [action]: key }
      })),
      githubRepo: '',
      setGithubRepo: (url) => set({ githubRepo: url }),
      pinnedDeckIds: new Set(),
      togglePinDeck: (id) => set((state) => {
        const next = new Set(state.pinnedDeckIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { pinnedDeckIds: next }
      })
    }),
    {
      name: 'flashcards-settings',
      // Custom serialization for Set types
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const parsed = JSON.parse(str)
          if (parsed?.state?.pinnedDeckIds) {
            parsed.state.pinnedDeckIds = new Set(parsed.state.pinnedDeckIds)
          }
          if (parsed?.state?.selectedCards) {
            parsed.state.selectedCards = new Set(parsed.state.selectedCards)
          }
          return parsed
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              pinnedDeckIds: value.state.pinnedDeckIds instanceof Set
                ? [...value.state.pinnedDeckIds]
                : value.state.pinnedDeckIds,
              selectedCards: value.state.selectedCards instanceof Set
                ? [...value.state.selectedCards]
                : value.state.selectedCards
            }
          }
          localStorage.setItem(name, JSON.stringify(toStore))
        },
        removeItem: (name) => localStorage.removeItem(name)
      },
      // Don't persist transient selection state
      partialize: (state) => {
        const { selectedCards, filterTagId, ...rest } = state
        return rest as any
      }
    }
  )
)
