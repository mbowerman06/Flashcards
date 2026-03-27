import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Extension, Node, Mark, mergeAttributes } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { MathBlock, MathInline } from './MathExtension'

// Custom font size (extends TextStyle)
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
      }
    }
  }
})

// Custom line height
const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (attrs) => attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}
        }
      }
    }]
  }
})

// Custom columns node
const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column+',
  defining: true,
  addAttributes() {
    return { count: { default: 2 } }
  },
  parseHTML() { return [{ tag: 'div[data-columns]' }] },
  renderHTML({ HTMLAttributes }) {
    const count = HTMLAttributes.count || 2
    return ['div', mergeAttributes(HTMLAttributes, { 'data-columns': '', style: `display:grid;grid-template-columns:repeat(${count},1fr);gap:1rem` }), 0]
  }
})

const Column = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-column]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', style: 'border-left:2px solid #e5e7eb;padding-left:0.75rem' }), 0]
  }
})

// Comment mark — highlighted text with a note
const Comment = Mark.create({
  name: 'comment',
  addAttributes() {
    return {
      note: { default: '' },
      id: { default: () => Math.random().toString(36).slice(2, 8) }
    }
  },
  parseHTML() { return [{ tag: 'span[data-comment]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-comment': HTMLAttributes.note || '',
      style: 'background-color: #fef3c7; border-bottom: 2px solid #f59e0b; cursor: pointer;',
      title: HTMLAttributes.note || 'Click to edit comment'
    }), 0]
  }
})

export const tiptapExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline,
  Superscript,
  Subscript,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  Color,
  FontSize,
  FontFamily,
  CharacterCount,
  LineHeight,
  TaskList,
  TaskItem.configure({ nested: true }),
  Columns,
  Column,
  Comment,
  MathBlock,
  MathInline,
  Placeholder.configure({ placeholder: 'Start typing...' })
]

interface Props {
  content: object | null
  onChange: (json: object) => void
}

const fonts = [
  { label: 'Sans Serif', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times', value: 'Times New Roman, serif' },
  { label: 'Courier', value: 'Courier New, monospace' },
]

const fontSizes = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px']

const tb = 'px-1.5 py-1 text-xs rounded transition-colors'
const tbIdle = `${tb} text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-600`
const tbActive = `${tb} bg-blue-600 text-white`

export default function RichTextEditor({ content, onChange }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showPageSettings, setShowPageSettings] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const colorRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isExternalUpdate = useRef(false)

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => {
      if (!isExternalUpdate.current) {
        onChange(editor.getJSON())
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[120px] px-4 py-3 dark:prose-invert',
      }
    }
  })

  // Sync content from parent (e.g. when loading existing card)
  useEffect(() => {
    if (!editor || !content || editor.isDestroyed || !editor.view?.dom) return
    try {
      const current = JSON.stringify(editor.getJSON())
      const incoming = JSON.stringify(content)
      if (current !== incoming) {
        isExternalUpdate.current = true
        editor.commands.setContent(content, false)
        isExternalUpdate.current = false
      }
    } catch {
      // Editor view not ready yet, will sync on next update
    }
  }, [editor, content])

  // Ctrl+F for search, Ctrl+L for checklist
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch((prev) => !prev)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        editor?.chain().focus().toggleTaskList().run()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor])

  // Search highlighting (basic: scroll to match)
  useEffect(() => {
    if (!editor || !searchQuery) return
    // Use browser's built-in find
    const editorEl = editor.view.dom
    if (!editorEl) return
    // Clear previous highlights
    editorEl.querySelectorAll('.search-highlight').forEach((el) => {
      const parent = el.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el)
        parent.normalize()
      }
    })
    if (!searchQuery.trim()) return
    // Walk text nodes and highlight matches
    const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT)
    const matches: { node: Text; index: number }[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const idx = node.textContent?.toLowerCase().indexOf(searchQuery.toLowerCase()) ?? -1
      if (idx !== -1) matches.push({ node, index: idx })
    }
    if (matches.length > 0) {
      const { node, index } = matches[0]
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + searchQuery.length)
      const span = document.createElement('span')
      span.className = 'search-highlight bg-yellow-300 rounded'
      range.surroundContents(span)
      span.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [editor, searchQuery])

  // Close pickers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColorPicker(false)
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) setShowHighlightPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!editor || editor.isDestroyed) return null

  // Guard against view not ready
  let editorReady = true
  try { editor.getJSON() } catch { editorReady = false }
  if (!editorReady) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading editor...</div>

  const currentFont = editor.getAttributes('textStyle').fontFamily || fonts[0].value
  const currentSize = editor.getAttributes('textStyle').fontSize || '14px'
  const currentHeading = editor.isActive('heading') ? editor.getAttributes('heading').level : 0
  const wordCount = editor.storage.characterCount?.words() ?? 0

  const colors = ['#000000', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#ec4899', '#6b7280']

  const insertColumns = (count: number) => {
    const cols = Array.from({ length: count }, () => ({
      type: 'column',
      content: [{ type: 'paragraph' }]
    }))
    editor.chain().focus().insertContent({ type: 'columns', attrs: { count }, content: cols }).run()
  }

  const handleExport = async (format: 'json' | 'html' | 'text' | 'docx') => {
    if (format === 'docx') {
      // Convert Tiptap JSON to docx
      const json = editor.getJSON()
      const children: Paragraph[] = []
      const processNode = (node: any) => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          const runs: TextRun[] = []
          for (const child of (node.content || [])) {
            if (child.type === 'text') {
              const marks = child.marks || []
              runs.push(new TextRun({
                text: child.text || '',
                bold: marks.some((m: any) => m.type === 'bold'),
                italics: marks.some((m: any) => m.type === 'italic'),
                underline: marks.some((m: any) => m.type === 'underline') ? {} : undefined,
                strike: marks.some((m: any) => m.type === 'strike'),
                superScript: marks.some((m: any) => m.type === 'superscript'),
                subScript: marks.some((m: any) => m.type === 'subscript'),
                color: marks.find((m: any) => m.type === 'textStyle')?.attrs?.color?.replace('#', '') || undefined,
                font: marks.find((m: any) => m.type === 'textStyle')?.attrs?.fontFamily || undefined,
                size: marks.find((m: any) => m.type === 'textStyle')?.attrs?.fontSize ? parseInt(marks.find((m: any) => m.type === 'textStyle').attrs.fontSize) * 2 : undefined,
              }))
            }
          }
          const align = node.attrs?.textAlign
          children.push(new Paragraph({
            children: runs.length > 0 ? runs : [new TextRun('')],
            heading: node.type === 'heading' ? (
              node.attrs?.level === 1 ? HeadingLevel.HEADING_1 :
              node.attrs?.level === 2 ? HeadingLevel.HEADING_2 :
              node.attrs?.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4
            ) : undefined,
            alignment: align === 'center' ? AlignmentType.CENTER : align === 'right' ? AlignmentType.RIGHT : undefined
          }))
        } else if (node.type === 'bulletList' || node.type === 'orderedList') {
          for (const item of (node.content || [])) {
            for (const child of (item.content || [])) {
              processNode(child)
            }
          }
        }
      }
      for (const node of (json.content || [])) processNode(node)
      const doc = new Document({ sections: [{ children }] })
      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'card-content.docx'
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    let data: string
    let filename: string
    let mime: string
    if (format === 'json') {
      data = JSON.stringify(editor.getJSON(), null, 2)
      filename = 'card-content.json'
      mime = 'application/json'
    } else if (format === 'html') {
      data = editor.getHTML()
      filename = 'card-content.html'
      mime = 'text/html'
    } else {
      data = editor.getText()
      filename = 'card-content.txt'
      mime = 'text/plain'
    }
    const blob = new Blob([data], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddComment = () => {
    const { from, to } = editor.state.selection
    if (from === to) return // no selection
    const note = prompt('Add a comment:')
    if (note === null) return
    editor.chain().focus().setMark('comment', { note }).run()
  }

  // Click on comment to edit
  useEffect(() => {
    if (!editor) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.hasAttribute('data-comment')) {
        const currentNote = target.getAttribute('data-comment') || ''
        const newNote = prompt('Edit comment:', currentNote)
        if (newNote === null) return
        if (newNote === '') {
          // Remove comment mark
          const pos = editor.view.posAtDOM(target, 0)
          editor.chain().focus().setTextSelection({ from: pos, to: pos + (target.textContent?.length || 0) }).unsetMark('comment').run()
        } else {
          const pos = editor.view.posAtDOM(target, 0)
          editor.chain().focus().setTextSelection({ from: pos, to: pos + (target.textContent?.length || 0) }).setMark('comment', { note: newNote }).run()
        }
      }
    }
    editor.view.dom.addEventListener('click', handler)
    return () => editor.view.dom.removeEventListener('click', handler)
  }, [editor])

  return (
    <div className="flex flex-col h-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap shrink-0">
        {/* Font family */}
        <select value={currentFont} onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
          className="text-xs px-1 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 w-24">
          {fonts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {/* Font size */}
        <select value={currentSize} onChange={(e) => editor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run()}
          className="text-xs px-1 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 w-16">
          {fontSizes.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
        </select>

        <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

        {/* B I U S */}
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? tbActive : tbIdle} title="Bold (Ctrl+B)"><b>B</b></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? tbActive : tbIdle} title="Italic (Ctrl+I)"><i>I</i></button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? tbActive : tbIdle} title="Underline (Ctrl+U)"><u>U</u></button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? tbActive : tbIdle} title="Strikethrough"><s>S</s></button>

        <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

        {/* Text color */}
        <div className="relative" ref={colorRef}>
          <button onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false) }} className={tbIdle} title="Text color">
            <span className="font-bold" style={{ color: editor.getAttributes('textStyle').color || '#000' }}>A</span>
            <span className="block h-0.5 w-full rounded" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000' }} />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50 flex gap-1 flex-wrap w-36">
              {colors.map((c) => <button key={c} onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false) }} className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: c }} />)}
              <input type="color" value={editor.getAttributes('textStyle').color || '#000000'} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} className="w-6 h-6 rounded cursor-pointer" />
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative" ref={highlightRef}>
          <button onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false) }} className={editor.isActive('highlight') ? tbActive : tbIdle} title="Highlight">
            <span className="px-0.5 rounded" style={{ backgroundColor: '#fef08a' }}>H</span>
          </button>
          {showHighlightPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50 flex gap-1 flex-wrap w-36">
              {['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa', 'transparent'].map((c) => (
                <button key={c} onClick={() => {
                  if (c === 'transparent') editor.chain().focus().unsetHighlight().run()
                  else editor.chain().focus().toggleHighlight({ color: c }).run()
                  setShowHighlightPicker(false)
                }} className={`w-6 h-6 rounded border border-gray-200 ${c === 'transparent' ? 'relative' : ''}`} style={{ backgroundColor: c === 'transparent' ? '#fff' : c }}>
                  {c === 'transparent' && <span className="absolute inset-0 flex items-center justify-center text-red-500 text-xs">&times;</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

        {/* Super/subscript */}
        <button onClick={() => editor.chain().focus().toggleSuperscript().run()} className={editor.isActive('superscript') ? tbActive : tbIdle} title="Superscript"><span className="text-[10px]">x<sup>2</sup></span></button>
        <button onClick={() => editor.chain().focus().toggleSubscript().run()} className={editor.isActive('subscript') ? tbActive : tbIdle} title="Subscript"><span className="text-[10px]">x<sub>2</sub></span></button>

        <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

        {/* Heading */}
        <select value={currentHeading} onChange={(e) => {
          const level = Number(e.target.value)
          if (level === 0) editor.chain().focus().setParagraph().run()
          else editor.chain().focus().toggleHeading({ level: level as 1|2|3|4 }).run()
        }} className="text-xs px-1 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200 w-20">
          <option value={0}>Normal</option>
          <option value={1}>H1</option>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
          <option value={4}>H4</option>
        </select>

        {/* Alignment */}
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={editor.isActive({ textAlign: 'left' }) ? tbActive : tbIdle} title="Align left">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M3 6h18M3 12h12M3 18h18" /></svg>
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={editor.isActive({ textAlign: 'center' }) ? tbActive : tbIdle} title="Center">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M3 6h18M6 12h12M3 18h18" /></svg>
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={editor.isActive({ textAlign: 'right' }) ? tbActive : tbIdle} title="Right">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M3 6h18M9 12h12M3 18h18" /></svg>
        </button>

        <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

        {/* Lists */}
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? tbActive : tbIdle} title="Bullet list">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
        </button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? tbActive : tbIdle} title="Numbered list">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M10 6h11M10 12h11M10 18h11M3 5v2h3V5H3zm0 6v2h3v-2H3zm0 6v2h3v-2H3z" /></svg>
        </button>
        {/* Checklist */}
        <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={editor.isActive('taskList') ? tbActive : tbIdle} title="Checklist (Ctrl+L)">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </button>

        {/* Math — inline and block */}
        <button onClick={() => editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: '' } }).run()}
          className={tbIdle} title="Inline math">
          <span className="text-[10px] font-serif italic">∑</span>
        </button>
        <button onClick={() => editor.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run()}
          className={tbIdle} title="Math block with symbols">
          <span className="text-[10px] font-serif italic">∑x</span>
        </button>

        {/* Comment */}
        <button onClick={handleAddComment} className={editor.isActive('comment') ? tbActive : tbIdle} title="Comment (select text)">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
        </button>

        {/* Search */}
        <button onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchInputRef.current?.focus(), 50) }} className={showSearch ? tbActive : tbIdle} title="Search (Ctrl+F)">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        </button>

        {/* Page settings gear: line spacing + columns */}
        <div className="relative">
          <button onClick={() => setShowPageSettings(!showPageSettings)} className={showPageSettings ? tbActive : tbIdle} title="Page settings">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
          {showPageSettings && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 w-44">
              <div className="text-[10px] font-medium text-gray-500 mb-1">Line Spacing</div>
              <div className="flex gap-1 mb-2">
                {['1', '1.15', '1.5', '2'].map((v) => (
                  <button key={v} onClick={() => editor.chain().focus().updateAttributes('paragraph', { lineHeight: v }).run()}
                    className="px-2 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 rounded hover:bg-blue-100 dark:hover:bg-blue-900">{v}</button>
                ))}
              </div>
              <div className="text-[10px] font-medium text-gray-500 mb-1">Columns</div>
              <div className="flex gap-1">
                <button onClick={() => insertColumns(2)} className="px-2 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 rounded hover:bg-blue-100 dark:hover:bg-blue-900">2 col</button>
                <button onClick={() => insertColumns(3)} className="px-2 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 rounded hover:bg-blue-100 dark:hover:bg-blue-900">3 col</button>
              </div>
            </div>
          )}
        </div>

        {/* Export — download icon with dropdown */}
        <div className="relative">
          <button onClick={() => setShowExportMenu(!showExportMenu)} className={showExportMenu ? tbActive : tbIdle} title="Download / Export">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 w-24">
              {[{ v: 'docx', l: 'DOCX' }, { v: 'html', l: 'HTML' }, { v: 'json', l: 'JSON' }, { v: 'text', l: 'Text' }].map(({ v, l }) => (
                <button key={v} onClick={() => { handleExport(v as any); setShowExportMenu(false) }}
                  className="w-full text-left px-3 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">{l}</button>
              ))}
            </div>
          )}
        </div>

        {/* Word count */}
        <span className="text-[10px] text-gray-400 ml-auto">{wordCount} words</span>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find in text..."
            className="flex-1 text-xs px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') } }}
          />
          <button onClick={() => { setShowSearch(false); setSearchQuery('') }} className="text-gray-400 hover:text-gray-600 text-xs">&times;</button>
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-auto min-h-0">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}
