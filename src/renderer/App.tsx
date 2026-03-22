import { Routes, Route, Navigate } from 'react-router-dom'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/layout/Sidebar'
import DeckList from './components/deck/DeckList'
import CardList from './components/card/CardList'
import CardEditor from './components/card/CardEditor'
import BulkCardEditor from './components/card/BulkCardEditor'
import ImportCards from './components/deck/ImportCards'
import StudySession from './components/study/StudySession'
import BrowseSession from './components/study/BrowseSession'
import DeckStatsPage from './components/study/DeckStatsPage'

export default function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />
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
          <Route path="/deck/:deckId/stats" element={<DeckStatsPage />} />
          {/* Catch-all: redirect to home instead of white screen */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      </div>
    </div>
  )
}
