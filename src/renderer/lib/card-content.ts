export type PaperMode = 'plain' | 'lined' | 'grid' | 'dot'

export interface DrawingData {
  objects: object[]
  canvasWidth: number
  canvasHeight: number
  viewportTransform: number[]
  paperMode?: PaperMode
  margin?: number
  gridSpacing?: number
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
