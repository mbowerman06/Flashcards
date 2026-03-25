import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import * as api from '../../api/ipc-client'
import DeckForm from './DeckForm'
import DeckStats from './DeckStats'

type SortMode = 'newest' | 'oldest' | 'az' | 'za'

export default function DeckList() {
  const { decks, fetchDecks, removeDeck, mergeDecks, loading, error } = useDeckStore()
  const [showForm, setShowForm] = useState(false)
  const [editDeck, setEditDeck] = useState<{ id: number; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [mergingDeck, setMergingDeck] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const exportDropdownRef = useRef<HTMLDivElement>(null)
  const [searchMode, setSearchMode] = useState<'decks' | 'cards'>('decks')
  const [cardSearchResults, setCardSearchResults] = useState<any[]>([])
  const [deckStats, setDeckStats] = useState<Record<number, { due: number }>>({})

  // Fetch due counts for all decks
  useEffect(() => {
    Promise.all(
      decks.map(async (deck) => {
        const stats = await api.getDeckStats(deck.id)
        return [deck.id, { due: stats.due }] as [number, { due: number }]
      })
    ).then((results) => {
      const map: Record<number, { due: number }> = {}
      for (const [id, s] of results) map[id] = s
      setDeckStats(map)
    }).catch(console.error)
  }, [decks])

  // Card search
  const performCardSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setCardSearchResults([])
      return
    }
    try {
      const results = await api.searchCards(query)
      setCardSearchResults(results)
    } catch {
      setCardSearchResults([])
    }
  }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    if (!showExportDropdown) return
    const handler = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportDropdown])

  // Auto-open new deck form from Ctrl+Shift+N
  useEffect(() => {
    if (searchParams.get('newDeck') === '1') {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    fetchDecks()
  }, [fetchDecks])

  // Validate regex separately
  const regexValid = useMemo(() => {
    if (!searchQuery) return true
    try {
      new RegExp(searchQuery, 'i')
      return true
    } catch {
      return false
    }
  }, [searchQuery])

  const filteredAndSorted = useMemo(() => {
    let result = [...decks]

    // Filter by search (regex)
    if (searchQuery) {
      if (regexValid) {
        const regex = new RegExp(searchQuery, 'i')
        result = result.filter((d) => regex.test(d.name))
      } else {
        const lower = searchQuery.toLowerCase()
        result = result.filter((d) => d.name.toLowerCase().includes(lower))
      }
    }

    // Sort
    switch (sortMode) {
      case 'newest':
        result.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        break
      case 'oldest':
        result.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        break
      case 'az':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'za':
        result.sort((a, b) => b.name.localeCompare(a.name))
        break
    }

    return result
  }, [decks, searchQuery, sortMode, regexValid])

  const handleDelete = async (id: number) => {
    await removeDeck(id)
    setConfirmDelete(null)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Your Decks</h2>
        <div className="flex gap-3">
          <div className="flex rounded-lg overflow-hidden relative" ref={exportDropdownRef}>
            <button
              onClick={() => navigate('/import')}
              className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
            >
              Import
            </button>
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              disabled={decks.length === 0}
              className="px-4 py-2 bg-green-700 text-green-200 hover:bg-green-800 transition-colors font-medium border-l border-green-500 disabled:opacity-50"
            >
              Export
            </button>
            {showExportDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                {decks.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setShowExportDropdown(false); navigate(`/deck/${d.id}/export`) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            + New Deck
          </button>
        </div>
      </div>

      {/* Search and Sort controls */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (searchMode === 'cards') {
                performCardSearch(e.target.value)
              }
            }}
            placeholder={searchMode === 'decks' ? 'Search decks (regex supported)...' : 'Search card content across all decks...'}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              !regexValid && searchMode === 'decks' ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {!regexValid && searchMode === 'decks' && (
            <span className="absolute right-3 top-2.5 text-xs text-red-500">Invalid regex</span>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-gray-300">
          <button
            onClick={() => { setSearchMode('decks'); setCardSearchResults([]) }}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              searchMode === 'decks' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Decks
          </button>
          <button
            onClick={() => { setSearchMode('cards'); if (searchQuery) performCardSearch(searchQuery) }}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              searchMode === 'cards' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Cards
          </button>
        </div>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">A - Z</option>
          <option value="za">Z - A</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Failed to load decks: {error}
        </div>
      )}

      {loading && decks.length === 0 && (
        <div className="text-center py-8 text-gray-500">Loading decks...</div>
      )}

      {(showForm || editDeck) && (
        <DeckForm
          editDeck={editDeck}
          onClose={() => {
            setShowForm(false)
            setEditDeck(null)
          }}
        />
      )}

      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {decks.length === 0 ? (
            <>
              <p className="text-lg mb-2">No decks yet</p>
              <p className="text-sm">Create your first deck to start learning!</p>
            </>
          ) : (
            <p className="text-lg">No decks match your search</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAndSorted.map((deck) => (
            <div
              key={deck.id}
              className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white cursor-pointer"
              onClick={() => navigate(`/deck/${deck.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold">{deck.name}</h3>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditDeck({ id: deck.id, name: deck.name })}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Rename"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setMergingDeck(mergingDeck === deck.id ? null : deck.id)}
                    className={`p-1.5 rounded transition-colors ${mergingDeck === deck.id ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                    title="Merge into another deck"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                  {confirmDelete === deck.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(deck.id)}
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 bg-gray-300 text-xs rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(deck.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                      title="Delete"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <DeckStats deckId={deck.id} />
              {deckStats[deck.id]?.due > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  {deckStats[deck.id].due} due
                </div>
              )}
              {mergingDeck === deck.id && (
                <div className="mt-3 pt-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-gray-500 mb-2">Merge all cards into:</p>
                  <div className="flex flex-wrap gap-1">
                    {decks.filter((d) => d.id !== deck.id).map((target) => (
                      <button
                        key={target.id}
                        onClick={async () => {
                          await mergeDecks(deck.id, target.id)
                          setMergingDeck(null)
                        }}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200"
                      >
                        {target.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card search results */}
      {searchMode === 'cards' && cardSearchResults.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Card Results</h3>
          {(() => {
            const grouped: Record<number, any[]> = {}
            for (const card of cardSearchResults) {
              if (!grouped[card.deck_id]) grouped[card.deck_id] = []
              grouped[card.deck_id].push(card)
            }
            return Object.entries(grouped).map(([deckIdStr, cards]) => {
              const deckId = Number(deckIdStr)
              const deck = decks.find((d) => d.id === deckId)
              return (
                <div key={deckId} className="mb-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">{deck?.name ?? `Deck #${deckId}`}</h4>
                  <div className="space-y-1">
                    {cards.map((card: any) => {
                      let frontText = ''
                      let backText = ''
                      try {
                        const fp = JSON.parse(card.front_content)
                        frontText = fp.markdown || ''
                      } catch {
                        frontText = card.front_content
                      }
                      try {
                        const bp = JSON.parse(card.back_content)
                        backText = bp.markdown || ''
                      } catch {
                        backText = card.back_content
                      }
                      return (
                        <div
                          key={card.id}
                          onClick={() => navigate(`/deck/${deckId}/card/${card.id}`)}
                          className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm cursor-pointer transition-shadow"
                        >
                          <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                            <div className="truncate text-sm">
                              <span className="text-gray-400 text-xs uppercase mr-2">Front</span>
                              {frontText.substring(0, 80)}
                            </div>
                            <div className="truncate text-sm">
                              <span className="text-gray-400 text-xs uppercase mr-2">Back</span>
                              {backText.substring(0, 80)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}
      {searchMode === 'cards' && searchQuery && cardSearchResults.length === 0 && (
        <div className="mt-6 text-center text-gray-500 text-sm">No cards match your search</div>
      )}
    </div>
  )
}
