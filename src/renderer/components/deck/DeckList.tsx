import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import * as api from '../../api/ipc-client'
import DeckForm from './DeckForm'
import DeckStats from './DeckStats'
import {
  DndContext, DragOverlay, closestCenter, pointerWithin,
  useSensor, useSensors, PointerSensor,
  type DragStartEvent, type DragEndEvent, type DragOverEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable, useDraggable } from '@dnd-kit/core'

type SortMode = 'newest' | 'oldest' | 'az' | 'za' | 'custom'

function SortableDeckItem({ id, onClick, children }: { id: string; onClick: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, height: 0, overflow: 'hidden', margin: 0, padding: 0 }
    : { transform: CSS.Translate.toString(transform), transition: transition || 'transform 150ms ease' }
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? '' : 'flex items-stretch border border-gray-200 rounded-xl hover:shadow-md transition-shadow bg-white cursor-pointer'} onClick={isDragging ? undefined : onClick}>
      {!isDragging && (
        <div {...attributes} {...listeners} className="flex items-center px-2 cursor-grab text-gray-300 hover:text-gray-500 shrink-0 rounded-l-xl hover:bg-gray-50" onClick={(e) => e.stopPropagation()} title="Drag to reorder or drop on folder">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
        </div>
      )}
      {!isDragging && <div className="flex-1 p-5 min-w-0">{children}</div>}
    </div>
  )
}

function DroppableFolderWrap({ folderId, isOver, children }: { folderId: number; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `folder-${folderId}` })
  return (
    <div ref={setNodeRef} className={`border rounded-xl bg-gray-50 overflow-hidden transition-colors ${isOver ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-gray-200'}`}>
      {children}
    </div>
  )
}

function DraggableFolderDeck({ deckId, children }: { deckId: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `deck-${deckId}` })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1 }}>
      {children}
    </div>
  )
}

function UnfolderZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unfolder-zone' })
  return (
    <div ref={setNodeRef}
      className={`transition-colors ${isOver ? 'bg-blue-500/5' : ''}`}
      style={{ minHeight: 'calc(100vh - 150px)', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', paddingLeft: 'calc(50vw - 50%)', paddingRight: 'calc(50vw - 50%)', marginBottom: -64, paddingBottom: 64 }}
    >{children}</div>
  )
}

export default function DeckList() {
  const decks = useDeckStore((s) => s.decks)
  const fetchDecks = useDeckStore((s) => s.fetchDecks)
  const removeDeck = useDeckStore((s) => s.removeDeck)
  const mergeDecks = useDeckStore((s) => s.mergeDecks)
  const loading = useDeckStore((s) => s.loading)
  const error = useDeckStore((s) => s.error)
  const [showForm, setShowForm] = useState(false)
  const [editDeck, setEditDeck] = useState<{ id: number; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [mergingDeck, setMergingDeck] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('custom')
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showExportDropdown, setShowExportDropdown] = useState<false | 'export' | 'print'>(false)
  const exportDropdownRef = useRef<HTMLDivElement>(null)
  const [searchMode, setSearchMode] = useState<'decks' | 'cards'>('decks')
  const [cardSearchResults, setCardSearchResults] = useState<any[]>([])
  const [deckStats, setDeckStats] = useState<Record<number, { due: number }>>({})
  const [folders, setFolders] = useState<{ id: number; name: string; parent_id: number | null }[]>([])
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [editFolder, setEditFolder] = useState<{ id: number; name: string } | null>(null)
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<number | null>(null)
  const [moveDeckToFolder, setMoveDeckToFolder] = useState<number | null>(null)

  // Fetch due counts for all decks in a single query
  useEffect(() => {
    api.getAllDeckStats().then((allStats) => {
      const map: Record<number, { due: number }> = {}
      for (const [id, s] of Object.entries(allStats)) {
        map[Number(id)] = { due: (s as any).due }
      }
      setDeckStats(map)
    }).catch(console.error)
  }, [decks])

  // Card search
  const performCardSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setCardSearchResults([])
      return
    }
    try {
      const results = await api.searchCards(query)
      setCardSearchResults(results)
    } catch {
      setCardSearchResults([])
    }
  }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    if (!showExportDropdown) return
    const handler = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportDropdown])

  // Auto-open new deck form from Ctrl+Shift+N
  useEffect(() => {
    if (searchParams.get('newDeck') === '1') {
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    fetchDecks()
    api.getFolders().then(setFolders).catch(console.error)
  }, [fetchDecks])

  // Validate regex separately
  const regexValid = useMemo(() => {
    if (!searchQuery) return true
    try {
      new RegExp(searchQuery, 'i')
      return true
    } catch {
      return false
    }
  }, [searchQuery])

  const filteredAndSorted = useMemo(() => {
    let result = [...decks]

    // Filter by search (regex)
    if (searchQuery) {
      if (regexValid) {
        const regex = new RegExp(searchQuery, 'i')
        result = result.filter((d) => regex.test(d.name))
      } else {
        const lower = searchQuery.toLowerCase()
        result = result.filter((d) => d.name.toLowerCase().includes(lower))
      }
    }

    // Sort (custom = DB order which is sort_order ASC)
    switch (sortMode) {
      case 'custom':
        break
      case 'newest':
        result.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        break
      case 'oldest':
        result.sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        break
      case 'az':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'za':
        result.sort((a, b) => b.name.localeCompare(a.name))
        break
    }

    return result
  }, [decks, searchQuery, sortMode, regexValid])

  // DnD setup
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const unfoldered = useMemo(() => filteredAndSorted.filter((d: any) => !d.folder_id), [filteredAndSorted])
  const unfolderedIds = useMemo(() => unfoldered.map((d) => `deck-${d.id}`), [unfoldered])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null
    if (overId?.startsWith('folder-')) {
      setDragOverFolderId(Number(overId.replace('folder-', '')))
    } else {
      setDragOverFolderId(null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    setDragOverFolderId(null)
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Deck dropped on folder
    if (activeId.startsWith('deck-') && overId.startsWith('folder-')) {
      const deckId = Number(activeId.replace('deck-', ''))
      const folderId = Number(overId.replace('folder-', ''))
      await api.setDeckFolder(deckId, folderId)
      fetchDecks()
      return
    }

    // Deck dropped on unfolder zone or on another deck in the main grid — remove from folder
    if (activeId.startsWith('deck-') && (overId === 'unfolder-zone' || (overId.startsWith('deck-') && !unfolderedIds.includes(activeId)))) {
      const deckId = Number(activeId.replace('deck-', ''))
      // Check if this deck is actually in a folder
      const deck = decks.find((d) => d.id === deckId)
      if (deck?.folder_id) {
        await api.setDeckFolder(deckId, null)
        fetchDecks()
        return
      }
    }

    // Deck reorder (both must be in main grid)
    if (activeId.startsWith('deck-') && overId.startsWith('deck-') && activeId !== overId) {
      const oldIndex = unfolderedIds.indexOf(activeId)
      const newIndex = unfolderedIds.indexOf(overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(unfoldered, oldIndex, newIndex)
        const allDecks = [...decks]
        const unfolderedSet = new Set(unfoldered.map(d => d.id))
        const otherDecks = allDecks.filter(d => !unfolderedSet.has(d.id))
        flushSync(() => {
          setSortMode('custom')
          useDeckStore.setState({ decks: [...otherDecks, ...reordered] })
        })
        api.updateDeckOrder(reordered.map((d) => d.id))
      }
      return
    }

    // Folder reorder
    if (activeId.startsWith('folder-') && overId.startsWith('folder-') && activeId !== overId) {
      const oldIndex = folders.findIndex((f) => `folder-${f.id}` === activeId)
      const newIndex = folders.findIndex((f) => `folder-${f.id}` === overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(folders, oldIndex, newIndex)
        setFolders(newOrder)
        await api.updateFolderOrder(newOrder.map((f) => f.id))
      }
    }
  }

  const activeDeck = activeDragId?.startsWith('deck-')
    ? decks.find((d) => d.id === Number(activeDragId.replace('deck-', '')))
    : null
  const activeFolder = activeDragId?.startsWith('folder-')
    ? folders.find((f) => f.id === Number(activeDragId.replace('folder-', '')))
    : null

  const handleDelete = async (id: number) => {
    await removeDeck(id)
    setConfirmDelete(null)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Your Decks</h2>
        <div className="flex gap-3">
          <div className="flex rounded-lg relative" ref={exportDropdownRef}>
            <button
              onClick={() => navigate('/import')}
              className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 transition-colors font-medium rounded-l-lg"
            >
              Import
            </button>
            <button
              onClick={() => { setShowExportDropdown(showExportDropdown === 'export' ? false : 'export') }}
              disabled={decks.length === 0}
              className="px-3 py-2 bg-green-600 text-white hover:bg-green-700 transition-colors font-medium border-l border-green-400 disabled:opacity-50"
            >
              Export
            </button>
            <button
              onClick={() => { setShowExportDropdown(showExportDropdown === 'print' ? false : 'print') }}
              disabled={decks.length === 0}
              className="px-3 py-2 bg-green-700 text-green-100 hover:bg-green-800 transition-colors font-medium border-l border-green-500 disabled:opacity-50 rounded-r-lg"
            >
              Print
            </button>
            {showExportDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">
                  {showExportDropdown === 'export' ? 'Export Deck' : 'Print Deck'}
                </div>
                {decks.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setShowExportDropdown(false)
                      navigate(showExportDropdown === 'export' ? `/deck/${d.id}/export` : `/deck/${d.id}/print`)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex rounded-lg">
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium rounded-l-lg"
            >
              + New Deck
            </button>
            <button
              onClick={() => setShowFolderForm(true)}
              className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium border-l border-blue-400 rounded-r-lg"
              title="Create folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
                <path d="M12 11v6M9 14h6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Search and Sort controls */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (searchMode === 'cards') {
                performCardSearch(e.target.value)
              }
            }}
            placeholder={searchMode === 'decks' ? 'Search decks (regex supported)...' : 'Search card content across all decks...'}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              !regexValid && searchMode === 'decks' ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {!regexValid && searchMode === 'decks' && (
            <span className="absolute right-3 top-2.5 text-xs text-red-500">Invalid regex</span>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-gray-300">
          <button
            onClick={() => { setSearchMode('decks'); setCardSearchResults([]) }}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              searchMode === 'decks' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Decks
          </button>
          <button
            onClick={() => { setSearchMode('cards'); if (searchQuery) performCardSearch(searchQuery) }}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              searchMode === 'cards' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Cards
          </button>
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
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Failed to load decks: {error}
        </div>
      )}

      {loading && decks.length === 0 && (
        <div className="text-center py-8 text-gray-500">Loading decks...</div>
      )}

      {(showForm || editDeck) && (
        <DeckForm
          editDeck={editDeck}
          onClose={() => {
            setShowForm(false)
            setEditDeck(null)
          }}
        />
      )}

      {/* Folder creation form */}
      {showFolderForm && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4">
          <form onSubmit={async (e) => {
            e.preventDefault()
            if (!newFolderName.trim()) return
            await api.createFolder(newFolderName.trim())
            setNewFolderName('')
            setShowFolderForm(false)
            api.getFolders().then(setFolders)
          }} className="flex gap-3">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              autoFocus
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setShowFolderForm(false) } }}
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Create</button>
            <button type="button" onClick={() => setShowFolderForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
          </form>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <UnfolderZone>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="mb-4 space-y-2">
          {folders.map((folder) => {
            const isExpanded = expandedFolders.has(folder.id)
            const folderDecks = filteredAndSorted.filter((d: any) => d.folder_id === folder.id)
            return (
              <DroppableFolderWrap key={folder.id} folderId={folder.id} isOver={dragOverFolderId === folder.id}>
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => setExpandedFolders((prev) => {
                    const next = new Set(prev)
                    if (next.has(folder.id)) next.delete(folder.id)
                    else next.add(folder.id)
                    return next
                  })}
                >
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  {editFolder?.id === folder.id ? (
                    <input
                      type="text"
                      value={editFolder.name}
                      onChange={(e) => setEditFolder({ ...editFolder, name: e.target.value })}
                      onBlur={async () => {
                        if (editFolder.name.trim()) await api.renameFolder(folder.id, editFolder.name.trim())
                        setEditFolder(null)
                        api.getFolders().then(setFolders)
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') { e.currentTarget.blur() }
                        if (e.key === 'Escape') { e.stopPropagation(); setEditFolder(null) }
                      }}
                      autoFocus
                      className="px-2 py-0.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="font-medium text-gray-700 flex-1">{folder.name}</span>
                  )}
                  <span className="text-xs text-gray-400">{folderDecks.length} decks</span>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditFolder({ id: folder.id, name: folder.name })} className="p-1 text-gray-400 hover:text-blue-600" title="Rename folder">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {confirmDeleteFolder === folder.id ? (
                      <div className="flex gap-1">
                        <button onClick={async () => { await api.deleteFolder(folder.id); setConfirmDeleteFolder(null); api.getFolders().then(setFolders); fetchDecks() }} className="px-2 py-0.5 bg-red-600 text-white text-xs rounded">Confirm</button>
                        <button onClick={() => setConfirmDeleteFolder(null)} className="px-2 py-0.5 bg-gray-300 text-xs rounded">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteFolder(folder.id)} className="p-1 text-gray-400 hover:text-red-600" title="Delete folder">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {folderDecks.length === 0 ? (
                      <p className="text-sm text-gray-400 italic col-span-2 py-2">Empty folder. Drag decks here or use the move button on a deck.</p>
                    ) : (
                      folderDecks.map((deck: any) => (
                        <DraggableFolderDeck key={deck.id} deckId={deck.id}>
                        <div
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white cursor-pointer"
                          onClick={() => navigate(`/deck/${deck.id}`)}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{deck.name}</h3>
                            <button
                              onClick={async (e) => { e.stopPropagation(); await api.setDeckFolder(deck.id, null); fetchDecks() }}
                              className="p-1 text-gray-400 hover:text-orange-600"
                              title="Remove from folder"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <DeckStats deckId={deck.id} />
                        </div>
                        </DraggableFolderDeck>
                      ))
                    )}
                  </div>
                )}
              </DroppableFolderWrap>
            )
          })}
        </div>
      )}

      <SortableContext items={unfolderedIds} strategy={rectSortingStrategy}>
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {decks.length === 0 ? (
            <>
              <p className="text-lg mb-2">No decks yet</p>
              <p className="text-sm">Create your first deck to start learning!</p>
            </>
          ) : (
            <p className="text-lg">No decks match your search</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {unfoldered.map((deck) => (
            <SortableDeckItem key={deck.id} id={`deck-${deck.id}`} onClick={() => navigate(`/deck/${deck.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold">{deck.name}</h3>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditDeck({ id: deck.id, name: deck.name })}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Rename"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setMergingDeck(mergingDeck === deck.id ? null : deck.id)}
                    className={`p-1.5 rounded transition-colors ${mergingDeck === deck.id ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                    title="Merge into another deck"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                  {folders.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setMoveDeckToFolder(moveDeckToFolder === deck.id ? null : deck.id)}
                        className={`p-1.5 rounded transition-colors ${moveDeckToFolder === deck.id ? 'text-yellow-600' : 'text-gray-400 hover:text-yellow-600'}`}
                        title="Move to folder"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </button>
                      {moveDeckToFolder === deck.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px] py-1">
                          {folders.map((f) => (
                            <button
                              key={f.id}
                              onClick={async () => { await api.setDeckFolder(deck.id, f.id); setMoveDeckToFolder(null); fetchDecks() }}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {confirmDelete === deck.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(deck.id)}
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
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(deck.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                      title="Delete"
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
              <DeckStats deckId={deck.id} />
              {deckStats[deck.id]?.due > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  {deckStats[deck.id].due} due
                </div>
              )}
              {mergingDeck === deck.id && (
                <div className="mt-3 pt-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-gray-500 mb-2">Merge all cards into:</p>
                  <div className="flex flex-wrap gap-1">
                    {decks.filter((d) => d.id !== deck.id).map((target) => (
                      <button
                        key={target.id}
                        onClick={async () => {
                          await mergeDecks(deck.id, target.id)
                          setMergingDeck(null)
                        }}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200"
                      >
                        {target.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </SortableDeckItem>
          ))}
        </div>
      )}
      </SortableContext>

      </UnfolderZone>
      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDeck && (
          <div className="px-4 py-3 bg-white dark:bg-gray-800 border-2 border-blue-400 rounded-xl shadow-xl opacity-80 max-w-xs">
            <span className="font-semibold">{activeDeck.name}</span>
          </div>
        )}
        {activeFolder && (
          <div className="px-4 py-3 bg-yellow-50 border-2 border-yellow-400 rounded-xl shadow-lg opacity-90 max-w-xs flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
            <span className="font-semibold">{activeFolder.name}</span>
          </div>
        )}
      </DragOverlay>
      </DndContext>

      {/* Card search results */}
      {searchMode === 'cards' && cardSearchResults.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Card Results</h3>
          {(() => {
            const grouped: Record<number, any[]> = {}
            for (const card of cardSearchResults) {
              if (!grouped[card.deck_id]) grouped[card.deck_id] = []
              grouped[card.deck_id].push(card)
            }
            return Object.entries(grouped).map(([deckIdStr, cards]) => {
              const deckId = Number(deckIdStr)
              const deck = decks.find((d) => d.id === deckId)
              return (
                <div key={deckId} className="mb-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-2">{deck?.name ?? `Deck #${deckId}`}</h4>
                  <div className="space-y-1">
                    {cards.map((card: any) => {
                      let frontText = ''
                      let backText = ''
                      try {
                        const fp = JSON.parse(card.front_content)
                        frontText = fp.plainText || fp.markdown || ''
                      } catch {
                        frontText = card.front_content
                      }
                      try {
                        const bp = JSON.parse(card.back_content)
                        backText = bp.plainText || bp.markdown || ''
                      } catch {
                        backText = card.back_content
                      }
                      return (
                        <div
                          key={card.id}
                          onClick={() => navigate(`/deck/${deckId}/card/${card.id}`)}
                          className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm cursor-pointer transition-shadow"
                        >
                          <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                            <div className="truncate text-sm">
                              <span className="text-gray-400 text-xs uppercase mr-2">Front</span>
                              {frontText.substring(0, 80)}
                            </div>
                            <div className="truncate text-sm">
                              <span className="text-gray-400 text-xs uppercase mr-2">Back</span>
                              {backText.substring(0, 80)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}
      {searchMode === 'cards' && searchQuery && cardSearchResults.length === 0 && (
        <div className="mt-6 text-center text-gray-500 text-sm">No cards match your search</div>
      )}
    </div>
  )
}
