import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import { parseContent } from '../../lib/card-content'
import type { Card } from '../../stores/card-store'
import * as api from '../../api/ipc-client'

type ExportFormat = 'csv' | 'tsv' | 'quizlet' | 'anki'

function cardsToCSV(cards: Card[], delimiter: string): string {
  const header = delimiter === '\t' ? 'front\tback' : 'front,back'
  const rows = cards.map((card) => {
    const front = parseContent(card.front_content).markdown
    const back = parseContent(card.back_content).markdown
    if (delimiter === ',') {
      // Escape commas and quotes in CSV
      const esc = (s: string) => {
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`
        }
        return s
      }
      return `${esc(front)},${esc(back)}`
    }
    // TSV — replace tabs/newlines in content
    return `${front.replace(/[\t\n]/g, ' ')}\t${back.replace(/[\t\n]/g, ' ')}`
  })
  return [header, ...rows].join('\n')
}

function cardsToQuizlet(cards: Card[]): string {
  // Quizlet import format: term\tdefinition per line
  return cards.map((card) => {
    const front = parseContent(card.front_content).markdown.replace(/[\t\n]/g, ' ')
    const back = parseContent(card.back_content).markdown.replace(/[\t\n]/g, ' ')
    return `${front}\t${back}`
  }).join('\n')
}

function cardsToAnkiTxt(cards: Card[]): string {
  // Anki text import format: front\tback (tab-separated, one per line)
  // This can be imported into Anki via File > Import
  return cards.map((card) => {
    const front = parseContent(card.front_content).markdown.replace(/\t/g, ' ')
    const back = parseContent(card.back_content).markdown.replace(/\t/g, ' ')
    return `${front}\t${back}`
  }).join('\n')
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportCards() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const deck = decks.find((d) => d.id === Number(deckId))
  const numericDeckId = Number(deckId)

  const [cards, setCards] = useState<Card[]>([])
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [preview, setPreview] = useState('')
  const [exported, setExported] = useState(false)

  useEffect(() => {
    if (numericDeckId) {
      api.getCards(numericDeckId).then(setCards)
    }
  }, [numericDeckId])

  useEffect(() => {
    if (cards.length === 0) { setPreview(''); return }
    switch (format) {
      case 'csv': setPreview(cardsToCSV(cards, ',')); break
      case 'tsv': setPreview(cardsToCSV(cards, '\t')); break
      case 'quizlet': setPreview(cardsToQuizlet(cards)); break
      case 'anki': setPreview(cardsToAnkiTxt(cards)); break
    }
  }, [cards, format])

  const handleExport = () => {
    const name = deck?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'deck'
    switch (format) {
      case 'csv':
        downloadFile(preview, `${name}.csv`, 'text/csv;charset=utf-8')
        break
      case 'tsv':
        downloadFile(preview, `${name}.tsv`, 'text/tab-separated-values;charset=utf-8')
        break
      case 'quizlet':
        downloadFile(preview, `${name}_quizlet.txt`, 'text/plain;charset=utf-8')
        break
      case 'anki':
        downloadFile(preview, `${name}_anki.txt`, 'text/plain;charset=utf-8')
        break
    }
    setExported(true)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(preview)
    setExported(true)
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Export Cards</h2>
          <p className="text-sm text-gray-500">{deck?.name} &middot; {cards.length} cards</p>
        </div>
        <button
          onClick={() => navigate(`/deck/${deckId}`)}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Back
        </button>
      </div>

      {/* Format selector */}
      <div className="flex gap-2 mb-6">
        {([
          { id: 'csv' as const, label: 'CSV', desc: 'Comma separated' },
          { id: 'tsv' as const, label: 'TSV', desc: 'Tab separated' },
          { id: 'quizlet' as const, label: 'Quizlet', desc: 'Paste into Quizlet' },
          { id: 'anki' as const, label: 'Anki', desc: 'Anki text import' }
        ]).map((f) => (
          <button
            key={f.id}
            onClick={() => { setFormat(f.id); setExported(false) }}
            className={`flex-1 p-3 rounded-xl border-2 text-left transition-colors ${
              format === f.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-sm">{f.label}</div>
            <div className="text-xs text-gray-500">{f.desc}</div>
          </button>
        ))}
      </div>

      {/* Format info */}
      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
        {format === 'csv' && 'Standard CSV with "front" and "back" columns. Compatible with spreadsheets and most flashcard apps.'}
        {format === 'tsv' && 'Tab-separated values. Compatible with spreadsheets and many import tools.'}
        {format === 'quizlet' && 'Tab-separated format ready to paste into Quizlet\'s import dialog (Settings: "Between term and definition" = Tab, "Between rows" = New line).'}
        {format === 'anki' && 'Tab-separated text file for Anki. Import via File > Import in Anki desktop, select "Fields separated by: Tab".'}
      </div>

      {/* Preview */}
      {preview && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Preview</h3>
          <textarea
            readOnly
            value={preview.split('\n').slice(0, 20).join('\n') + (preview.split('\n').length > 20 ? '\n...' : '')}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-white focus:outline-none resize-y"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleExport}
          disabled={cards.length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          Download File
        </button>
        <button
          onClick={handleCopy}
          disabled={cards.length === 0}
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
        >
          Copy to Clipboard
        </button>
        {exported && (
          <span className="self-center text-sm text-green-600 font-medium">Done!</span>
        )}
      </div>
    </div>
  )
}
