import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import * as api from '../../api/ipc-client'

interface StreakInfo {
  currentStreak: number
  longestStreak: number
  studiedToday: boolean
}

export default function Sidebar() {
  const { decks, fetchDecks } = useDeckStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [deckStreaks, setDeckStreaks] = useState<Record<number, StreakInfo>>({})

  useEffect(() => {
    fetchDecks()
  }, [fetchDecks])

  useEffect(() => {
    // Fetch streaks for each deck
    Promise.all(
      decks.map(async (deck) => {
        const streak = await api.getStreak(deck.id)
        return [deck.id, streak] as [number, StreakInfo]
      })
    )
      .then((results) => {
        const map: Record<number, StreakInfo> = {}
        for (const [id, streak] of results) map[id] = streak
        setDeckStreaks(map)
      })
      .catch(console.error)
  }, [decks, location.pathname]) // refresh on navigation

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <h1
          className="text-xl font-bold cursor-pointer hover:text-blue-400 transition-colors"
          onClick={() => navigate('/')}
        >
          Flashcards
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {decks.map((deck) => {
          const isActive = location.pathname.includes(`/deck/${deck.id}`)
          const streak = deckStreaks[deck.id]
          return (
            <button
              key={deck.id}
              onClick={() => navigate(`/deck/${deck.id}`)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{deck.name}</span>
                {streak && streak.currentStreak > 0 && (
                  <span className="flex items-center gap-0.5 text-xs shrink-0 ml-1" title={`${streak.currentStreak} day streak${streak.longestStreak > streak.currentStreak ? ` (best: ${streak.longestStreak})` : ''}`}>
                    <span role="img" aria-label="fire">&#128293;</span>
                    {streak.currentStreak}
                  </span>
                )}
                {streak && streak.currentStreak === 0 && !streak.studiedToday && streak.longestStreak > 0 && (
                  <span className="text-xs text-yellow-500 shrink-0 ml-1" title="Study today to start a streak!">
                    &#128293;
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => navigate('/')}
          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
        >
          All Decks
        </button>
      </div>
    </aside>
  )
}
