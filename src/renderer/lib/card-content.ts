export type PaperMode = 'plain' | 'lined' | 'grid' | 'dot'

export interface DrawingData {
  objects: object[]
  canvasWidth: number
  canvasHeight: number
  viewportTransform: number[]
  paperMode?: PaperMode
  margin?: number
  gridSpacing?: number
  canvasBgColor?: string
}

export interface CardSideContent {
  richText: object | null   // Tiptap JSON document
  plainText: string         // extracted plain text for search/preview/answers
  drawing: DrawingData | null
}

export function emptyContent(): CardSideContent {
  return { richText: null, plainText: '', drawing: null }
}

/** Extract plain text from Tiptap JSON recursively */
function extractPlainText(doc: any): string {
  if (!doc) return ''
  if (typeof doc === 'string') return doc
  if (doc.type === 'text') return doc.text || ''
  if (doc.type === 'mathBlock' || doc.type === 'mathInline') return doc.attrs?.latex || ''
  if (doc.content && Array.isArray(doc.content)) {
    return doc.content.map((node: any) => {
      const text = extractPlainText(node)
      // Add newline after block nodes
      if (['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type)) {
        return text + '\n'
      }
      return text
    }).join('').replace(/\n{3,}/g, '\n\n').trim()
  }
  return ''
}

export function parseContent(json: string): CardSideContent {
  try {
    const parsed = JSON.parse(json)
    // New format
    if (parsed.richText !== undefined) {
      return {
        richText: parsed.richText,
        plainText: parsed.plainText ?? '',
        drawing: parsed.drawing ?? null
      }
    }
    // Legacy markdown format — convert to plain text
    if (parsed.markdown !== undefined) {
      const plain = parsed.markdown.replace(/[#*_~`>\-\[\]()!]/g, '').trim()
      return {
        richText: null,
        plainText: plain,
        drawing: parsed.drawing ?? null
      }
    }
    return emptyContent()
  } catch {
    return emptyContent()
  }
}

export function serializeContent(content: CardSideContent): string {
  return JSON.stringify({
    richText: content.richText,
    plainText: content.richText ? extractPlainText(content.richText) : content.plainText,
    drawing: content.drawing
  })
}

export function hasContent(content: CardSideContent): boolean {
  const hasText = content.plainText.trim().length > 0 ||
    (content.richText && extractPlainText(content.richText).trim().length > 0)
  return !!hasText || (content.drawing?.objects?.length ?? 0) > 0
}

// Question type detection
export type QuestionType = 'definition' | 'fill-in-blank' | 'multi-answer'

export function getPlainText(content: CardSideContent): string {
  if (content.richText) return extractPlainText(content.richText)
  return content.plainText
}

export function detectQuestionType(front: CardSideContent, back: CardSideContent): QuestionType {
  const frontText = getPlainText(front)
  if (/\{\{.+?\}\}/.test(frontText)) return 'fill-in-blank'
  const lines = getPlainText(back).split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1) return 'multi-answer'
  return 'definition'
}

export function extractBlanks(text: string): string[] {
  const matches = text.match(/\{\{(.+?)\}\}/g)
  if (!matches) return []
  return matches.map((m) => m.slice(2, -2).trim())
}

export function frontWithBlanks(text: string): string {
  return text.replace(/\{\{.+?\}\}/g, '________')
}

export function getMultiAnswers(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

export function answerMatches(given: string, expected: string): boolean {
  return given.trim().toLowerCase() === expected.trim().toLowerCase()
}

export function contentPreview(content: CardSideContent): string {
  const text = getPlainText(content)
  if (text.trim()) {
    return text.length > 60 ? text.substring(0, 60) + '...' : text
  }
  if (content.drawing?.objects?.length) {
    return `[Drawing: ${content.drawing.objects.length} objects]`
  }
  return '(empty)'
}
