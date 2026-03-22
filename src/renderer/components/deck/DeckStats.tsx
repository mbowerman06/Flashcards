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
    <div className="flex gap-4 text-sm">
      <span className="text-blue-600 font-medium">{s.new_cards} new</span>
      <span className="text-orange-600 font-medium">{s.due} due</span>
      <span className="text-gray-500">{s.total} total</span>
    </div>
  )
}
