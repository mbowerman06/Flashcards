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
  markdown: string
  drawing: DrawingData | null
}

export function emptyContent(): CardSideContent {
  return { markdown: '', drawing: null }
}

export function parseContent(json: string): CardSideContent {
  try {
    const parsed = JSON.parse(json)
    return {
      markdown: parsed.markdown ?? '',
      drawing: parsed.drawing ?? null
    }
  } catch {
    return emptyContent()
  }
}

export function serializeContent(content: CardSideContent): string {
  return JSON.stringify(content)
}

export function hasContent(content: CardSideContent): boolean {
  return content.markdown.trim().length > 0 || (content.drawing?.objects?.length ?? 0) > 0
}

// Question type detection
export type QuestionType = 'definition' | 'fill-in-blank' | 'multi-answer'

export function detectQuestionType(front: CardSideContent, back: CardSideContent): QuestionType {
  // Fill-in-the-blank: front contains {{...}}
  if (/\{\{.+?\}\}/.test(front.markdown)) return 'fill-in-blank'
  // Multi-answer: back has multiple non-empty lines
  const lines = back.markdown.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length > 1) return 'multi-answer'
  return 'definition'
}

// Extract blank answers from {{...}} in front text
export function extractBlanks(frontMarkdown: string): string[] {
  const matches = frontMarkdown.match(/\{\{(.+?)\}\}/g)
  if (!matches) return []
  return matches.map((m) => m.slice(2, -2).trim())
}

// Get the front text with blanks replaced by underscores
export function frontWithBlanks(frontMarkdown: string): string {
  return frontMarkdown.replace(/\{\{.+?\}\}/g, '________')
}

// Get all accepted answers from a multi-answer back
export function getMultiAnswers(backMarkdown: string): string[] {
  return backMarkdown.split('\n').map((l) => l.trim()).filter(Boolean)
}

// Fuzzy match: case-insensitive, trim whitespace
export function answerMatches(given: string, expected: string): boolean {
  return given.trim().toLowerCase() === expected.trim().toLowerCase()
}

export function contentPreview(content: CardSideContent): string {
  if (content.markdown.trim()) {
    const text = content.markdown.replace(/[#*_~`>\-\[\]()!]/g, '').trim()
    return text.length > 60 ? text.substring(0, 60) + '...' : text
  }
  if (content.drawing?.objects?.length) {
    return `[Drawing: ${content.drawing.objects.length} objects]`
  }
  return '(empty)'
}
