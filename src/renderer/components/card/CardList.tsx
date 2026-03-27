import { useEffect, useState, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useCardStore } from '../../stores/card-store'
import { useDeckStore } from '../../stores/deck-store'
import { useUIStore } from '../../stores/ui-store'
import { parseContent, contentPreview } from '../../lib/card-content'
import * as api from '../../api/ipc-client'
import { useToastStore } from '../../stores/toast-store'
import {
  DndContext, DragOverlay, closestCenter, pointerWithin,
  useSensor, useSensors, PointerSensor,
  type DragStartEvent, type DragEndEvent, type DragOverEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, defaultAnimateLayoutChanges } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { List as VirtualList } from 'react-window'

interface DeckTimeStats {
  totalTimeMs: number
  avgTimePerCardMs: number
  totalReviews: number
  fastestCardId: number | null
  fastestCardMs: number
  slowestCardId: number | null
  slowestCardMs: number
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

type SortMode = 'custom' | 'newest' | 'oldest' | 'az' | 'za' | 'bestTime' | 'avgTime'

function SortableCardItem({ id, isTagDragOver, children }: { id: string; isTagDragOver: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, height: 0, overflow: 'hidden', margin: 0, padding: 0 }
    : {
        transform: CSS.Translate.toString(transform),
        transition: transition || 'transform 150ms ease',
        position: 'relative' as const,
      }
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 transition-colors rounded-lg ${isTagDragOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}>
      <div {...attributes} {...listeners} className="shrink-0 p-1.5 cursor-grab text-gray-300 hover:text-gray-500" title="Drag to reorder">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function DraggableCardTag({ cardId, tagId, color }: { cardId: number; tagId: number; color: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `cardtag-${cardId}-${tagId}` })
  return (
    <span ref={setNodeRef} {...attributes} {...listeners}
      className={`w-3 h-3 rounded-full inline-block shrink-0 cursor-grab ${isDragging ? 'opacity-30 scale-75' : 'hover:scale-125'} transition-transform`}
      style={{ backgroundColor: color }}
      title="Drag off to remove tag"
    />
  )
}

function RemoveTagZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'remove-tag-zone' })
  return (
    <div ref={setNodeRef} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all ${isOver ? 'bg-red-100 text-red-600 ring-2 ring-red-300 scale-110' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
      Remove
    </div>
  )
}

function DraggableTagWrap({ tagId, children }: { tagId: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `tag-${tagId}` })
  return (
    <span ref={setNodeRef} {...attributes} {...listeners}
      className={`cursor-grab ${isDragging ? 'opacity-40' : ''}`}
      title="Drag onto a card to assign this tag"
    >
      {children}
    </span>
  )
}

export default function CardList() {
  const { deckId } = useParams<{ deckId: string }>()
  const cards = useCardStore((s) => s.cards)
  const fetchCards = useCardStore((s) => s.fetchCards)
  const removeCard = useCardStore((s) => s.removeCard)
  const removeCards = useCardStore((s) => s.removeCards)
  const decks = useDeckStore((s) => s.decks)
  const {
    cardSortMode: sortMode, setCardSortMode: setSortMode,
    filterTagId, setFilterTagId,
    selectedCards, setSelectedCards
  } = useUIStore()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkAction, setBulkAction] = useState<'move' | 'duplicate' | 'addtag' | 'removetag' | null>(null)
  const [tags, setTags] = useState<{ id: number; name: string; color: string }[]>([])
  const [cardTagMap, setCardTagMap] = useState<Record<number, number[]>>({})
  const [newTagName, setNewTagName] = useState('')
  const [timeStats, setTimeStats] = useState<DeckTimeStats | null>(null)
  const [cardTimes, setCardTimes] = useState<Record<number, { avg: number; best: number }>>({})
  const [templates, setTemplates] = useState<{ id: number; name: string; front_content: string; back_content: string }[]>([])
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [dragOverCardId, setDragOverCardId] = useState<number | null>(null)
  const cardDndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [saveTemplateCardId, setSaveTemplateCardId] = useState<number | null>(null)
  const [templateName, setTemplateName] = useState('')
  const deck = decks.find((d) => d.id === Number(deckId))
  const numericDeckId = Number(deckId)

  useEffect(() => {
    if (numericDeckId) {
      api.getCardListData(numericDeckId).then((data) => {
        useCardStore.setState({ cards: data.cards })
        setTimeStats(data.timeStats)
        setCardTimes(data.cardTimes)
        setTags(data.tags)
        setCardTagMap(data.cardTagMap)
        setTemplates(data.templates)
      }).catch(console.error)
    }
  }, [numericDeckId])

  const regexValid = useMemo(() => {
    if (!searchQuery) return true
    try {
      new RegExp(searchQuery, 'i')
      return true
    } catch {
      return false
    }
  }, [searchQuery])

  const filteredCards = useMemo(() => {
    let result = [...cards]

    // Filter by tag
    if (filterTagId !== null) {
      result = result.filter((card) => cardTagMap[card.id]?.includes(filterTagId))
    }

    if (searchQuery) {
      result = result.filter((card) => {
        const front = parseContent(card.front_content)
        const back = parseContent(card.back_content)
        const text = `${front.plainText} ${back.plainText}`
        if (regexValid) {
          const regex = new RegExp(searchQuery, 'i')
          return regex.test(text)
        }
        return text.toLowerCase().includes(searchQuery.toLowerCase())
      })
    }

    switch (sortMode) {
      case 'custom':
        break
      case 'newest':
        result.sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
      case 'oldest':
        result.sort((a, b) => a.created_at.localeCompare(b.created_at))
        break
      case 'az':
        result.sort((a, b) => {
          const aText = parseContent(a.front_content).plainText.toLowerCase()
          const bText = parseContent(b.front_content).plainText.toLowerCase()
          return aText.localeCompare(bText)
        })
        break
      case 'za':
        result.sort((a, b) => {
          const aText = parseContent(a.front_content).plainText.toLowerCase()
          const bText = parseContent(b.front_content).plainText.toLowerCase()
          return bText.localeCompare(aText)
        })
        break
      case 'bestTime':
        result.sort((a, b) => {
          const aTime = cardTimes[a.id]?.best
          const bTime = cardTimes[b.id]?.best
          if (aTime == null && bTime == null) return 0
          if (aTime == null) return 1
          if (bTime == null) return -1
          return aTime - bTime
        })
        break
      case 'avgTime':
        result.sort((a, b) => {
          const aTime = cardTimes[a.id]?.avg
          const bTime = cardTimes[b.id]?.avg
          if (aTime == null && bTime == null) return 0
          if (aTime == null) return 1
          if (bTime == null) return -1
          return aTime - bTime
        })
        break
    }

    return result
  }, [cards, searchQuery, regexValid, sortMode, filterTagId, cardTagMap, cardTimes])

  const toast = useToastStore()

  // Card DnD
  const cardIds = useMemo(() => filteredCards.map((c) => `card-${c.id}`), [filteredCards])

  const handleCardDragStart = (event: DragStartEvent) => setActiveDragId(String(event.active.id))

  const handleCardDragOver = (event: DragOverEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : null
    // Only highlight cards when dragging a tag
    if (activeId.startsWith('tag-') && overId?.startsWith('card-')) {
      setDragOverCardId(Number(overId.replace('card-', '')))
    } else {
      setDragOverCardId(null)
    }
  }

  const handleCardDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    setDragOverCardId(null)
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Card tag circle dragged to remove zone (or dropped anywhere that's not its card)
    if (activeId.startsWith('cardtag-')) {
      const parts = activeId.split('-')
      const cardId = Number(parts[1])
      const tagId = Number(parts[2])
      // Remove tag from card
      const currentTags = cardTagMap[cardId] || []
      const newTags = currentTags.filter((id) => id !== tagId)
      await api.setCardTags(cardId, newTags)
      api.getCardTagsForDeck(numericDeckId).then(setCardTagMap)
      return
    }

    // Tag dropped on card
    if (activeId.startsWith('tag-') && overId.startsWith('card-')) {
      const tagId = Number(activeId.replace('tag-', ''))
      const cardId = Number(overId.replace('card-', ''))
      await api.addTagToCards(tagId, [cardId])
      api.getCardTagsForDeck(numericDeckId).then(setCardTagMap)
      return
    }

    // Card reorder
    if (activeId.startsWith('card-') && overId.startsWith('card-') && activeId !== overId) {
      const oldIndex = cardIds.indexOf(activeId)
      const newIndex = cardIds.indexOf(overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        // flushSync forces React to re-render synchronously BEFORE dnd-kit removes the transform
        // This means the card is already in its new DOM position when the transform disappears — no gap
        const { cards: currentCards } = useCardStore.getState()
        const reordered = arrayMove(currentCards, currentCards.findIndex(c => c.id === filteredCards[oldIndex].id), currentCards.findIndex(c => c.id === filteredCards[newIndex].id))
        flushSync(() => {
          setSortMode('custom' as SortMode)
          useCardStore.setState({ cards: reordered })
        })
        api.updateCardOrder(reordered.map((c) => c.id))
      }
    }
  }

  const activeDragCard = activeDragId?.startsWith('card-')
    ? cards.find((c) => c.id === Number(activeDragId.replace('card-', '')))
    : null
  const activeDragTag = activeDragId?.startsWith('tag-')
    ? tags.find((t) => t.id === Number(activeDragId.replace('tag-', '')))
    : null

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const card = cards.find((c) => c.id === id)
    await removeCard(id)
    setConfirmDelete(null)
    if (card) {
      toast.show('Card deleted', async () => {
        await api.createCard(numericDeckId, card.front_content, card.back_content)
        await fetchCards(numericDeckId)
      })
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header row: title + stats + buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">{deck?.name ?? 'Deck'}</h2>
            <p className="text-sm text-gray-500">{cards.length} cards</p>
          </div>

          {/* Stats icon + inline stats */}
          <div className="flex items-center gap-3 ml-2">
            <button
              onClick={() => navigate(`/deck/${deckId}/stats`)}
              className="text-gray-400 hover:text-indigo-600 transition-colors"
              title="View full statistics"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18M7 16v-3m4 3v-6m4 6V8m4 8V5" />
              </svg>
            </button>
            {timeStats && timeStats.totalReviews > 0 && (
              <div className="flex gap-3 text-xs text-gray-500">
                <span title="Total study time"><span className="text-blue-500 font-medium">{formatTime(timeStats.totalTimeMs)}</span> total</span>
                <span title="Average per card"><span className="text-green-500 font-medium">{formatTime(timeStats.avgTimePerCardMs)}</span> avg</span>
                <span title="Fastest card"><span className="text-purple-500 font-medium">{formatTime(timeStats.fastestCardMs)}</span> fast</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {/* Study: Learn | Browse */}
          <div className="flex rounded-lg overflow-hidden">
            <button
              onClick={() => navigate(`/deck/${deckId}/study`)}
              disabled={cards.length === 0}
              className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 font-medium text-sm disabled:opacity-40"
            >
              Learn
            </button>
            <button
              onClick={() => {
                const ids = filteredCards.map((c) => c.id).join(',')
                navigate(`/deck/${deckId}/browse?cards=${ids}`)
              }}
              disabled={filteredCards.length === 0}
              className="px-2.5 py-2 bg-green-600 text-white hover:bg-green-700 text-xs border-l border-green-400 disabled:opacity-40"
              title="Browse cards"
            >
              Browse
            </button>
          </div>

          {/* Game: Test | Match */}
          <div className="flex rounded-lg overflow-hidden">
            <button
              onClick={() => {
                const ids = filteredCards.map((c) => c.id).join(',')
                navigate(`/deck/${deckId}/test?cards=${ids}`)
              }}
              disabled={filteredCards.length === 0}
              className="px-4 py-2 bg-red-500 text-white hover:bg-red-600 font-medium text-sm disabled:opacity-40"
            >
              Test
            </button>
            <button
              onClick={() => {
                const ids = filteredCards.map((c) => c.id).join(',')
                navigate(`/deck/${deckId}/match?cards=${ids}`)
              }}
              disabled={filteredCards.length < 2}
              className="px-2.5 py-2 bg-red-600 text-white hover:bg-red-700 text-xs border-l border-red-400 disabled:opacity-40"
              title="Matching game"
            >
              Match
            </button>
          </div>

          {/* Add | Bulk | Template */}
          <div className="relative flex rounded-lg overflow-visible">
            <button
              onClick={() => navigate(`/deck/${deckId}/card/new`)}
              className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 font-medium text-sm rounded-l-lg"
            >
              + Add
            </button>
            <button
              onClick={() => navigate(`/deck/${deckId}/card/bulk`)}
              className="px-2.5 py-2 bg-blue-600 text-white hover:bg-blue-700 text-xs border-l border-blue-400"
              title="Bulk add cards"
            >
              Bulk
            </button>
            <button
              onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
              className="px-2.5 py-2 bg-blue-700 text-blue-100 hover:bg-blue-800 text-xs border-l border-blue-500 rounded-r-lg"
              title="Create card from template"
            >
              Template
            </button>
            {showTemplateDropdown && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                {templates.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">No templates yet. Save a card as template first.</div>
                ) : (
                  templates.map((tmpl) => (
                    <div key={tmpl.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 group">
                      <button
                        onClick={async () => {
                          const newCard = await api.createCard(numericDeckId, tmpl.front_content, tmpl.back_content)
                          setShowTemplateDropdown(false)
                          navigate(`/deck/${deckId}/card/${newCard.id}`)
                        }}
                        className="flex-1 text-left text-sm text-gray-700 dark:text-gray-200 truncate"
                        title={tmpl.name}
                      >
                        {tmpl.name}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          await api.deleteTemplate(tmpl.id)
                          setTemplates((prev) => prev.filter((t) => t.id !== tmpl.id))
                        }}
                        className="ml-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete template"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Search and Sort controls */}
      {cards.length > 0 && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards (regex supported)..."
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !regexValid ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {!regexValid && (
              <span className="absolute right-3 top-2.5 text-xs text-red-500">Invalid regex</span>
            )}
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="custom">Custom (drag)</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
            <option value="bestTime">Best time</option>
            <option value="avgTime">Avg time</option>
          </select>
        </div>
      )}

      <DndContext sensors={cardDndSensors} collisionDetection={pointerWithin} onDragStart={handleCardDragStart} onDragOver={handleCardDragOver} onDragEnd={handleCardDragEnd}>

      {/* Tags bar */}
      {cards.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-400">Tags:</span>
          <button
            onClick={() => setFilterTagId(null)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              filterTagId === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {tags.map((tag) => (
            <DraggableTagWrap key={tag.id} tagId={tag.id}>
            <span className="inline-flex items-center gap-0.5">
              <button
                onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
                className={`px-2 py-0.5 text-xs rounded-l-full transition-colors border ${
                  filterTagId === tag.id
                    ? 'text-white border-transparent'
                    : 'border-gray-300 border-r-0 text-gray-600 hover:bg-gray-100'
                }`}
                style={filterTagId === tag.id ? { backgroundColor: tag.color } : undefined}
              >
                {tag.name}
                <span className="ml-1 inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  await api.deleteTag(tag.id)
                  setTags((prev) => prev.filter((t) => t.id !== tag.id))
                  if (filterTagId === tag.id) setFilterTagId(null)
                }}
                className={`px-1 py-0.5 text-xs rounded-r-full border transition-colors ${
                  filterTagId === tag.id
                    ? 'text-white/70 hover:text-white border-transparent'
                    : 'border-gray-300 border-l-0 text-gray-400 hover:text-red-500 hover:bg-red-50'
                }`}
                style={filterTagId === tag.id ? { backgroundColor: tag.color } : undefined}
                title="Delete tag"
              >
                &times;
              </button>
            </span>
            </DraggableTagWrap>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newTagName.trim()) return
              const tag = await api.createTag(numericDeckId, newTagName.trim(), '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'))
              setTags((prev) => [...prev, tag])
              setNewTagName('')
            }}
          >
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="+ New tag"
              className="px-2 py-0.5 text-xs border border-gray-300 rounded-full w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
          {activeDragId?.startsWith('cardtag-') && <RemoveTagZone />}
        </div>
      )}

      {/* Bulk actions */}
      {selectedCards.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-700">
            {selectedCards.size} card{selectedCards.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelectedCards(new Set(filteredCards.map((c) => c.id)))}
            className="text-xs text-blue-600 hover:underline"
          >
            Select all
          </button>
          <button
            onClick={() => setSelectedCards(new Set())}
            className="text-xs text-gray-500 hover:underline"
          >
            Clear
          </button>
          <div className="flex-1" />
          {bulkAction === 'addtag' || bulkAction === 'removetag' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">{bulkAction === 'addtag' ? 'Add tag:' : 'Remove tag:'}</span>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={async () => {
                    if (bulkAction === 'addtag') {
                      await api.addTagToCards(tag.id, [...selectedCards])
                    } else {
                      for (const cardId of selectedCards) {
                        const current = cardTagMap[cardId] || []
                        await api.setCardTags(cardId, current.filter((t) => t !== tag.id))
                      }
                    }
                    api.getCardTagsForDeck(numericDeckId).then(setCardTagMap)
                    setBulkAction(null)
                  }}
                  className="px-2 py-1 text-xs rounded text-white hover:opacity-80"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </button>
              ))}
              <button onClick={() => setBulkAction(null)} className="px-2 py-1 bg-gray-200 text-xs rounded hover:bg-gray-300">Cancel</button>
            </div>
          ) : bulkAction ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{bulkAction === 'move' ? 'Move to:' : 'Duplicate to:'}</span>
              {decks.filter((d) => d.id !== numericDeckId).map((d) => (
                <button
                  key={d.id}
                  onClick={async () => {
                    const ids = [...selectedCards]
                    if (bulkAction === 'move') {
                      await api.moveCards(ids, d.id)
                      await fetchCards(numericDeckId)
                    } else {
                      await api.duplicateCards(ids, d.id)
                    }
                    setSelectedCards(new Set())
                    setBulkAction(null)
                  }}
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200"
                >
                  {d.name}
                </button>
              ))}
              <button onClick={() => setBulkAction(null)} className="px-2 py-1 bg-gray-200 text-xs rounded hover:bg-gray-300">Cancel</button>
            </div>
          ) : confirmBulkDelete ? (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const deletedCards = cards.filter((c) => selectedCards.has(c.id))
                  await removeCards([...selectedCards])
                  setSelectedCards(new Set())
                  setConfirmBulkDelete(false)
                  toast.show(`${deletedCards.length} card(s) deleted`, async () => {
                    for (const card of deletedCards) {
                      await api.createCard(numericDeckId, card.front_content, card.back_content)
                    }
                    await fetchCards(numericDeckId)
                  })
                }}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Delete {selectedCards.size}
              </button>
              <button onClick={() => setConfirmBulkDelete(false)} className="px-3 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300">Cancel</button>
            </div>
          ) : (
            <div className="flex gap-2">
              {tags.length > 0 && (
                <>
                  <button onClick={() => setBulkAction('addtag')} className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded hover:bg-purple-200">Add tag</button>
                  <button onClick={() => setBulkAction('removetag')} className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded hover:bg-yellow-200">Remove tag</button>
                </>
              )}
              <button onClick={() => setBulkAction('move')} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded hover:bg-blue-200">Move to...</button>
              <button onClick={() => setBulkAction('duplicate')} className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded hover:bg-green-200">Duplicate to...</button>
              <button onClick={() => setConfirmBulkDelete(true)} className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200">Delete</button>
            </div>
          )}
        </div>
      )}

      {filteredCards.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {cards.length === 0 ? (
            <>
              <p className="text-lg mb-2">No cards yet</p>
              <p className="text-sm">Add your first card to start studying!</p>
            </>
          ) : (
            <p className="text-lg">No cards match your search</p>
          )}
        </div>
      ) : (
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        {filteredCards.length > 50 && !activeDragId ? (
          <VirtualList
            height={Math.min(filteredCards.length * 64, 600)}
            itemCount={filteredCards.length}
            itemSize={64}
            width="100%"
            itemData={filteredCards}
          >
            {({ index, style: rowStyle }) => {
              const card = filteredCards[index]
              const front = parseContent(card.front_content)
              const back = parseContent(card.back_content)
              return (
                <div style={rowStyle} key={card.id}>
                  <div
                    onClick={() => navigate(`/deck/${deckId}/card/${card.id}`)}
                    className="flex items-center justify-between p-3 mx-1 mb-1 bg-white border border-gray-200 rounded-lg hover:shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-sm truncate flex-1"><span className="text-gray-400 text-xs mr-1">F</span>{contentPreview(front)}</div>
                      <div className="text-sm truncate flex-1"><span className="text-gray-400 text-xs mr-1">B</span>{contentPreview(back)}</div>
                    </div>
                  </div>
                </div>
              )
            }}
          </VirtualList>
        ) : (
        <div className="space-y-2">
          {filteredCards.map((card) => {
            const front = parseContent(card.front_content)
            const back = parseContent(card.back_content)
            return (
              <SortableCardItem key={card.id} id={`card-${card.id}`} isTagDragOver={dragOverCardId === card.id}>
              <div
                onClick={() => navigate(`/deck/${deckId}/card/${card.id}`)}
                className="flex-1 flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
              >
                <div className="flex items-center gap-3 mr-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedCards.has(card.id)}
                    onChange={(e) => {
                      const next = new Set(selectedCards)
                      if (e.target.checked) next.add(card.id)
                      else next.delete(card.id)
                      setSelectedCards(next)
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-[1fr_1fr_auto_auto] gap-4 items-center">
                  <div className="truncate text-sm">
                    <span className="text-gray-400 text-xs uppercase mr-2">Front</span>
                    {contentPreview(front)}
                  </div>
                  <div className="truncate text-sm">
                    <span className="text-gray-400 text-xs uppercase mr-2">Back</span>
                    {contentPreview(back)}
                  </div>
                  <div className="flex gap-0.5 shrink-0 w-16 justify-end" title={
                    cardTagMap[card.id]?.length
                      ? cardTagMap[card.id].map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean).join(', ')
                      : undefined
                  }>
                    {(cardTagMap[card.id] || []).slice(0, 4).map((tagId) => {
                      const tag = tags.find((t) => t.id === tagId)
                      if (!tag) return null
                      return (
                        <DraggableCardTag key={tagId} cardId={card.id} tagId={tagId} color={tag.color} />
                      )
                    })}
                    {(cardTagMap[card.id]?.length || 0) > 4 && (
                      <span className="text-[9px] text-gray-400 leading-3">+{cardTagMap[card.id].length - 4}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 w-32 text-right shrink-0 flex gap-2 justify-end">
                    <span title="Best review time">
                      <span className="text-green-300 mr-0.5">Best</span>
                      {cardTimes[card.id] ? formatTime(cardTimes[card.id].best) : '-'}
                    </span>
                    <span title="Average review time">
                      <span className="text-gray-300 mr-0.5">Avg</span>
                      {cardTimes[card.id] ? formatTime(cardTimes[card.id].avg) : '-'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                  {/* Save as Template */}
                  {saveTemplateCardId === card.id ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={async (e) => {
                        e.preventDefault()
                        if (!templateName.trim()) return
                        const tmpl = await api.createTemplate(templateName.trim(), card.front_content, card.back_content)
                        setTemplates((prev) => [...prev, tmpl])
                        setSaveTemplateCardId(null)
                        setTemplateName('')
                        toast.show('Saved as template')
                      }}
                    >
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="px-2 py-1 text-xs border border-gray-300 rounded w-28 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button type="submit" className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">Save</button>
                      <button type="button" onClick={() => { setSaveTemplateCardId(null); setTemplateName('') }} className="px-1.5 py-1 bg-gray-200 text-xs rounded hover:bg-gray-300">X</button>
                    </form>
                  ) : (
                    <button
                      onClick={() => { setSaveTemplateCardId(card.id); setTemplateName('') }}
                      className="p-1.5 text-gray-400 hover:text-purple-600 rounded transition-colors"
                      title="Save as template"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await api.createCard(numericDeckId, card.front_content, card.back_content)
                      await fetchCards(numericDeckId)
                      toast.show('Card duplicated')
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Duplicate card"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {confirmDelete === card.id ? (
                    <>
                      <button
                        onClick={(e) => handleDelete(card.id, e)}
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 bg-gray-300 text-xs rounded"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(card.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              </SortableCardItem>
            )
          })}
        </div>
        )}
        </SortableContext>
      )}
      <DragOverlay dropAnimation={null}>
        {activeDragCard && (
          <div className="flex items-center p-4 bg-white dark:bg-gray-800 border-2 border-blue-400 rounded-lg shadow-xl opacity-80 max-w-2xl">
            <span className="text-sm truncate">{contentPreview(parseContent(activeDragCard.front_content))}</span>
          </div>
        )}
        {activeDragTag && (
          <span className="px-3 py-1 rounded-full text-sm font-medium shadow-lg" style={{ backgroundColor: activeDragTag.color, color: '#fff' }}>
            {activeDragTag.name}
          </span>
        )}
        {activeDragId?.startsWith('cardtag-') && (() => {
          const tagId = Number(activeDragId.split('-')[2])
          const tag = tags.find((t) => t.id === tagId)
          return tag ? (
            <span className="w-5 h-5 rounded-full inline-block shadow-lg ring-2 ring-red-400" style={{ backgroundColor: tag.color }} />
          ) : null
        })()}
      </DragOverlay>
      </DndContext>
    </div>
  )
}
