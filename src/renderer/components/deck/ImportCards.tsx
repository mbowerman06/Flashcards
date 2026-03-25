import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import * as api from '../../api/ipc-client'
import { serializeContent } from '../../lib/card-content'

interface ParsedCard {
  front: string
  back: string
}

function parseCSV(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  // Detect delimiter: tab or comma
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  const cards: ParsedCard[] = []
  // Check if first row is headers
  const firstParts = firstLine.split(delimiter)
  const isHeader = firstParts.length >= 2 &&
    /^(front|term|question|word)/i.test(firstParts[0].trim()) &&
    /^(back|definition|answer|meaning)/i.test(firstParts[1].trim())

  const startIdx = isHeader ? 1 : 0
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(delimiter)
    if (parts.length >= 2) {
      const front = parts[0].replace(/^"(.*)"$/, '$1').trim()
      const back = parts.slice(1).join(delimiter).replace(/^"(.*)"$/, '$1').trim()
      if (front || back) cards.push({ front, back })
    }
  }
  return cards
}

function parseQuizletPaste(text: string): ParsedCard[] {
  // Quizlet export: each line is "term\tdefinition"
  // Or sometimes separated by double newlines with term on one line and definition on next
  const lines = text.split(/\r?\n/).filter((l) => l.trim())

  // Try tab-separated first
  const tabCards: ParsedCard[] = []
  for (const line of lines) {
    if (line.includes('\t')) {
      const [front, ...rest] = line.split('\t')
      tabCards.push({ front: front.trim(), back: rest.join('\t').trim() })
    }
  }
  if (tabCards.length > 0) return tabCards

  // Fallback: alternating lines (odd = front, even = back)
  const cards: ParsedCard[] = []
  for (let i = 0; i < lines.length - 1; i += 2) {
    cards.push({ front: lines[i].trim(), back: lines[i + 1].trim() })
  }
  return cards
}

async function parseAnkiApkg(buffer: ArrayBuffer): Promise<ParsedCard[]> {
  const JSZip = (await import('jszip')).default
  const initSqlJs = (await import('sql.js')).default

  const zip = await JSZip.loadAsync(buffer)
  const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21')
  if (!dbFile) throw new Error('No collection database found in .apkg file')

  const dbBuffer = await dbFile.async('uint8array')
  const SQL = await initSqlJs()
  const db = new SQL.Database(dbBuffer)

  const cards: ParsedCard[] = []
  try {
    // Anki stores notes with fields separated by \x1f (unit separator)
    const stmt = db.prepare('SELECT flds FROM notes')
    while (stmt.step()) {
      const fields = (stmt.get()[0] as string).split('\x1f')
      if (fields.length >= 2) {
        // Strip HTML tags for clean text
        const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim()
        cards.push({
          front: stripHtml(fields[0]),
          back: stripHtml(fields[1])
        })
      }
    }
    stmt.free()
  } finally {
    db.close()
  }
  return cards
}

async function parseQuizletUrl(url: string): Promise<ParsedCard[]> {
  const html = await api.fetchUrl(url)
  const cards: ParsedCard[] = []

  // Extract set ID from URL for API fallback
  const setIdMatch = url.match(/quizlet\.com\/(\d+)/)
  const setId = setIdMatch ? setIdMatch[1] : null

  // Method 1: Try Quizlet's internal API directly — paginate to get ALL cards
  if (setId) {
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        const apiUrl = `https://quizlet.com/webapi/3.4/studiable-item-documents?filters%5BstudiableContainerId%5D=${setId}&filters%5BstudiableContainerType%5D=1&perPage=500&page=${page}`
        const apiResp = await api.fetchUrl(apiUrl)
        const apiData = JSON.parse(apiResp)
        const items = apiData?.responses?.[0]?.models?.studiableItem
        if (items && items.length > 0) {
          for (const item of items) {
            const cardSides = item.cardSides || []
            const front = cardSides.find((s: any) => s.label === 'word')?.media?.[0]?.plainText || ''
            const back = cardSides.find((s: any) => s.label === 'definition')?.media?.[0]?.plainText || ''
            if (front || back) cards.push({ front, back })
          }
          // Check if there are more pages
          const paging = apiData?.responses?.[0]?.paging
          hasMore = paging ? paging.page < paging.totalPages : false
          page++
        } else {
          hasMore = false
        }
      }
      if (cards.length > 0) return cards
    } catch { /* continue to page scraping */ }
  }

  // Method 2: Extract from __NEXT_DATA__ JSON in page HTML
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const redux = data?.props?.pageProps?.dehydratedReduxStateKey
        ? JSON.parse(data.props.pageProps.dehydratedReduxStateKey)
        : null
      if (redux?.studyModesCommon?.studiableData?.studiableItems) {
        for (const item of redux.studyModesCommon.studiableData.studiableItems) {
          const cardSides = item.cardSides || []
          const front = cardSides.find((s: any) => s.label === 'word')?.media?.[0]?.plainText || ''
          const back = cardSides.find((s: any) => s.label === 'definition')?.media?.[0]?.plainText || ''
          if (front || back) cards.push({ front, back })
        }
        if (cards.length > 0) return cards
      }
    } catch { /* continue */ }
  }

  // Method 3: Regex extract word/definition pairs from page source
  const termRegex = /"word"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  const defRegex = /"definition"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  const terms: string[] = []
  const defs: string[] = []
  let m
  while ((m = termRegex.exec(html)) !== null) terms.push(JSON.parse(`"${m[1]}"`))
  while ((m = defRegex.exec(html)) !== null) defs.push(JSON.parse(`"${m[1]}"`))

  // Deduplicate (regex may find duplicates from different JSON structures in the page)
  const seen = new Set<string>()
  for (let i = 0; i < Math.min(terms.length, defs.length); i++) {
    const key = `${terms[i]}|||${defs[i]}`
    if (!seen.has(key)) {
      seen.add(key)
      cards.push({ front: terms[i], back: defs[i] })
    }
  }

  if (cards.length === 0) throw new Error('Could not extract flashcards from this Quizlet URL. Make sure the set is public.')
  return cards
}

type ImportFormat = 'csv' | 'quizlet' | 'anki' | 'quizlet-url'

export default function ImportCards() {
  const navigate = useNavigate()
  const { decks, addDeck } = useDeckStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [format, setFormat] = useState<ImportFormat>('csv')
  const [pasteText, setPasteText] = useState('')
  const [quizletUrl, setQuizletUrl] = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([])
  const [targetDeckId, setTargetDeckId] = useState<number | 'new'>(decks[0]?.id ?? 'new')
  const [newDeckName, setNewDeckName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    try {
      if (format === 'anki') {
        const buffer = await file.arrayBuffer()
        const cards = await parseAnkiApkg(buffer)
        setParsedCards(cards)
      } else {
        const text = await file.text()
        const cards = format === 'csv' ? parseCSV(text) : parseQuizletPaste(text)
        setParsedCards(cards)
      }
    } catch (err) {
      setError(`Failed to parse file: ${err}`)
      setParsedCards([])
    }
  }

  const handleQuizletUrlFetch = async () => {
    if (!quizletUrl.trim()) return
    setError('')
    setFetchingUrl(true)
    try {
      const cards = await parseQuizletUrl(quizletUrl.trim())
      setParsedCards(cards)
    } catch (err) {
      setError(`${err}`)
    } finally {
      setFetchingUrl(false)
    }
  }

  const handlePasteParse = () => {
    setError('')
    try {
      const cards = format === 'quizlet' ? parseQuizletPaste(pasteText) : parseCSV(pasteText)
      setParsedCards(cards)
    } catch (err) {
      setError(`Failed to parse: ${err}`)
    }
  }

  const handleImport = async () => {
    if (parsedCards.length === 0) return
    setImporting(true)
    setImportedCount(0)
    setError('')

    try {
      let deckId: number
      if (targetDeckId === 'new') {
        const name = newDeckName.trim() || 'Imported Deck'
        const deck = await addDeck(name)
        deckId = deck.id
      } else {
        deckId = targetDeckId
      }

      for (let i = 0; i < parsedCards.length; i++) {
        const card = parsedCards[i]
        const front = serializeContent({ markdown: card.front, drawing: null })
        const back = serializeContent({ markdown: card.back, drawing: null })
        await api.createCard(deckId, front, back)
        setImportedCount(i + 1)
      }

      setDone(true)
    } catch (err) {
      setError(`Import failed: ${err}`)
    } finally {
      setImporting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="text-5xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-bold mb-2">Import Complete!</h2>
        <p className="text-gray-600 mb-6">
          Imported <span className="font-semibold">{importedCount}</span> cards.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => {
              setParsedCards([])
              setPasteText('')
              setDone(false)
              setImportedCount(0)
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
          >
            Import More
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-medium"
          >
            Back to Decks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Import Cards</h2>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>

      {/* Format selector */}
      <div className="flex gap-2 mb-6">
        {([
          { id: 'csv' as const, label: 'CSV / TSV', desc: 'Comma or tab separated' },
          { id: 'quizlet' as const, label: 'Quizlet Paste', desc: 'Tab-separated text' },
          { id: 'quizlet-url' as const, label: 'Quizlet URL', desc: 'Paste a share link' },
          { id: 'anki' as const, label: 'Anki (.apkg)', desc: 'Anki export file' }
        ]).map((f) => (
          <button
            key={f.id}
            onClick={() => { setFormat(f.id); setParsedCards([]); setError('') }}
            className={`flex-1 p-3 rounded-xl border-2 text-left transition-colors ${
              format === f.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-sm">{f.label}</div>
            <div className="text-xs text-gray-500">{f.desc}</div>
          </button>
        ))}
      </div>

      {/* Input area */}
      {format === 'quizlet-url' ? (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Quizlet set URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={quizletUrl}
              onChange={(e) => setQuizletUrl(e.target.value)}
              placeholder="https://quizlet.com/123456789/..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleQuizletUrlFetch}
              disabled={fetchingUrl || !quizletUrl.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {fetchingUrl ? 'Fetching...' : 'Fetch Cards'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Paste a Quizlet share link. The set must be public.</p>
        </div>
      ) : format === 'anki' ? (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select .apkg file</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".apkg"
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Upload File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={format === 'csv' ? '.csv,.tsv,.txt' : '.txt'}
              onChange={handleFileSelect}
              className="hidden"
            />
            <span className="text-sm text-gray-400 self-center">or paste below</span>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={format === 'csv'
              ? 'front,back\nWhat is 2+2?,4\nCapital of France?,Paris'
              : 'Term1\tDefinition1\nTerm2\tDefinition2'
            }
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <button
            onClick={handlePasteParse}
            disabled={!pasteText.trim()}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
          >
            Parse
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Preview */}
      {parsedCards.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Preview ({parsedCards.length} cards found)
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">#</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Front</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Back</th>
                </tr>
              </thead>
              <tbody>
                {parsedCards.slice(0, 50).map((card, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 truncate max-w-[200px]">{card.front}</td>
                    <td className="px-3 py-1.5 truncate max-w-[200px]">{card.back}</td>
                  </tr>
                ))}
                {parsedCards.length > 50 && (
                  <tr className="border-t border-gray-100">
                    <td colSpan={3} className="px-3 py-2 text-gray-400 text-center">
                      ...and {parsedCards.length - 50} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Target deck + Import button */}
      {parsedCards.length > 0 && (
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Import into</label>
            <select
              value={targetDeckId}
              onChange={(e) => setTargetDeckId(e.target.value === 'new' ? 'new' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="new">+ New deck</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {targetDeckId === 'new' && (
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Deck name</label>
              <input
                type="text"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="Imported Deck"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 shrink-0"
          >
            {importing ? `Importing ${importedCount}/${parsedCards.length}...` : `Import ${parsedCards.length} cards`}
          </button>
        </div>
      )}
    </div>
  )
}
