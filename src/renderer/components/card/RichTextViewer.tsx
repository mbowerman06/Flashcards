import { useEditor, EditorContent } from '@tiptap/react'
import { tiptapExtensions } from './RichTextEditor'

interface Props {
  content: object | null
  plainText?: string
}

export default function RichTextViewer({ content, plainText }: Props) {
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none dark:prose-invert',
      }
    }
  }, [content])

  // Fallback for legacy cards or null richText
  if (!content) {
    if (plainText) {
      return <div className="text-sm whitespace-pre-wrap">{plainText}</div>
    }
    return null
  }

  if (!editor || editor.isDestroyed) return null

  return <EditorContent editor={editor} />
}
