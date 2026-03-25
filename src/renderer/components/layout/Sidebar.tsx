import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import { useUIStore } from '../../stores/ui-store'
import * as api from '../../api/ipc-client'

interface StreakInfo {
  currentStreak: number
  longestStreak: number
  studiedToday: boolean
}

export default function Sidebar() {
  const { decks, fetchDecks } = useDeckStore()
  const { pinnedDeckIds, togglePinDeck } = useUIStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [deckStreaks, setDeckStreaks] = useState<Record<number, StreakInfo>>({})
  const [deckCardCounts, setDeckCardCounts] = useState<Record<number, number>>({})

  useEffect(() => {
    fetchDecks()
  }, [fetchDecks])

  useEffect(() => {
    // Fetch card counts for each deck
    Promise.all(
      decks.map(async (deck) => {
        const stats = await api.getDeckStats(deck.id)
        return [deck.id, stats.total] as [number, number]
      })
    )
      .then((results) => {
        const map: Record<number, number> = {}
        for (const [id, count] of results) map[id] = count
        setDeckCardCounts(map)
      })
      .catch(console.error)
  }, [decks, location.pathname])

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
        {/* Pinned decks */}
        {(() => {
          const pinned = decks.filter((d) => pinnedDeckIds.has(d.id)).sort((a, b) => a.name.localeCompare(b.name))
          const unpinned = decks.filter((d) => !pinnedDeckIds.has(d.id)).sort((a, b) => a.name.localeCompare(b.name))
          const sections: { label?: string; items: typeof decks }[] = []
          if (pinned.length > 0) sections.push({ label: 'Pinned', items: pinned })
          if (unpinned.length > 0) sections.push({ label: pinned.length > 0 ? 'Decks' : undefined, items: unpinned })

          return sections.map((section, si) => (
            <div key={si}>
              {section.label && (
                <div className="text-[10px] text-gray-500 uppercase tracking-wider px-3 pt-2 pb-1">{section.label}</div>
              )}
              {section.items.map((deck) => {
                const isActive = location.pathname.includes(`/deck/${deck.id}`)
                const isPinned = pinnedDeckIds.has(deck.id)
                const streak = deckStreaks[deck.id]
                return (
                  <div
                    key={deck.id}
                    className={`group w-full text-left px-3 py-2 rounded-md text-sm mb-1 transition-colors flex items-center cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                    onClick={() => navigate(`/deck/${deck.id}`)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePinDeck(deck.id) }}
                      className={`shrink-0 mr-1.5 text-[10px] transition-opacity ${
                        isPinned ? 'opacity-100 text-yellow-400' : 'opacity-0 group-hover:opacity-50 text-gray-400 hover:!opacity-100'
                      }`}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                    >
                      &#9733;
                    </button>
                    <span className="truncate flex-1">{deck.name}</span>
                    {deckCardCounts[deck.id] != null && (
                      <span className="text-[10px] text-gray-500 shrink-0 ml-1">{deckCardCounts[deck.id]}</span>
                    )}
                    {streak && streak.currentStreak > 0 && (
                      <span className="flex items-center gap-0.5 text-xs shrink-0 ml-1" title={`${streak.currentStreak} day streak`}>
                        <span role="img" aria-label="fire">&#128293;</span>
                        {streak.currentStreak}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        })()}
      </nav>

      <div className="p-3 border-t border-gray-700 flex gap-2">
        <button
          onClick={() => navigate('/')}
          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
        >
          All Decks
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="px-2.5 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
          title="Settings"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
