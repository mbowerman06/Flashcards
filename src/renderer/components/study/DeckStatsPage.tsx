import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import { parseContent } from '../../lib/card-content'
import * as api from '../../api/ipc-client'

interface DeckTimeStats {
  totalTimeMs: number
  avgTimePerCardMs: number
  totalReviews: number
  fastestCardId: number | null
  fastestCardMs: number
  slowestCardId: number | null
  slowestCardMs: number
}

interface ReviewHistoryEntry {
  date: string
  reviewCount: number
  avgTimeMs: number
  correctCount: number
  totalCount: number
}

interface StreakInfo {
  currentStreak: number
  longestStreak: number
  studiedToday: boolean
}

function formatTime(ms: number): string {
  if (ms === 0) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes < 60) return `${minutes}m ${remaining}s`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return `${hours}h ${remMin}m`
}

function SimpleLineChart({
  data,
  getValue,
  getLabel,
  color,
  title,
  formatValue
}: {
  data: ReviewHistoryEntry[]
  getValue: (d: ReviewHistoryEntry) => number
  getLabel: (d: ReviewHistoryEntry) => string
  color: string
  title: string
  formatValue: (v: number) => string
}) {
  if (data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
        <p className="text-gray-400 text-sm">No data yet</p>
      </div>
    )
  }

  const values = data.map(getValue)
  const maxVal = Math.max(...values, 1)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1

  const width = 500
  const height = 180
  const padLeft = 50
  const padRight = 10
  const padTop = 10
  const padBottom = 30
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const points = values.map((v, i) => {
    const x = padLeft + (i / Math.max(values.length - 1, 1)) * chartW
    const y = padTop + chartH - ((v - minVal) / range) * chartH
    return `${x},${y}`
  })
  const polyline = points.join(' ')

  // Y-axis labels (3 ticks)
  const yTicks = [minVal, minVal + range / 2, maxVal]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = padTop + chartH - ((tick - minVal) / range) * chartH
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={padLeft - 5} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
                {formatValue(tick)}
              </text>
            </g>
          )
        })}

        {/* Line */}
        <polyline fill="none" stroke={color} strokeWidth={2} points={polyline} />

        {/* Dots */}
        {values.map((v, i) => {
          const x = padLeft + (i / Math.max(values.length - 1, 1)) * chartW
          const y = padTop + chartH - ((v - minVal) / range) * chartH
          return <circle key={i} cx={x} cy={y} r={3} fill={color} />
        })}

        {/* X-axis labels (show first, middle, last) */}
        {data.length > 0 && [0, Math.floor(data.length / 2), data.length - 1]
          .filter((idx, i, arr) => arr.indexOf(idx) === i)
          .map((idx) => {
            const x = padLeft + (idx / Math.max(data.length - 1, 1)) * chartW
            return (
              <text key={idx} x={x} y={height - 5} textAnchor="middle" fontSize={10} fill="#9ca3af">
                {getLabel(data[idx])}
              </text>
            )
          })}
      </svg>
    </div>
  )
}

interface CardData {
  id: number
  front_content: string
  back_content: string
  ease_factor: number
  interval: number
  repetition: number
  next_review: string
  created_at: string
  updated_at: string
}

function getCardMaturityColor(repetition: number, interval: number): { bg: string; text: string; label: string } {
  if (repetition === 0) return { bg: 'bg-gray-200', text: 'text-gray-600', label: 'New' }
  if (interval < 7) return { bg: 'bg-yellow-200', text: 'text-yellow-700', label: 'Learning' }
  if (interval < 30) return { bg: 'bg-blue-200', text: 'text-blue-700', label: 'Young' }
  return { bg: 'bg-green-200', text: 'text-green-700', label: 'Mature' }
}

function getMaturityBarColor(repetition: number, interval: number): string {
  if (repetition === 0) return '#9ca3af'
  if (interval < 7) return '#eab308'
  if (interval < 30) return '#3b82f6'
  return '#22c55e'
}

export default function DeckStatsPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const [timeStats, setTimeStats] = useState<DeckTimeStats | null>(null)
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([])
  const [streak, setStreak] = useState<StreakInfo | null>(null)
  const [cards, setCards] = useState<CardData[]>([])
  const [cardDetailsOpen, setCardDetailsOpen] = useState(false)
  const numericDeckId = Number(deckId)
  const deck = decks.find((d) => d.id === numericDeckId)

  useEffect(() => {
    if (!numericDeckId) return
    api.getDeckTimeStats(numericDeckId).then(setTimeStats).catch(console.error)
    api.getDeckReviewHistory(numericDeckId).then(setHistory).catch(console.error)
    api.getStreak(numericDeckId).then(setStreak).catch(console.error)
    api.getCards(numericDeckId).then(setCards).catch(console.error)
  }, [numericDeckId])

  const formatDate = (d: string) => {
    const date = new Date(d)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{deck?.name ?? 'Deck'} - Statistics</h2>
          <p className="text-sm text-gray-500">
            {timeStats ? `${timeStats.totalReviews} total reviews` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => navigate(`/deck/${deckId}`)}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
        >
          Back to Deck
        </button>
      </div>

      {/* Streak info */}
      {streak && (
        <div className="flex gap-4 mb-6">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">&#128293;</span>
              <span className="text-xl font-bold text-orange-600">{streak.currentStreak}</span>
            </div>
            <div className="text-sm text-gray-600">Current streak (days)</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">&#127942;</span>
              <span className="text-xl font-bold text-yellow-600">{streak.longestStreak}</span>
            </div>
            <div className="text-sm text-gray-600">Longest streak (days)</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex-1">
            <div className="text-xl font-bold text-green-600 mb-1">
              {streak.studiedToday ? 'Yes' : 'Not yet'}
            </div>
            <div className="text-sm text-gray-600">Studied today</div>
          </div>
        </div>
      )}

      {/* Time stats cards */}
      {timeStats && timeStats.totalReviews > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="text-blue-600 font-bold text-lg">{formatTime(timeStats.totalTimeMs)}</div>
            <div className="text-gray-500 text-xs">Total study time</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-green-600 font-bold text-lg">{formatTime(timeStats.avgTimePerCardMs)}</div>
            <div className="text-gray-500 text-xs">Avg per review</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 text-center">
            <div className="text-purple-600 font-bold text-lg">{formatTime(timeStats.fastestCardMs)}</div>
            <div className="text-gray-500 text-xs">Fastest card avg</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 text-center">
            <div className="text-orange-600 font-bold text-lg">{formatTime(timeStats.slowestCardMs)}</div>
            <div className="text-gray-500 text-xs">Slowest card avg</div>
          </div>
        </div>
      )}

      {/* Graphs */}
      <div className="space-y-4">
        <SimpleLineChart
          data={history}
          getValue={(d) => d.avgTimeMs}
          getLabel={(d) => formatDate(d.date)}
          color="#3b82f6"
          title="Average Time per Card (by day)"
          formatValue={(v) => formatTime(v)}
        />
        <SimpleLineChart
          data={history}
          getValue={(d) => Math.round((d.correctCount / d.totalCount) * 100)}
          getLabel={(d) => formatDate(d.date)}
          color="#22c55e"
          title="Accuracy % (by day)"
          formatValue={(v) => `${Math.round(v)}%`}
        />
        <SimpleLineChart
          data={history}
          getValue={(d) => d.reviewCount}
          getLabel={(d) => formatDate(d.date)}
          color="#a855f7"
          title="Reviews per Day"
          formatValue={(v) => `${Math.round(v)}`}
        />
      </div>

      {/* Card Details collapsible section */}
      {cards.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setCardDetailsOpen(!cardDetailsOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
          >
            <svg
              className={`w-4 h-4 transition-transform ${cardDetailsOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Card Details ({cards.length} cards)
          </button>

          {cardDetailsOpen && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Front Preview</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Ease</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Interval</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Reps</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Next Review</th>
                      <th className="px-3 py-2 font-medium text-gray-600 w-24">Maturity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((card) => {
                      const front = parseContent(card.front_content)
                      const preview = front.markdown.replace(/[#*_~`>\-\[\]()!]/g, '').trim()
                      const displayPreview = preview.length > 40 ? preview.substring(0, 40) + '...' : preview || '(empty)'
                      const maturity = getCardMaturityColor(card.repetition, card.interval)
                      const barColor = getMaturityBarColor(card.repetition, card.interval)
                      // Maturity bar width: scale interval, cap at 90 days for full bar
                      const barWidth = Math.min(100, (card.interval / 90) * 100)
                      const nextReviewDate = card.next_review ? new Date(card.next_review) : null
                      const nextReviewStr = nextReviewDate
                        ? `${nextReviewDate.getMonth() + 1}/${nextReviewDate.getDate()}/${nextReviewDate.getFullYear()}`
                        : '-'

                      return (
                        <tr key={card.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800 truncate max-w-[200px]" title={preview}>
                            {displayPreview}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${maturity.bg} ${maturity.text}`}>
                              {maturity.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{card.ease_factor.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{card.interval}d</td>
                          <td className="px-3 py-2 text-center text-gray-600">{card.repetition}</td>
                          <td className="px-3 py-2 text-center text-gray-600 text-xs">{nextReviewStr}</td>
                          <td className="px-3 py-2">
                            <div className="w-full bg-gray-100 rounded-full h-2" title={`${card.interval} day interval`}>
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {(!timeStats || timeStats.totalReviews === 0) && history.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No study data yet</p>
          <p className="text-sm">Start reviewing cards to see your progress!</p>
        </div>
      )}
    </div>
  )
}
