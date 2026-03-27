import { useUIStore } from '../stores/ui-store'

/** Parse a shortcut string like "Ctrl+Shift+n" into components */
export function parseShortcut(shortcut: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = shortcut.split('+').map((p) => p.trim())
  const ctrl = parts.includes('Ctrl') || parts.includes('Meta')
  const shift = parts.includes('Shift')
  const alt = parts.includes('Alt')
  const key = parts.filter((p) => !['Ctrl', 'Meta', 'Shift', 'Alt'].includes(p)).join('+') || ''
  return { ctrl, shift, alt, key }
}

/** Check if a keyboard event matches a shortcut string */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const { ctrl, shift, alt, key } = parseShortcut(shortcut)
  if (ctrl !== (e.ctrlKey || e.metaKey)) return false
  if (shift !== e.shiftKey) return false
  if (alt !== e.altKey) return false

  const eventKey = e.key.toLowerCase()
  const targetKey = key.toLowerCase()

  // Special key mapping
  if (targetKey === 'space') return e.code === 'Space'
  if (targetKey === 'escape') return e.key === 'Escape'
  if (targetKey === 'delete') return e.key === 'Delete' || e.key === 'Backspace'
  if (targetKey === 'enter') return e.key === 'Enter'
  if (targetKey === '=') return e.key === '=' || e.key === '+'

  return eventKey === targetKey
}

/** Get the current hotkey for an action */
export function getHotkey(action: string): string {
  return useUIStore.getState().hotkeys[action] || ''
}

/** Check if event matches a named action */
export function matchesAction(e: KeyboardEvent, action: string): boolean {
  const shortcut = getHotkey(action)
  if (!shortcut) return false
  return matchesShortcut(e, shortcut)
}

/** Format a shortcut for display */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('Ctrl', '⌃')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Space', '␣')
    .replace('Escape', 'Esc')
    .replace('Delete', 'Del')
    .replace('Enter', '↵')
}

/** All shortcut categories for the settings UI */
export const shortcutCategories = [
  {
    label: 'Navigation',
    shortcuts: [
      { action: 'back', label: 'Go back' },
      { action: 'newCard', label: 'New card' },
      { action: 'newDeck', label: 'New deck' },
      { action: 'showShortcuts', label: 'Show shortcuts' },
    ]
  },
  {
    label: 'Drawing Tools',
    shortcuts: [
      { action: 'select', label: 'Select tool' },
      { action: 'pan', label: 'Pan tool' },
      { action: 'pen', label: 'Pen tool' },
      { action: 'eraser', label: 'Eraser tool' },
      { action: 'rectangle', label: 'Rectangle tool' },
      { action: 'circle', label: 'Circle tool' },
      { action: 'arrow', label: 'Arrow tool' },
      { action: 'text', label: 'Text tool' },
      { action: 'togglePenEraser', label: 'Toggle pen/eraser' },
    ]
  },
  {
    label: 'Drawing Actions',
    shortcuts: [
      { action: 'undo', label: 'Undo' },
      { action: 'redo', label: 'Redo' },
      { action: 'zoomIn', label: 'Zoom in' },
      { action: 'zoomOut', label: 'Zoom out' },
      { action: 'pasteImage', label: 'Paste image' },
      { action: 'deleteSelected', label: 'Delete selected' },
    ]
  },
  {
    label: 'Text Editor',
    shortcuts: [
      { action: 'bold', label: 'Bold' },
      { action: 'italic', label: 'Italic' },
      { action: 'underline', label: 'Underline' },
      { action: 'checklist', label: 'Toggle checklist' },
      { action: 'search', label: 'Find in text' },
    ]
  },
  {
    label: 'Study',
    shortcuts: [
      { action: 'flipCard', label: 'Flip card' },
      { action: 'rateAgain', label: 'Rate: Again' },
      { action: 'rateHard', label: 'Rate: Hard' },
      { action: 'rateGood', label: 'Rate: Good' },
      { action: 'rateEasy', label: 'Rate: Easy' },
      { action: 'submitAnswer', label: 'Submit / Next' },
    ]
  }
]
