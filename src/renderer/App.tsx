import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
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
      // Skip if in an input
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || (active as HTMLElement).isContentEditable)) return

      // Escape: go back to deck list from inside a deck
      if (e.key === 'Escape') {
        const deckMatch = location.pathname.match(/\/deck\/(\d+)/)
        if (deckMatch) {
          e.preventDefault()
          navigate('/')
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        // Ctrl+Shift+N: new deck — navigate to home which has the form
        e.preventDefault()
        navigate('/?newDeck=1')
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        // Ctrl+N: new card in current deck
        e.preventDefault()
        const deckMatch = location.pathname.match(/\/deck\/(\d+)/)
        if (deckMatch) {
          navigate(`/deck/${deckMatch[1]}/card/new`)
        }
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, location.pathname])

  return null
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
      <div className="flex flex-1 min-h-0">
      <Sidebar />
      <main className="flex-1 overflow-auto">
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
      </main>
      </div>
      <Toast />
    </div>
  )
}
