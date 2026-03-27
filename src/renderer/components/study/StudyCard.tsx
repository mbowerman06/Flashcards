import { useCallback } from 'react'
import { parseContent } from '../../lib/card-content'
import type { Card } from '../../stores/card-store'
import RichTextViewer from '../card/RichTextViewer'
import DrawingCanvas from '../card/DrawingCanvas'

interface Props {
  card: Card
  flipped: boolean
  onFlip: () => void
}

export default function StudyCard({ card, flipped, onFlip }: Props) {
  const front = parseContent(card.front_content)
  const back = parseContent(card.back_content)
  const content = flipped ? back : front

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm min-h-[300px] overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 cursor-pointer"
        onClick={onFlip}
      >
        <span className="text-xs font-medium text-gray-400 uppercase">
          {flipped ? 'Back' : 'Front'}
        </span>
        <span className="text-xs text-blue-500 hover:text-blue-700">
          {flipped ? 'Show Front' : 'Show Back'}
        </span>
      </div>

      <div className="p-6">
        {(content.richText || content.plainText) && (
          <div className="mb-4">
            <RichTextViewer content={content.richText} plainText={content.plainText} />
          </div>
        )}

        {content.drawing && content.drawing.objects?.length > 0 && (
          <DrawingCanvas
            key={`${card.id}-${flipped ? 'back' : 'front'}`}
            drawing={content.drawing}
            onChange={() => {}}
            readOnly
          />
        )}

        {!content.richText && !content.plainText && (!content.drawing || content.drawing.objects?.length === 0) && (
          <p className="text-gray-400 italic">(empty)</p>
        )}
      </div>
    </div>
  )
}
