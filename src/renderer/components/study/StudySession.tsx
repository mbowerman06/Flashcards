import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStudyStore } from '../../stores/study-store'
import { useDeckStore } from '../../stores/deck-store'
import StudyCard from './StudyCard'
import RatingButtons from './RatingButtons'
import StudyComplete from './StudyComplete'
import * as api from '../../api/ipc-client'

type StudyMode = 'all' | 'tag' | 'slowest'

interface Tag {
  id: number
  name: string
  color: string
}

export default function StudySession() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const {
    cards, currentIndex, flipped, sessionComplete, loading,
    reviewed, isReviewAll, cardTimes, cardStartTime, startSession, startWithCards, flipCard, rateCard, reset
  } = useStudyStore()

  const deck = decks.find((d) => d.id === Number(deckId))
  const currentCard = cards[currentIndex]
  const numericDeckId = Number(deckId)

  const [showModeSelector, setShowModeSelector] = useState(true)
  const [tags, setTags] = useState<Tag[]>([])
  const [slowestCount, setSlowestCount] = useState(10)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Live timer — starts ticking when card is shown, displays when flipped
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!showModeSelector && !sessionComplete && !loading && cardStartTime > 0) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - cardStartTime)
      }, 100)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [cardStartTime, showModeSelector, sessionComplete, loading])

  useEffect(() => {
    if (numericDeckId) {
      api.getTagsByDeck(numericDeckId).then(setTags).catch(console.error)
    }
    return () => reset()
  }, [numericDeckId, reset])

  const handleStartAll = () => {
    setShowModeSelector(false)
    startSession(numericDeckId)
  }

  const handleStartByTag = async (tagId: number) => {
    setShowModeSelector(false)
    const cardIds = await api.getCardIdsByTag(tagId)
    if (cardIds.length === 0) {
      startWithCards([])
      return
    }
    const allCards = await api.getCards(numericDeckId)
    const tagCardSet = new Set(cardIds)
    const filtered = allCards.filter((c: any) => tagCardSet.has(c.id))
    startWithCards(filtered)
  }

  const handleStartSlowest = async () => {
    setShowModeSelector(false)
    const slowCards = await api.getSlowestCards(numericDeckId, slowestCount)
    startWithCards(slowCards)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showModeSelector || sessionComplete || loading) return
      if (e.code === 'Space') { e.preventDefault(); flipCard() }
      if (flipped) {
        if (e.key === '1') rateCard(0)
        if (e.key === '2') rateCard(2)
        if (e.key === '3') rateCard(4)
        if (e.key === '4') rateCard(5)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [flipped, sessionComplete, loading, flipCard, rateCard, showModeSelector])

  // Mode selector
  if (showModeSelector) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <h2 className="text-2xl font-bold mb-2">{deck?.name ?? 'Study'}</h2>
        <p className="text-gray-500 mb-8">Choose a study mode</p>

        <div className="grid gap-4 w-full max-w-md">
          <button
            onClick={handleStartAll}
            className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:border-blue-400 transition-colors text-left"
          >
            <div className="font-semibold text-blue-700">All Cards</div>
            <div className="text-sm text-gray-500">Study due cards, or review all if none are due</div>
          </button>

          {tags.length > 0 && (
            <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
              <div className="font-semibold text-purple-700 mb-2">By Tag</div>
              <div className="text-sm text-gray-500 mb-3">Focus on cards with a specific tag</div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleStartByTag(tag.id)}
                    className="px-3 py-1.5 text-sm rounded-lg text-white hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
            <div className="font-semibold text-orange-700 mb-2">Slowest Cards</div>
            <div className="text-sm text-gray-500 mb-3">Practice cards you take the longest to answer</div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Cards:</label>
              <input
                type="number"
                value={slowestCount}
                onChange={(e) => setSlowestCount(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={100}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
              <button
                onClick={handleStartSlowest}
                className="px-4 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium"
              >
                Start
              </button>
            </div>
          </div>

          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            className="text-sm text-gray-500 hover:text-gray-700 mt-2"
          >
            Back to deck
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (sessionComplete) {
    return (
      <StudyComplete
        reviewed={reviewed}
        cardTimes={cardTimes}
        onBack={() => navigate(`/deck/${deckId}`)}
        onStudyAgain={() => setShowModeSelector(true)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full p-6">
      {/* Fixed header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">{deck?.name ?? 'Learn'}</h2>
          <p className="text-sm text-gray-500">
            Card {currentIndex + 1} of {cards.length}
            {isReviewAll && (
              <span className="ml-2 text-purple-600 font-medium">Mastery Review</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate(`/deck/${deckId}`)}
          className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          End Session
        </button>
      </div>

      {isReviewAll && currentIndex === 0 && !flipped && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 text-sm shrink-0 max-w-2xl mx-auto w-full">
          No cards are due right now. Reviewing all cards as a mastery check.
        </div>
      )}

      {/* Scrollable card area */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-2xl mx-auto">
          {currentCard && <StudyCard card={currentCard} flipped={flipped} onFlip={flipCard} />}
        </div>
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 pt-4 max-w-2xl mx-auto w-full">
        {flipped ? (
          <div>
            <div className="text-center mb-2">
              <span className="text-sm font-mono text-gray-500">
                {elapsed < 1000 ? `${elapsed}ms` :
                 elapsed < 60000 ? `${(elapsed / 1000).toFixed(1)}s` :
                 `${Math.floor(elapsed / 60000)}m ${Math.round((elapsed % 60000) / 1000)}s`}
              </span>
            </div>
            <RatingButtons onRate={rateCard} />
          </div>
        ) : (
          <div className="text-center">
            <button
              onClick={flipCard}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-lg"
            >
              Show Answer
            </button>
            <p className="text-xs text-gray-400 mt-2">or press Space</p>
          </div>
        )}
      </div>
    </div>
  )
}
