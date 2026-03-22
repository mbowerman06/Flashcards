import { useState } from 'react'
import type { CardSideContent } from '../../lib/card-content'
import MarkdownEditor from './MarkdownEditor'
import DrawingCanvas from './DrawingCanvas'

interface Props {
  content: CardSideContent
  onChange: (content: CardSideContent) => void
}

export default function CardSideEditor({ content, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<'text' | 'draw'>('text')

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden flex flex-col h-full">
      <div className="flex border-b border-gray-200 shrink-0">
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'text'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setActiveTab('draw')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'draw'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Draw
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === 'text' ? (
          <MarkdownEditor
            value={content.markdown}
            onChange={(md) => onChange({ ...content, markdown: md })}
          />
        ) : (
          <DrawingCanvas
            drawing={content.drawing}
            onChange={(drawing) => onChange({ ...content, drawing })}
          />
        )}
      </div>
    </div>
  )
}
