import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import type { Card } from '../../stores/card-store'
import * as api from '../../api/ipc-client'
import { parseContent } from '../../lib/card-content'

interface MatchItem {
  id: string
  cardId: number
  text: string
  side: 'front' | 'back'
  x: number
  y: number
  matched: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function randomPos(maxW: number, maxH: number, itemW: number, itemH: number): { x: number; y: number } {
  return {
    x: Math.random() * Math.max(0, maxW - itemW),
    y: Math.random() * Math.max(0, maxH - itemH)
  }
}

function formatTime(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export default function MatchingGame() {
  const { deckId } = useParams<{ deckId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const deck = decks.find((d) => d.id === Number(deckId))
  const numericDeckId = Number(deckId)
  const containerRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<MatchItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [penalty, setPenalty] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [totalPairs, setTotalPairs] = useState(0)
  const [gameComplete, setGameComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [wrongFlash, setWrongFlash] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load and setup game
  useEffect(() => {
    (async () => {
      setLoading(true)
      let cards = await api.getCards(numericDeckId)
      const cardIdsParam = searchParams.get('cards')
      if (cardIdsParam) {
        const ids = new Set(cardIdsParam.split(',').map(Number))
        cards = cards.filter((c: Card) => ids.has(c.id))
      }
      // Pick 6 random cards
      const picked = shuffle(cards).slice(0, 6)
      setTotalPairs(picked.length)

      // Create items — will position after container is measured
      const gameItems: MatchItem[] = []
      for (const card of picked) {
        const front = parseContent(card.front_content).markdown.substring(0, 60)
        const back = parseContent(card.back_content).markdown.substring(0, 60)
        gameItems.push({ id: `f-${card.id}`, cardId: card.id, text: front || '(empty)', side: 'front', x: 0, y: 0, matched: false })
        gameItems.push({ id: `b-${card.id}`, cardId: card.id, text: back || '(empty)', side: 'back', x: 0, y: 0, matched: false })
      }
      setItems(shuffle(gameItems))
      setMatchedCount(0)
      setGameComplete(false)
      setPenalty(0)
      setSelected(null)
      setLoading(false)
    })()
  }, [numericDeckId, searchParams])

  // Position items after layout
  useEffect(() => {
    if (loading || items.length === 0 || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const itemW = 180
    const itemH = 60
    setItems((prev) => prev.map((item) => {
      const pos = randomPos(rect.width, rect.height, itemW, itemH)
      return { ...item, x: pos.x, y: pos.y }
    }))
    setStartTime(Date.now())
  }, [loading, items.length])

  // Timer
  useEffect(() => {
    if (loading || gameComplete) return
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTime + penalty * 1000)
    }, 100)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [startTime, loading, gameComplete, penalty])

  const handleItemClick = useCallback((clickedId: string) => {
    const clickedItem = items.find((i) => i.id === clickedId)
    if (!clickedItem || clickedItem.matched) return

    if (!selected) {
      setSelected(clickedId)
      return
    }

    if (selected === clickedId) {
      setSelected(null)
      return
    }

    const selectedItem = items.find((i) => i.id === selected)
    if (!selectedItem) { setSelected(null); return }

    // Check match — must be same card, different sides
    if (selectedItem.cardId === clickedItem.cardId && selectedItem.side !== clickedItem.side) {
      // Correct match!
      setItems((prev) => prev.map((i) =>
        i.cardId === clickedItem.cardId ? { ...i, matched: true } : i
      ))
      setMatchedCount((prev) => {
        const next = prev + 1
        if (next >= totalPairs) {
          setGameComplete(true)
        }
        return next
      })
      setSelected(null)
    } else {
      // Wrong match — add 1s penalty, flash red, rescatter the two items
      setPenalty((prev) => prev + 1)
      setWrongFlash(new Set([selected, clickedId]))
      setTimeout(() => {
        setWrongFlash(new Set())
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          setItems((prev) => prev.map((i) => {
            if (i.id === selected || i.id === clickedId) {
              const pos = randomPos(rect.width, rect.height, 180, 60)
              return { ...i, x: pos.x, y: pos.y }
            }
            return i
          }))
        }
      }, 500)
      setSelected(null)
    }
  }, [selected, items, totalPairs])

  if (loading) {
    return <div className="flex items-center justify-center h-full"><p className="text-gray-500">Loading...</p></div>
  }

  if (gameComplete) {
    const finalTime = elapsed
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="text-5xl mb-4">&#127942;</div>
        <h2 className="text-2xl font-bold mb-2">Matching Complete!</h2>
        <p className="text-gray-600 mb-1">{deck?.name}</p>
        <div className="grid grid-cols-3 gap-4 my-6 max-w-md">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-blue-600">{formatTime(finalTime)}</div>
            <div className="text-xs text-gray-500">Total Time</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-green-600">{totalPairs}</div>
            <div className="text-xs text-gray-500">Pairs Matched</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-red-600">+{penalty}s</div>
            <div className="text-xs text-gray-500">Penalties</div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate(`/deck/${deckId}/match${searchParams.get('cards') ? `?cards=${searchParams.get('cards')}` : ''}`)}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">
            Play Again
          </button>
          <button onClick={() => navigate(`/deck/${deckId}`)}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-medium">
            Back to Deck
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 shrink-0 bg-gray-50 border-b">
        <div>
          <h2 className="text-lg font-semibold">{deck?.name ?? 'Match'}</h2>
          <p className="text-sm text-gray-500">
            {matchedCount}/{totalPairs} matched
            {penalty > 0 && <span className="text-red-500 ml-2">+{penalty}s penalty</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-lg font-mono font-bold text-gray-700">{formatTime(elapsed)}</span>
          <button onClick={() => navigate(`/deck/${deckId}`)}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            End
          </button>
        </div>
      </div>

      {/* Game area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-100">
        {items.filter((i) => !i.matched).map((item) => {
          const isSelected = selected === item.id
          const isWrong = wrongFlash.has(item.id)
          return (
            <div
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={`absolute px-3 py-2 rounded-lg shadow-md cursor-pointer select-none text-sm font-medium transition-all duration-200 max-w-[180px] truncate ${
                isWrong
                  ? 'bg-red-500 text-white scale-95'
                  : isSelected
                    ? 'bg-blue-600 text-white scale-105 ring-2 ring-blue-300'
                    : item.side === 'front'
                      ? 'bg-white border-2 border-blue-300 text-gray-800 hover:shadow-lg'
                      : 'bg-white border-2 border-green-300 text-gray-800 hover:shadow-lg'
              }`}
              style={{
                left: item.x,
                top: item.y,
                minWidth: '120px'
              }}
            >
              <span className="text-[9px] uppercase text-opacity-50 block leading-none mb-0.5">
                {item.side === 'front' ? 'term' : 'def'}
              </span>
              {item.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
