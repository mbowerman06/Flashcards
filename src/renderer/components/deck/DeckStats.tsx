import { useEffect } from 'react'
import { useDeckStore } from '../../stores/deck-store'

interface Props {
  deckId: number
}

export default function DeckStats({ deckId }: Props) {
  const { stats, fetchDeckStats } = useDeckStore()

  useEffect(() => {
    fetchDeckStats(deckId)
  }, [deckId, fetchDeckStats])

  const s = stats[deckId]
  if (!s) return <div className="text-sm text-gray-400">Loading...</div>

  return (
    <div className="flex gap-4 text-sm items-center">
      <span className="text-blue-600 font-medium">{s.new_cards} new</span>
      {s.due > 0 ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold">
          {s.due} due
        </span>
      ) : (
        <span className="text-orange-600 font-medium">{s.due} due</span>
      )}
      <span className="text-gray-500">{s.total} total</span>
    </div>
  )
}
