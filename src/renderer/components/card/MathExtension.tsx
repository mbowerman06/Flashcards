import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import MathField from './MathField'
import { useState } from 'react'

// Block math — full panel with buttons
function MathBlockView({ node, updateAttributes, deleteNode, editor }: any) {
  return (
    <NodeViewWrapper className="math-block" data-drag-handle>
      <MathField
        value={node.attrs.latex}
        onChange={(latex) => updateAttributes({ latex })}
        onDelete={deleteNode}
        readOnly={!editor.isEditable}
      />
    </NodeViewWrapper>
  )
}

// Inline math — compact, expands on demand
function MathInlineView({ node, updateAttributes, deleteNode, editor }: any) {
  const [expanded, setExpanded] = useState(false)

  if (!editor.isEditable) {
    return (
      <NodeViewWrapper as="span" className="math-inline" style={{ display: 'inline' }}>
        <MathField value={node.attrs.latex} onChange={() => {}} readOnly />
      </NodeViewWrapper>
    )
  }

  if (expanded) {
    return (
      <NodeViewWrapper className="math-inline-expanded">
        <MathField
          value={node.attrs.latex}
          onChange={(latex) => updateAttributes({ latex })}
          onDelete={deleteNode}
        />
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-blue-500 hover:underline ml-2 mb-1"
        >
          Collapse
        </button>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <span className="inline-math-field" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <MathField
          value={node.attrs.latex}
          onChange={(latex) => updateAttributes({ latex })}
          onDelete={deleteNode}
          compact
        />
      </span>
      <button onClick={() => setExpanded(true)} title="Expand equation panel"
        className="inline-flex items-center justify-center w-4 h-4 text-[9px] text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50 transition-colors"
        style={{ verticalAlign: 'middle' }}>
        ⊞
      </button>
    </NodeViewWrapper>
  )
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { latex: { default: '' } }
  },
  parseHTML() { return [{ tag: 'div[data-math-block]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '', 'data-latex': HTMLAttributes.latex })]
  },
  addNodeView() { return ReactNodeViewRenderer(MathBlockView) }
})

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { latex: { default: '' } }
  },
  parseHTML() { return [{ tag: 'span[data-math-inline]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '', 'data-latex': HTMLAttributes.latex })]
  },
  addNodeView() { return ReactNodeViewRenderer(MathInlineView) }
})
