import MDEditor, { commands } from '@uiw/react-md-editor'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useUIStore } from '../../stores/ui-store'

interface Props {
  value: string
  onChange: (value: string) => void
}

const toolbarCommands = [
  commands.bold, commands.italic, commands.strikethrough,
  commands.hr, commands.title,
  commands.divider,
  commands.unorderedListCommand, commands.orderedListCommand, commands.checkedListCommand,
  commands.divider,
  commands.code, commands.codeBlock,
  commands.divider,
  commands.quote, commands.image
]

export default function MarkdownEditor({ value, onChange }: Props) {
  const theme = useUIStore((s) => s.theme)

  return (
    <div data-color-mode={theme} className="h-full md-editor-fullheight">
      <MDEditor
        value={value}
        onChange={(val) => onChange(val ?? '')}
        height="100%"
        preview="edit"
        visibleDragbar={false}
        commands={toolbarCommands}
        previewOptions={{
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex]
        }}
      />
    </div>
  )
}
