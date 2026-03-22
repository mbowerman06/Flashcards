import MDEditor from '@uiw/react-md-editor'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function MarkdownEditor({ value, onChange }: Props) {
  return (
    <div data-color-mode="light" className="h-full md-editor-fullheight">
      <MDEditor
        value={value}
        onChange={(val) => onChange(val ?? '')}
        height="100%"
        preview="edit"
        visibleDragbar={false}
        previewOptions={{
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex]
        }}
      />
    </div>
  )
}
