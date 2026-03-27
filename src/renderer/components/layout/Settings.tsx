import { useState, useRef } from 'react'
import { useUIStore } from '../../stores/ui-store'
import * as api from '../../api/ipc-client'
import type { PaperMode } from '../../lib/card-content'
import { shortcutCategories } from '../../lib/keybindings'

export default function Settings() {
  const store = useUIStore()
  const [editingHotkey, setEditingHotkey] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const section = 'border-b border-gray-200 dark:border-gray-700 pb-5'
  const label = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2'
  const desc = 'text-xs text-gray-400 dark:text-gray-500 mt-1.5'
  const btnA = 'px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white'
  const btnI = 'px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'

  const handleHotkeyCapture = (action: string) => {
    setEditingHotkey(action)
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      let key = ''
      if (e.ctrlKey || e.metaKey) key += 'Ctrl+'
      if (e.shiftKey) key += 'Shift+'
      if (e.altKey) key += 'Alt+'
      if (e.key === ' ') key += 'Space'
      else if (e.key.length === 1) key += e.key.toLowerCase()
      else if (e.key === 'Escape') { setEditingHotkey(null); window.removeEventListener('keydown', handler, true); return }
      else key += e.key
      store.setHotkey(action, key)
      setEditingHotkey(null)
      window.removeEventListener('keydown', handler, true)
    }
    window.addEventListener('keydown', handler, true)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="space-y-5">

        <div className={section}>
          <label className={label}>Appearance</label>
          <div className="flex gap-2">
            <button onClick={() => store.setTheme('light')} className={store.theme === 'light' ? btnA : btnI}>Light</button>
            <button onClick={() => store.setTheme('dark')} className={store.theme === 'dark' ? btnA : btnI}>Dark</button>
          </div>
        </div>

        <div className={section}>
          <label className={label}>Rating Mode</label>
          <div className="flex gap-2">
            <button onClick={() => store.setRatingMode('simple')} className={store.ratingMode === 'simple' ? btnA : btnI}>Simple</button>
            <button onClick={() => store.setRatingMode('detailed')} className={store.ratingMode === 'detailed' ? btnA : btnI}>Detailed (4 buttons)</button>
          </div>
          <p className={desc}>Can also be toggled during study sessions</p>
        </div>

        <div className={section}>
          <label className={label}>Default Paper Style</label>
          <div className="flex gap-2 mb-3">
            {(['plain', 'lined', 'grid', 'dot'] as PaperMode[]).map((p) => (
              <button key={p} onClick={() => store.setDefaultPaperMode(p)}
                className={`capitalize ${store.defaultPaperMode === p ? btnA : btnI}`}>{p}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Default Spacing</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min={10} max={80} value={store.defaultGridSpacing}
                  onChange={(e) => store.setDefaultGridSpacing(Number(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono w-6 text-right">{store.defaultGridSpacing}</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Default Margin</span>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min={0} max={400} value={store.defaultMargin}
                  onChange={(e) => store.setDefaultMargin(Number(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono w-6 text-right">{store.defaultMargin}</span>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={store.snapToGrid} onChange={(e) => store.setSnapToGrid(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Snap objects to grid</span>
          </label>
        </div>

        <div className={section}>
          <label className={label}>Drawing Text Size</label>
          <div className="flex items-center gap-3">
            <input type="range" min={10} max={48} value={store.drawingFontSize}
              onChange={(e) => store.setDrawingFontSize(Number(e.target.value))} className="flex-1" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-10 text-right">{store.drawingFontSize}px</span>
          </div>
        </div>

        <div className={section}>
          <label className={label}>Auto-save Interval</label>
          <div className="flex gap-2">
            {[500, 1000, 2000, 5000].map((ms) => (
              <button key={ms} onClick={() => store.setAutoSaveInterval(ms)}
                className={store.autoSaveInterval === ms ? btnA : btnI}>
                {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
              </button>
            ))}
          </div>
        </div>

        <div className={section}>
          <label className={label}>Default Sort</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Decks</span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'custom', l: 'Custom' }, { v: 'newest', l: 'Newest' }, { v: 'oldest', l: 'Oldest' },
                  { v: 'az', l: 'A-Z' }, { v: 'za', l: 'Z-A' }
                ] as const).map(({ v, l }) => (
                  <button key={v} onClick={() => store.setDefaultDeckSort(v as any)}
                    className={store.defaultDeckSort === v ? btnA : btnI}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Cards</span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'custom', l: 'Custom' }, { v: 'newest', l: 'Newest' }, { v: 'oldest', l: 'Oldest' },
                  { v: 'az', l: 'A-Z' }, { v: 'za', l: 'Z-A' }, { v: 'bestTime', l: 'Best' }, { v: 'avgTime', l: 'Avg' }
                ] as const).map(({ v, l }) => (
                  <button key={v} onClick={() => store.setDefaultCardSort(v as any)}
                    className={store.defaultCardSort === v ? btnA : btnI}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={section}>
          <label className={label}>Window</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={store.startFullscreen} onChange={(e) => store.setStartFullscreen(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Start maximized</span>
          </label>
        </div>

        <div className={section}>
          <label className={label}>Backup &amp; Restore</label>
          <p className={desc} style={{ marginTop: 0, marginBottom: 12 }}>Export your database as a backup file or import a previous backup. Importing will restart the app.</p>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                try {
                  const data = await api.backupExport()
                  const blob = new Blob([data], { type: 'application/octet-stream' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  const date = new Date().toISOString().slice(0, 10)
                  a.href = url
                  a.download = `flashcards-backup-${date}.bak`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (err) {
                  console.error('Backup export failed:', err)
                }
              }}
              className={btnI}
            >
              Export Backup
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={btnI}
            >
              Import Backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bak"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const text = await file.text()
                  await api.backupImport(text)
                } catch (err) {
                  console.error('Backup import failed:', err)
                }
              }}
            />
          </div>
          <p className="text-xs text-red-400 mt-2">Warning: Importing a backup will replace your current data and restart the app.</p>
        </div>

        {/* Editable keyboard shortcuts */}
        <div>
          <label className={label}>Keyboard Shortcuts</label>
          <p className={desc} style={{ marginTop: 0, marginBottom: 12 }}>Click any shortcut to rebind it. Press Escape to cancel.</p>
          <div className="space-y-4">
            {shortcutCategories.map((cat) => (
              <div key={cat.label}>
                <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">{cat.label}</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                  {cat.shortcuts.map(({ action, label: actionLabel }) => (
                    <div key={action} className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{actionLabel}</span>
                      <button
                        onClick={() => handleHotkeyCapture(action)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono min-w-[70px] text-center transition-colors ${
                          editingHotkey === action
                            ? 'bg-blue-600 text-white animate-pulse'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {editingHotkey === action ? 'Press a key...' : store.hotkeys[action] || '—'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const defaults = useUIStore.getState()
              // Reset all to defaults by clearing persisted hotkeys
              const fresh: Record<string, string> = {}
              for (const cat of shortcutCategories) {
                for (const s of cat.shortcuts) {
                  fresh[s.action] = useUIStore.getState().hotkeys[s.action]
                }
              }
              // Reset to original defaults
              useUIStore.setState({
                hotkeys: {
                  back: 'Escape', newCard: 'Ctrl+n', newDeck: 'Ctrl+Shift+n', showShortcuts: 'Ctrl+/',
                  select: 'v', pan: 'h', pen: 'p', eraser: 'e',
                  rectangle: 'r', circle: 'o', arrow: 'a', text: 't',
                  togglePenEraser: 'Space', undo: 'Ctrl+z', redo: 'Ctrl+y',
                  zoomIn: 'Ctrl+=', zoomOut: 'Ctrl+-', pasteImage: 'Ctrl+v', deleteSelected: 'Delete',
                  bold: 'Ctrl+b', italic: 'Ctrl+i', underline: 'Ctrl+u', checklist: 'Ctrl+l', search: 'Ctrl+f',
                  flipCard: 'Space', rateAgain: '1', rateHard: '2', rateGood: '3', rateEasy: '4', submitAnswer: 'Enter',
                }
              })
            }}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Reset all to defaults
          </button>
        </div>
      </div>
    </div>
  )
}
