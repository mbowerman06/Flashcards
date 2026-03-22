import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
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

export default function DeckStatsPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const [timeStats, setTimeStats] = useState<DeckTimeStats | null>(null)
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([])
  const [streak, setStreak] = useState<StreakInfo | null>(null)
  const numericDeckId = Number(deckId)
  const deck = decks.find((d) => d.id === numericDeckId)

  useEffect(() => {
    if (!numericDeckId) return
    api.getDeckTimeStats(numericDeckId).then(setTimeStats).catch(console.error)
    api.getDeckReviewHistory(numericDeckId).then(setHistory).catch(console.error)
    api.getStreak(numericDeckId).then(setStreak).catch(console.error)
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

      {(!timeStats || timeStats.totalReviews === 0) && history.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No study data yet</p>
          <p className="text-sm">Start reviewing cards to see your progress!</p>
        </div>
      )}
    </div>
  )
}
