import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCardStore } from '../../stores/card-store'
import { parseContent, serializeContent, emptyContent, hasContent } from '../../lib/card-content'
import type { CardSideContent } from '../../lib/card-content'
import CardSideEditor from './CardSideEditor'
import { useUIStore } from '../../stores/ui-store'

export default function CardEditor() {
  const { deckId, cardId } = useParams<{ deckId: string; cardId: string }>()
  const navigate = useNavigate()
  const { addCard, editCard } = useCardStore()
  const autoSaveInterval = useUIStore((s) => s.autoSaveInterval)

  const [layout, setLayout] = useState<'side' | 'stack'>('side')
  const [splitPercent, setSplitPercent] = useState(50)
  const [front, setFront] = useState<CardSideContent>(emptyContent())
  const [back, setBack] = useState<CardSideContent>(emptyContent())
  const [loaded, setLoaded] = useState(false)
  // For new cards: once created, track the real ID so subsequent saves edit it
  const [createdCardId, setCreatedCardId] = useState<number | null>(null)
  const effectiveCardId = cardId ? Number(cardId) : createdCardId

  // Refs for auto-save interval
  const frontRef = useRef(front)
  const backRef = useRef(back)
  const effectiveCardIdRef = useRef(effectiveCardId)
  const savingRef = useRef(false)
  const lastSavedRef = useRef('')
  frontRef.current = front
  backRef.current = back
  effectiveCardIdRef.current = effectiveCardId

  // Load existing card data
  useEffect(() => {
    if (cardId) {
      window.electronAPI.getCard(Number(cardId)).then((card) => {
        if (card) {
          const f = parseContent(card.front_content)
          const b = parseContent(card.back_content)
          setFront(f)
          setBack(b)
          lastSavedRef.current = JSON.stringify({ f: serializeContent(f), b: serializeContent(b) })
        }
        setLoaded(true)
      })
    } else {
      setLoaded(true)
    }
  }, [cardId])

  // Auto-save — debounced, only saves latest state
  const pendingSaveRef = useRef(false)

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      pendingSaveRef.current = true  // Queue another save after current finishes
      return
    }
    const f = frontRef.current
    const b = backRef.current
    if (!hasContent(f) && !hasContent(b)) return

    const frontJson = serializeContent(f)
    const backJson = serializeContent(b)
    const snapshot = JSON.stringify({ f: frontJson, b: backJson })

    if (snapshot === lastSavedRef.current) return

    savingRef.current = true
    try {
      if (effectiveCardIdRef.current) {
        await editCard(effectiveCardIdRef.current, frontJson, backJson)
      } else {
        const newCard = await addCard(Number(deckId), frontJson, backJson)
        setCreatedCardId(newCard.id)
      }
      lastSavedRef.current = snapshot
    } catch (err) {
      console.error('Auto-save failed:', err)
    } finally {
      savingRef.current = false
      // If a save was queued while we were saving, run it now with latest data
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        doSave()
      }
    }
  }, [deckId, addCard, editCard])

  useEffect(() => {
    if (!loaded) return
    const interval = setInterval(doSave, autoSaveInterval)
    return () => {
      clearInterval(interval)
      // Final flush on unmount
      doSave()
    }
  }, [doSave, loaded, autoSaveInterval])

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-xl font-bold dark:text-white">{!cardId && !createdCardId ? 'New Card' : 'Edit Card'}</h2>
        <div className="flex items-center gap-2">
          {/* Layout toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button onClick={() => setLayout('side')} title="Side by side"
              className={`px-2 py-1.5 text-xs ${layout === 'side' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M9 3v18M3 3h18v18H3V3z" /></svg>
            </button>
            <button onClick={() => setLayout('stack')} title="Stacked"
              className={`px-2 py-1.5 text-xs ${layout === 'stack' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M3 12h18M3 3h18v18H3V3z" /></svg>
            </button>
          </div>
          <button
            onClick={() => { doSave(); navigate(`/deck/${deckId}`) }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Back to Deck
          </button>
        </div>
      </div>

      <div className={`flex-1 min-h-0 flex ${layout === 'stack' ? 'flex-col' : 'flex-row'} gap-0`}>
        {/* Front */}
        <div className="flex flex-col min-h-0 min-w-0" style={layout === 'side' ? { width: `${splitPercent}%` } : { height: `${splitPercent}%` }}>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 shrink-0 px-1">Front</h3>
          <div className="flex-1 min-h-0"><CardSideEditor content={front} onChange={setFront} /></div>
        </div>

        {/* Resize handle */}
        <div
          className={`shrink-0 ${layout === 'side' ? 'w-2 cursor-col-resize hover:bg-blue-200 dark:hover:bg-blue-800' : 'h-2 cursor-row-resize hover:bg-blue-200 dark:hover:bg-blue-800'} flex items-center justify-center group transition-colors rounded`}
          onMouseDown={(e) => {
            e.preventDefault()
            const startPos = layout === 'side' ? e.clientX : e.clientY
            const startPercent = splitPercent
            const container = e.currentTarget.parentElement!
            const containerSize = layout === 'side' ? container.clientWidth : container.clientHeight

            const onMove = (ev: MouseEvent) => {
              const delta = (layout === 'side' ? ev.clientX : ev.clientY) - startPos
              const pct = startPercent + (delta / containerSize) * 100
              setSplitPercent(Math.max(20, Math.min(80, pct)))
            }
            const onUp = () => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }}
        >
          <div className={`${layout === 'side' ? 'w-0.5 h-8' : 'h-0.5 w-8'} bg-gray-300 dark:bg-gray-600 rounded-full group-hover:bg-blue-400`} />
        </div>

        {/* Back */}
        <div className="flex flex-col min-h-0 min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 shrink-0 px-1">Back</h3>
          <div className="flex-1 min-h-0"><CardSideEditor content={back} onChange={setBack} /></div>
        </div>
      </div>
    </div>
  )
}
