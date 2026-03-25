import { create } from 'zustand'

interface ToastState {
  message: string | null
  undoAction: (() => void) | null
  show: (message: string, undoAction?: () => void) => void
  dismiss: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  undoAction: null,
  show: (message, undoAction) => set({ message, undoAction: undoAction ?? null }),
  dismiss: () => set({ message: null, undoAction: null })
}))
