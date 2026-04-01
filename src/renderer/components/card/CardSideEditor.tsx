import { useState, Component, type ReactNode } from 'react'
import type { CardSideContent } from '../../lib/card-content'
import RichTextEditor from './RichTextEditor'
import DrawingCanvas from './DrawingCanvas'

// Auto-retry error boundary: catches tiptap "editor not ready" errors and retries
// instead of crashing the entire app
class EditorErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; retryCount: number }
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(props: any) {
    super(props)
    this.state = { hasError: false, retryCount: 0 }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch() {
    // Auto-retry up to 5 times with increasing delay
    if (this.state.retryCount < 5) {
      this.retryTimer = setTimeout(() => {
        this.setState((s) => ({ hasError: false, retryCount: s.retryCount + 1 }))
      }, 100 * (this.state.retryCount + 1))
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
  }

  render() {
    if (this.state.hasError) {
      if (this.state.retryCount >= 5) {
        return (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4">
            <button onClick={() => this.setState({ hasError: false, retryCount: 0 })}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
              Retry Editor
            </button>
          </div>
        )
      }
      return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading editor...</div>
    }
    return this.props.children
  }
}

interface Props {
  content: CardSideContent
  onChange: (content: CardSideContent) => void
}

export default function CardSideEditor({ content, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<'text' | 'draw'>('text')

  return (
    <div className="border border-gray-200 rounded-xl bg-white dark:bg-gray-900 overflow-hidden flex flex-col h-full">
      <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'text'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Text
        </button>
        <button
          onClick={(e) => { setActiveTab('draw'); (e.target as HTMLElement).blur() }}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'draw'
              ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Draw
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === 'text' ? (
          <EditorErrorBoundary>
            <RichTextEditor
              content={content.richText}
              onChange={(json) => onChange({ ...content, richText: json })}
            />
          </EditorErrorBoundary>
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
