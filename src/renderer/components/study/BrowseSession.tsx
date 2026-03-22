import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import type { Card } from '../../stores/card-store'
import * as api from '../../api/ipc-client'
import StudyCard from './StudyCard'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function BrowseSession() {
  const { deckId } = useParams<{ deckId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const deck = decks.find((d) => d.id === Number(deckId))

  const [cards, setCards] = useState<Card[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const fetched = await api.getCards(Number(deckId))
      // If specific card IDs are passed, filter to only those in the given order
      const cardIdsParam = searchParams.get('cards')
      if (cardIdsParam) {
        const ids = cardIdsParam.split(',').map(Number).filter(Boolean)
        const idSet = new Set(ids)
        const idOrder = new Map(ids.map((id, i) => [id, i]))
        const filtered = fetched
          .filter((c: Card) => idSet.has(c.id))
          .sort((a: Card, b: Card) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
        setCards(filtered)
      } else {
        setCards(fetched)
      }
      setCurrentIndex(0)
      setFlipped(false)
      setLoading(false)
    })()
  }, [deckId, searchParams])

  const currentCard = cards[currentIndex]
  const total = cards.length

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1)
      setFlipped(false)
    }
  }, [currentIndex, total])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setFlipped(false)
    }
  }, [currentIndex])

  const toggleShuffle = useCallback(() => {
    const newShuffled = !shuffled
    setShuffled(newShuffled)
    setCards((prev) => newShuffled ? shuffle(prev) : prev)
    setCurrentIndex(0)
    setFlipped(false)
  }, [shuffled])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); setFlipped((f) => !f) }
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); goNext() }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-gray-500 mb-4">No cards in this deck.</p>
        <button
          onClick={() => navigate(`/deck/${deckId}`)}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Back to Deck
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6">
      {/* Fixed header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">{deck?.name ?? 'Browse'}</h2>
          <p className="text-sm text-gray-500">Card {currentIndex + 1} of {total}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleShuffle}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              shuffled ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Shuffle {shuffled ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Back
          </button>
        </div>
      </div>

      {/* Scrollable card area */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-2xl mx-auto">
          {currentCard && (
            <StudyCard
              card={currentCard}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
            />
          )}
        </div>
      </div>

      {/* Fixed footer navigation */}
      <div className="shrink-0 pt-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            &larr; Prev
          </button>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
          >
            Flip
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next &rarr;
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Arrow keys to navigate, Space to flip
        </p>
      </div>
    </div>
  )
}
