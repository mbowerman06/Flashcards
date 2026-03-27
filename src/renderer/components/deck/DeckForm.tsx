import { useState, useRef, useEffect } from 'react'
import { useDeckStore } from '../../stores/deck-store'

interface Props {
  editDeck: { id: number; name: string } | null
  onClose: () => void
}

export default function DeckForm({ editDeck, onClose }: Props) {
  const [name, setName] = useState(editDeck?.name ?? '')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { addDeck, renameDeck } = useDeckStore()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Escape closes the form (same as Cancel)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setError('')
    try {
      if (editDeck) {
        await renameDeck(editDeck.id, trimmed)
      } else {
        await addDeck(trimmed)
      }
      onClose()
    } catch (err) {
      console.error('Failed to save deck:', err)
      setError(err instanceof Error ? err.message : 'Failed to save deck')
    }
  }

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Deck name..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {editDeck ? 'Rename' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </form>
    </div>
  )
}
