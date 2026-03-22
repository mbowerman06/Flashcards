import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCardStore } from '../../stores/card-store'
import { useDeckStore } from '../../stores/deck-store'
import { serializeContent } from '../../lib/card-content'

interface CardEntry {
  front: string
  back: string
}

export default function BulkCardEditor() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { addCard } = useCardStore()
  const { decks } = useDeckStore()
  const deck = decks.find((d) => d.id === Number(deckId))
  const [entries, setEntries] = useState<CardEntry[]>([
    { front: '', back: '' },
    { front: '', back: '' },
    { front: '', back: '' },
    { front: '', back: '' },
    { front: '', back: '' }
  ])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  // Auto-focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const updateEntry = (index: number, field: 'front' | 'back', value: string) => {
    setEntries((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const addMoreRows = () => {
    setEntries((prev) => [...prev, { front: '', back: '' }, { front: '', back: '' }, { front: '', back: '' }, { front: '', back: '' }, { front: '', back: '' }])
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number, field: 'front' | 'back') => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const refIndex = index * 2 + (field === 'front' ? 0 : 1)
      const nextRefIndex = refIndex + 1

      if (nextRefIndex < inputRefs.current.length) {
        inputRefs.current[nextRefIndex]?.focus()
      } else {
        // At the end — add more rows and focus the new first field
        addMoreRows()
        setTimeout(() => {
          inputRefs.current[nextRefIndex]?.focus()
        }, 50)
      }
    }
  }

  const handleSave = async () => {
    const numericDeckId = Number(deckId)
    const nonEmpty = entries.filter((e) => e.front.trim() || e.back.trim())
    if (nonEmpty.length === 0) return

    setSaving(true)
    let count = 0
    for (const entry of nonEmpty) {
      const front = serializeContent({ markdown: entry.front, drawing: null })
      const back = serializeContent({ markdown: entry.back, drawing: null })
      await addCard(numericDeckId, front, back)
      count++
      setSavedCount(count)
    }
    setSaving(false)
    navigate(`/deck/${deckId}`)
  }

  const nonEmptyCount = entries.filter((e) => e.front.trim() || e.back.trim()).length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Bulk Add Cards</h2>
          <p className="text-sm text-gray-500">
            {deck?.name ?? 'Deck'} &middot; Tab to navigate between fields
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/deck/${deckId}`)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || nonEmptyCount === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? `Saving ${savedCount}/${nonEmptyCount}...` : `Save ${nonEmptyCount} card${nonEmptyCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_1fr] gap-3 items-center px-1">
          <div className="w-8 text-xs text-gray-400 text-center">#</div>
          <div className="text-xs font-medium text-gray-500 uppercase">Front</div>
          <div className="text-xs font-medium text-gray-500 uppercase">Back</div>
        </div>

        {entries.map((entry, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-3 items-start">
            <div className="w-8 h-10 flex items-center justify-center text-xs text-gray-400">
              {i + 1}
            </div>
            <textarea
              ref={(el) => { inputRefs.current[i * 2] = el }}
              value={entry.front}
              onChange={(e) => updateEntry(i, 'front', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, i, 'front')}
              placeholder="Front side..."
              rows={1}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{ minHeight: '40px' }}
            />
            <textarea
              ref={(el) => { inputRefs.current[i * 2 + 1] = el }}
              value={entry.back}
              onChange={(e) => updateEntry(i, 'back', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, i, 'back')}
              placeholder="Back side..."
              rows={1}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{ minHeight: '40px' }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={addMoreRows}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          + Add 5 more rows
        </button>
      </div>
    </div>
  )
}
