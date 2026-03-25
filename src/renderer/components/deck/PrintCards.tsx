import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import { parseContent } from '../../lib/card-content'
import * as api from '../../api/ipc-client'

interface CardData {
  id: number
  front_content: string
  back_content: string
}

export default function PrintCards() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const [cards, setCards] = useState<CardData[]>([])
  const numericDeckId = Number(deckId)
  const deck = decks.find((d) => d.id === numericDeckId)

  useEffect(() => {
    if (numericDeckId) {
      api.getCards(numericDeckId).then(setCards).catch(console.error)
    }
  }, [numericDeckId])

  return (
    <div className="print-cards-page">
      {/* Non-print controls */}
      <div className="p-8 max-w-4xl mx-auto no-print">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">{deck?.name ?? 'Deck'} - Print Preview</h2>
            <p className="text-sm text-gray-500">{cards.length} cards</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Print
            </button>
            <button
              onClick={() => navigate(`/deck/${deckId}`)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Back to Deck
            </button>
          </div>
        </div>
      </div>

      {/* Printable card grid */}
      <div className="print-grid p-8 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 gap-4">
          {cards.map((card) => {
            const front = parseContent(card.front_content)
            const back = parseContent(card.back_content)
            return (
              <div
                key={card.id}
                className="border border-gray-300 rounded-lg p-4 break-inside-avoid"
              >
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Front</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">
                    {front.markdown || (front.drawing ? `[Drawing: ${front.drawing.objects.length} objects]` : '(empty)')}
                  </div>
                </div>
                <div className="border-t border-dashed border-gray-300 my-2" />
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Back</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">
                    {back.markdown || (back.drawing ? `[Drawing: ${back.drawing.objects.length} objects]` : '(empty)')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
