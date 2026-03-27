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
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`
}

export default function MatchingGame() {
  const { deckId } = useParams<{ deckId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const decks = useDeckStore((s) => s.decks)
  const deck = decks.find((d) => d.id === Number(deckId))
  const numericDeckId = Number(deckId)
  const containerRef = useRef<HTMLDivElement>(null)

  const [items, setItems] = useState<MatchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [gameComplete, setGameComplete] = useState(false)
  const [matchedCount, setMatchedCount] = useState(0)
  const [totalPairs, setTotalPairs] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [penalty, setPenalty] = useState(0)
  const [wrongFlash, setWrongFlash] = useState<Set<string>>(new Set())

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })

  // Load cards
  useEffect(() => {
    const cardIdsParam = searchParams.get('cards')
    if (!cardIdsParam) { setLoading(false); return }
    const ids = cardIdsParam.split(',').map(Number).filter(Boolean)
    api.getCards(numericDeckId).then((allCards) => {
      const idSet = new Set(ids)
      const validCards = allCards.filter((c: Card) => idSet.has(c.id))
      const picked = shuffle(validCards).slice(0, 6)
      if (picked.length < 2) { setLoading(false); return }
      setTotalPairs(picked.length)

      const gameItems: MatchItem[] = []
      for (const card of picked) {
        const front = parseContent(card.front_content).plainText.substring(0, 60)
        const back = parseContent(card.back_content).plainText.substring(0, 60)
        // Position at 0,0 initially — will scatter after mount
        gameItems.push({ id: `f-${card.id}`, cardId: card.id, text: front || '(empty)', side: 'front', x: 0, y: 0, matched: false })
        gameItems.push({ id: `b-${card.id}`, cardId: card.id, text: back || '(empty)', side: 'back', x: 0, y: 0, matched: false })
      }
      setItems(shuffle(gameItems))
      setStartTime(Date.now())
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [numericDeckId, searchParams])

  // Scatter items once container is measured
  useEffect(() => {
    if (loading || items.length === 0) return
    const scatter = () => {
      const container = containerRef.current
      if (!container) { setTimeout(scatter, 50); return }
      const rect = container.getBoundingClientRect()
      if (rect.width === 0) { setTimeout(scatter, 50); return }
      setItems((prev) => prev.map((i) => ({ ...i, ...randomPos(rect.width, rect.height, 180, 60) })))
    }
    setTimeout(scatter, 100)
  }, [loading, items.length > 0])

  // Timer
  useEffect(() => {
    if (loading || gameComplete || startTime === 0) return
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime + penalty * 1000)
    }, 100)
    return () => clearInterval(interval)
  }, [loading, gameComplete, startTime, penalty])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, itemId: string) => {
    e.preventDefault()
    const item = items.find((i) => i.id === itemId)
    if (!item || item.matched) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setDraggingId(itemId)
    // Offset = cursor position relative to the item's top-left corner
    setDragOffset({ x: e.clientX - rect.left - item.x, y: e.clientY - rect.top - item.y })
    setDragPos({ x: item.x, y: item.y })
  }, [items])

  useEffect(() => {
    if (!draggingId) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()

    const onMove = (e: MouseEvent) => {
      setDragPos({
        x: Math.max(0, Math.min(rect.width - 120, e.clientX - rect.left - dragOffset.x)),
        y: Math.max(0, Math.min(rect.height - 40, e.clientY - rect.top - dragOffset.y))
      })
    }

    const onUp = (e: MouseEvent) => {
      const dropX = e.clientX - rect.left
      const dropY = e.clientY - rect.top
      const draggedItem = items.find((i) => i.id === draggingId)
      if (!draggedItem) { setDraggingId(null); return }

      // Find item under drop point
      const target = items.find((i) =>
        i.id !== draggingId && !i.matched &&
        dropX >= i.x && dropX <= i.x + 180 &&
        dropY >= i.y && dropY <= i.y + 60
      )

      if (target && target.cardId === draggedItem.cardId && target.side !== draggedItem.side) {
        // Correct match!
        setItems((prev) => prev.map((i) =>
          i.cardId === draggedItem.cardId ? { ...i, matched: true } : i
        ))
        setMatchedCount((prev) => {
          const next = prev + 1
          if (next >= totalPairs) setGameComplete(true)
          return next
        })
      } else if (target) {
        // Wrong match — penalty + flash + rescatter both
        setPenalty((prev) => prev + 1)
        setWrongFlash(new Set([draggingId, target.id]))
        setTimeout(() => {
          setWrongFlash(new Set())
          setItems((prev) => prev.map((i) => {
            if (i.id === draggingId || i.id === target.id) {
              return { ...i, ...randomPos(rect.width, rect.height, 180, 60) }
            }
            return i
          }))
        }, 500)
      } else {
        // Dropped in empty space — update position
        setItems((prev) => prev.map((i) =>
          i.id === draggingId ? { ...i, x: dragPos.x, y: dragPos.y } : i
        ))
      }
      setDraggingId(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingId, dragOffset, dragPos, items, totalPairs])

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
            <div className="text-xs text-gray-500">Time</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-green-600">{totalPairs}</div>
            <div className="text-xs text-gray-500">Pairs</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-red-600">{penalty}</div>
            <div className="text-xs text-gray-500">Mistakes</div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Play Again</button>
          <button onClick={() => navigate(`/deck/${deckId}`)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Back to Deck</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-sm">{deck?.name} — Match</h2>
          <span className="text-sm text-gray-500">{matchedCount}/{totalPairs} matched</span>
          <span className="text-sm font-mono text-gray-600">{formatTime(elapsed)}</span>
          {penalty > 0 && <span className="text-xs text-red-500">+{penalty}s penalty</span>}
        </div>
        <button onClick={() => navigate(`/deck/${deckId}`)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600">End</button>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-100 dark:bg-gray-900">
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-400">Drag terms onto their matching definitions</p>
        {items.filter((i) => !i.matched).map((item) => {
          const isDragging = draggingId === item.id
          const isWrong = wrongFlash.has(item.id)
          const x = isDragging ? dragPos.x : item.x
          const y = isDragging ? dragPos.y : item.y
          return (
            <div
              key={item.id}
              onMouseDown={(e) => handleMouseDown(e, item.id)}
              className={`absolute px-3 py-2 rounded-lg shadow-md select-none text-sm font-medium max-w-[180px] truncate transition-colors ${
                isDragging ? 'z-50 scale-105 shadow-xl cursor-grabbing' : 'cursor-grab'
              } ${
                isWrong
                  ? 'bg-red-500 text-white scale-95'
                  : item.side === 'front'
                    ? 'bg-white dark:bg-gray-800 border-2 border-blue-300 text-gray-800 dark:text-gray-200 hover:shadow-lg'
                    : 'bg-white dark:bg-gray-800 border-2 border-green-300 text-gray-800 dark:text-gray-200 hover:shadow-lg'
              }`}
              style={{
                left: x,
                top: y,
                minWidth: '120px',
                transition: isDragging ? 'none' : 'left 0.3s, top 0.3s, transform 0.2s'
              }}
            >
              <span className="text-[9px] uppercase opacity-50 block leading-none mb-0.5">
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
