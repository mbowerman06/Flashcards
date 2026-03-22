import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCardStore } from '../../stores/card-store'
import { parseContent, serializeContent, emptyContent } from '../../lib/card-content'
import type { CardSideContent } from '../../lib/card-content'
import CardSideEditor from './CardSideEditor'

export default function CardEditor() {
  const { deckId, cardId } = useParams<{ deckId: string; cardId: string }>()
  const navigate = useNavigate()
  const { addCard, editCard } = useCardStore()
  const isNew = !cardId

  const [front, setFront] = useState<CardSideContent>(emptyContent())
  const [back, setBack] = useState<CardSideContent>(emptyContent())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (cardId) {
      window.electronAPI.getCard(Number(cardId)).then((card) => {
        if (card) {
          setFront(parseContent(card.front_content))
          setBack(parseContent(card.back_content))
        }
      })
    }
  }, [cardId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const frontJson = serializeContent(front)
      const backJson = serializeContent(back)

      if (isNew) {
        await addCard(Number(deckId), frontJson, backJson)
      } else {
        await editCard(Number(cardId), frontJson, backJson)
      }
      navigate(`/deck/${deckId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-xl font-bold">{isNew ? 'New Card' : 'Edit Card'}</h2>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="flex flex-col min-h-0">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 shrink-0">
            Front
          </h3>
          <div className="flex-1 min-h-0">
            <CardSideEditor content={front} onChange={setFront} />
          </div>
        </div>
        <div className="flex flex-col min-h-0">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 shrink-0">
            Back
          </h3>
          <div className="flex-1 min-h-0">
            <CardSideEditor content={back} onChange={setBack} />
          </div>
        </div>
      </div>
    </div>
  )
}
