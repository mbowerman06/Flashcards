import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import { matchesAction, shortcutCategories } from './lib/keybindings'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/layout/Sidebar'
import DeckList from './components/deck/DeckList'
import CardList from './components/card/CardList'
import CardEditor from './components/card/CardEditor'
import BulkCardEditor from './components/card/BulkCardEditor'
import ImportCards from './components/deck/ImportCards'
import ExportCards from './components/deck/ExportCards'
import PrintCards from './components/deck/PrintCards'
import StudySession from './components/study/StudySession'
import BrowseSession from './components/study/BrowseSession'
import DeckStatsPage from './components/study/DeckStatsPage'
import TestSession from './components/study/TestSession'
import MatchingGame from './components/study/MatchingGame'
import Settings from './components/layout/Settings'
import Toast from './components/layout/Toast'
import { useUIStore } from './stores/ui-store'

function GlobalShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Back navigation — always works regardless of focus
      if (matchesAction(e, 'back')) {
        const path = location.pathname
        const subPageMatch = path.match(/^\/deck\/(\d+)\/.+/)
        if (subPageMatch) { e.preventDefault(); navigate(`/deck/${subPageMatch[1]}`); return }
        const deckMatch = path.match(/^\/deck\/(\d+)$/)
        if (deckMatch) { e.preventDefault(); navigate('/'); return }
        if (path !== '/') { e.preventDefault(); navigate('/'); return }
        return
      }

      // Show shortcuts — always works
      if (matchesAction(e, 'showShortcuts')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-shortcuts'))
        return
      }

      // Skip other shortcuts if in an input
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || (active as HTMLElement).isContentEditable)) return

      if (matchesAction(e, 'newDeck')) {
        e.preventDefault()
        navigate('/?newDeck=1')
        return
      }
      if (matchesAction(e, 'newCard')) {
        e.preventDefault()
        const deckMatch = location.pathname.match(/\/deck\/(\d+)/)
        if (deckMatch) navigate(`/deck/${deckMatch[1]}/card/new`)
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, location.pathname])

  return null
}

function ShortcutsOverlay() {
  const [show, setShow] = useState(false)
  const hotkeys = useUIStore((s) => s.hotkeys)
  useEffect(() => {
    const handler = () => setShow((p) => !p)
    window.addEventListener('toggle-shortcuts', handler)
    return () => window.removeEventListener('toggle-shortcuts', handler)
  }, [])
  if (!show) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setShow(false)}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold dark:text-white">Keyboard Shortcuts</h2>
          <button onClick={() => setShow(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="space-y-4">
          {shortcutCategories.map((cat) => (
            <div key={cat.label}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{cat.label}</div>
              {cat.shortcuts.map(({ action, label }) => (
                <div key={action} className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
                  <kbd className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono text-gray-700 dark:text-gray-300">
                    {hotkeys[action] || '—'}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-4 text-center">Customize in Settings. Press {hotkeys.showShortcuts || 'Ctrl+/'} to toggle.</p>
      </div>
    </div>
  )
}

function ResizableSidebar({ children, main }: { children: React.ReactNode; main: React.ReactNode }) {
  const [width, setWidth] = useState(256)
  return (
    <div className="flex flex-1 min-h-0">
      <div style={{ width, minWidth: 180, maxWidth: '50vw' }} className="shrink-0">
        {children}
      </div>
      <div
        className="w-1 cursor-col-resize bg-gray-800 hover:bg-blue-500 transition-colors shrink-0"
        onMouseDown={(e) => {
          e.preventDefault()
          const startX = e.clientX
          const startW = width
          const onMove = (ev: MouseEvent) => setWidth(Math.max(180, Math.min(window.innerWidth / 2, startW + ev.clientX - startX)))
          const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        }}
      />
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        {main}
      </main>
    </div>
  )
}

export default function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />
      <GlobalShortcuts />
      <ResizableSidebar main={
        <Routes>
          <Route path="/" element={<DeckList />} />
          <Route path="/import" element={<ImportCards />} />
          <Route path="/deck/:deckId" element={<CardList />} />
          <Route path="/deck/:deckId/card/new" element={<CardEditor />} />
          <Route path="/deck/:deckId/card/bulk" element={<BulkCardEditor />} />
          <Route path="/deck/:deckId/card/:cardId" element={<CardEditor />} />
          <Route path="/deck/:deckId/study" element={<StudySession />} />
          <Route path="/deck/:deckId/browse" element={<BrowseSession />} />
          <Route path="/deck/:deckId/test" element={<TestSession />} />
          <Route path="/deck/:deckId/match" element={<MatchingGame />} />
          <Route path="/deck/:deckId/stats" element={<DeckStatsPage />} />
          <Route path="/deck/:deckId/print" element={<PrintCards />} />
          <Route path="/deck/:deckId/export" element={<ExportCards />} />
          <Route path="/settings" element={<Settings />} />
          {/* Catch-all: redirect to home instead of white screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      }>
        <Sidebar />
      </ResizableSidebar>
      <Toast />
      <ShortcutsOverlay />
    </div>
  )
}
