import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import { parseContent } from '../../lib/card-content'
import type { DrawingData } from '../../lib/card-content'
import * as api from '../../api/ipc-client'
import { StaticCanvas, util } from 'fabric'

interface CardData {
  id: number
  front_content: string
  back_content: string
}

/** Renders fabric drawing data to a data-URL image at 1:1 view */
async function renderDrawingToImage(drawing: DrawingData): Promise<string> {
  const canvas = new StaticCanvas(undefined, {
    width: drawing.canvasWidth,
    height: drawing.canvasHeight,
    backgroundColor: drawing.canvasBgColor || '#ffffff'
  })
  // Reset to 1:1 viewport
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  // Load the serialised objects
  await util.enlivenObjects(drawing.objects)
    .then((objs: any[]) => {
      objs.forEach((obj: any) => canvas.add(obj))
    })
  canvas.renderAll()
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1.5 })
  canvas.dispose()
  return dataUrl
}

export default function PrintCards() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const [cards, setCards] = useState<CardData[]>([])
  const [drawingImages, setDrawingImages] = useState<Record<string, string>>({})
  const [rendering, setRendering] = useState(false)
  const numericDeckId = Number(deckId)
  const deck = decks.find((d) => d.id === numericDeckId)

  useEffect(() => {
    if (numericDeckId) {
      api.getCards(numericDeckId).then(setCards).catch(console.error)
    }
  }, [numericDeckId])

  // Pre-render all drawings to images once cards are loaded
  useEffect(() => {
    if (cards.length === 0) return
    let cancelled = false
    setRendering(true)

    const renderAll = async () => {
      const images: Record<string, string> = {}
      // Build list of render tasks
      const tasks: { key: string; drawing: any }[] = []
      for (const card of cards) {
        const front = parseContent(card.front_content)
        const back = parseContent(card.back_content)
        if (front.drawing && front.drawing.objects.length > 0) {
          tasks.push({ key: `${card.id}-front`, drawing: front.drawing })
        }
        if (back.drawing && back.drawing.objects.length > 0) {
          tasks.push({ key: `${card.id}-back`, drawing: back.drawing })
        }
      }
      // Render in parallel batches of 6
      const BATCH_SIZE = 6
      for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        if (cancelled) return
        const batch = tasks.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map((t) => renderDrawingToImage(t.drawing).then((img) => ({ key: t.key, img })))
        )
        for (const r of results) {
          if (r.status === 'fulfilled') images[r.value.key] = r.value.img
        }
      }
      if (!cancelled) {
        setDrawingImages(images)
        setRendering(false)
      }
    }
    renderAll()
    return () => { cancelled = true }
  }, [cards])

  return (
    <div className="print-cards-page">
      {/* Screen-only controls */}
      <div className="p-8 max-w-5xl mx-auto no-print">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">{deck?.name ?? 'Deck'} - Print Preview</h2>
            <p className="text-sm text-gray-500">{cards.length} cards</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              disabled={rendering}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {rendering ? 'Rendering drawings...' : 'Print'}
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

      {/* Printable flashcard list — each card is a row: front (left) | back (right) */}
      <div className="print-grid px-8 max-w-5xl mx-auto">
        {cards.map((card) => {
          const front = parseContent(card.front_content)
          const back = parseContent(card.back_content)
          const frontImg = drawingImages[`${card.id}-front`]
          const backImg = drawingImages[`${card.id}-back`]

          return (
            <div
              key={card.id}
              className="flex border border-gray-300 dark:border-gray-600 rounded-lg mb-3 break-inside-avoid print-card dark:bg-gray-800"
            >
              {/* Front side */}
              <div className="flex-1 p-4 border-r border-dashed border-gray-300">
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Front</div>
                {front.plainText && (
                  <div className="text-sm whitespace-pre-wrap mb-2 text-gray-800 dark:text-gray-200">{front.plainText}</div>
                )}
                {frontImg && (
                  <img src={frontImg} alt="Front drawing" className="max-w-full max-h-48 object-contain" />
                )}
                {!front.plainText && !frontImg && (
                  <div className="text-sm text-gray-400 italic">(empty)</div>
                )}
              </div>

              {/* Back side */}
              <div className="flex-1 p-4">
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Back</div>
                {back.plainText && (
                  <div className="text-sm whitespace-pre-wrap mb-2 text-gray-800 dark:text-gray-200">{back.plainText}</div>
                )}
                {backImg && (
                  <img src={backImg} alt="Back drawing" className="max-w-full max-h-48 object-contain" />
                )}
                {!back.plainText && !backImg && (
                  <div className="text-sm text-gray-400 italic">(empty)</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-cards-page { background: white; }
          .print-grid { padding: 0 !important; max-width: none !important; }
          .print-card {
            page-break-inside: avoid;
            border: 1px solid #ccc !important;
            margin-bottom: 8px;
          }
          .print-card img {
            max-height: 180px;
          }
        }
      `}</style>
    </div>
  )
}
