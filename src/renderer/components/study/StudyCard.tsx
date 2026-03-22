import { useCallback } from 'react'
import { parseContent } from '../../lib/card-content'
import type { Card } from '../../stores/card-store'
import MDEditor from '@uiw/react-md-editor'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
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

  // Prevent markdown links from navigating (which causes white screen)
  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'A') {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm min-h-[300px] overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200 cursor-pointer"
        onClick={onFlip}
      >
        <span className="text-xs font-medium text-gray-400 uppercase">
          {flipped ? 'Back' : 'Front'}
        </span>
        <span className="text-xs text-blue-500 hover:text-blue-700">
          {flipped ? 'Show Front' : 'Show Back'}
        </span>
      </div>

      <div className="p-6" onClick={handleLinkClick}>
        {content.markdown && (
          <div data-color-mode="light" className="mb-4">
            <MDEditor.Markdown
              source={content.markdown}
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            />
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

        {!content.markdown && (!content.drawing || content.drawing.objects?.length === 0) && (
          <p className="text-gray-400 italic">(empty)</p>
        )}
      </div>
    </div>
  )
}
