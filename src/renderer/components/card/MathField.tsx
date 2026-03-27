import { useEffect, useRef, useState } from 'react'
import 'mathlive'

// MathLive web component type
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        value?: string
        'virtual-keyboard-mode'?: string
        'smart-mode'?: boolean
      }, HTMLElement>
    }
  }
}

interface Props {
  value: string
  onChange: (latex: string) => void
  onDelete?: () => void
  readOnly?: boolean
  compact?: boolean
}

export default function MathField({ value, onChange, onDelete, readOnly, compact }: Props) {
  const ref = useRef<any>(null)
  const [showCopied, setShowCopied] = useState(false)
  const [showMatrixPicker, setShowMatrixPicker] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.value = value

    if (readOnly) return

    const handler = () => {
      onChange(el.value)
    }
    el.addEventListener('input', handler)

    // Delete on backspace when empty
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && !el.value.trim() && onDelete) {
        e.preventDefault()
        onDelete()
      }
    }
    el.addEventListener('keydown', keyHandler)

    return () => {
      el.removeEventListener('input', handler)
      el.removeEventListener('keydown', keyHandler)
    }
  }, [value, onChange, onDelete, readOnly])

  const copyLatex = () => {
    navigator.clipboard.writeText(value)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 1500)
  }

  const insertMatrix = (rows: number, cols: number) => {
    const el = ref.current
    if (!el) return
    // Build matrix LaTeX
    const rowStr = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => '\\placeholder{}').join(' & ')
    ).join(' \\\\ ')
    const latex = `\\begin{bmatrix} ${rowStr} \\end{bmatrix}`
    el.executeCommand(['insert', latex])
    onChange(el.value)
    setShowMatrixPicker(false)
  }

  const quickInserts = [
    { label: 'x/y', cmd: '\\frac{#0}{#0}', title: 'Fraction' },
    { label: '√', cmd: '\\sqrt{#0}', title: 'Square root' },
    { label: 'ⁿ√', cmd: '\\sqrt[#0]{#0}', title: 'Nth root' },
    { label: 'x²', cmd: '{#0}^{#0}', title: 'Superscript' },
    { label: 'x₂', cmd: '{#0}_{#0}', title: 'Subscript' },
    { label: '∫', cmd: '\\int_{#0}^{#0}', title: 'Integral' },
    { label: '∑', cmd: '\\sum_{#0}^{#0}', title: 'Summation' },
    { label: '∏', cmd: '\\prod_{#0}^{#0}', title: 'Product' },
    { label: 'lim', cmd: '\\lim_{#0}', title: 'Limit' },
    { label: '∞', cmd: '\\infty', title: 'Infinity' },
    { label: '≠', cmd: '\\neq', title: 'Not equal' },
    { label: '≤', cmd: '\\leq', title: 'Less or equal' },
    { label: '≥', cmd: '\\geq', title: 'Greater or equal' },
    { label: '±', cmd: '\\pm', title: 'Plus minus' },
    { label: '÷', cmd: '\\div', title: 'Division' },
    { label: '×', cmd: '\\times', title: 'Times' },
    { label: '·', cmd: '\\cdot', title: 'Dot' },
    { label: 'π', cmd: '\\pi', title: 'Pi' },
    { label: 'θ', cmd: '\\theta', title: 'Theta' },
    { label: 'α', cmd: '\\alpha', title: 'Alpha' },
    { label: 'β', cmd: '\\beta', title: 'Beta' },
    { label: 'λ', cmd: '\\lambda', title: 'Lambda' },
    { label: 'Δ', cmd: '\\Delta', title: 'Delta' },
    { label: 'φ', cmd: '\\phi', title: 'Phi' },
    { label: 'σ', cmd: '\\sigma', title: 'Sigma' },
    { label: '∂', cmd: '\\partial', title: 'Partial' },
    { label: '∠', cmd: '\\angle', title: 'Angle' },
    { label: '°', cmd: '\\degree', title: 'Degree' },
    { label: '|x|', cmd: '\\left|#0\\right|', title: 'Absolute value' },
    { label: '()', cmd: '\\left(#0\\right)', title: 'Parentheses' },
    { label: '[]', cmd: '\\left[#0\\right]', title: 'Brackets' },
    { label: '{}', cmd: '\\left\\{#0\\right\\}', title: 'Braces' },
    { label: 'log', cmd: '\\log_{#0}', title: 'Logarithm' },
    { label: 'ln', cmd: '\\ln', title: 'Natural log' },
    { label: 'sin', cmd: '\\sin', title: 'Sine' },
    { label: 'cos', cmd: '\\cos', title: 'Cosine' },
    { label: 'tan', cmd: '\\tan', title: 'Tangent' },
    { label: '→', cmd: '\\rightarrow', title: 'Right arrow' },
    { label: '←', cmd: '\\leftarrow', title: 'Left arrow' },
    { label: '∈', cmd: '\\in', title: 'Element of' },
    { label: '∪', cmd: '\\cup', title: 'Union' },
    { label: '∩', cmd: '\\cap', title: 'Intersection' },
    { label: '⊂', cmd: '\\subset', title: 'Subset' },
    { label: 'ℝ', cmd: '\\mathbb{R}', title: 'Real numbers' },
    { label: 'ℤ', cmd: '\\mathbb{Z}', title: 'Integers' },
  ]

  const handleQuickInsert = (cmd: string) => {
    const el = ref.current
    if (!el) return
    el.executeCommand(['insert', cmd])
    el.focus()
    onChange(el.value)
  }

  if (readOnly) {
    return (
      <span className="inline-block my-1">
        <math-field ref={ref} value={value} virtual-keyboard-mode="off"
          style={{ border: 'none', background: 'transparent', pointerEvents: 'none', fontSize: '1.1em', display: 'inline-block' } as any}
        />
      </span>
    )
  }

  if (compact) {
    return (
      <math-field ref={ref} value={value} virtual-keyboard-mode="onfocus"
        style={{ fontSize: '1em', background: 'transparent', border: '1px solid #93c5fd', borderRadius: '4px', padding: '2px 6px', minWidth: '40px', display: 'inline-block' } as any}
      />
    )
  }

  return (
    <div className="my-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-950/30">
      {/* Math field */}
      <div className="px-3 py-2">
        <math-field ref={ref} value={value} virtual-keyboard-mode="onfocus"
          style={{ width: '100%', fontSize: '1.2em', borderRadius: '6px', padding: '8px 12px', border: '1px solid #d1d5db' } as any}
          className="bg-white dark:bg-gray-800 dark:text-white"
        />
      </div>

      {/* Symbol buttons — Pearson style grid */}
      <div className="px-3 pb-2">
        <div className="flex flex-wrap gap-0.5 mb-1">
          {quickInserts.map((item) => (
            <button key={item.cmd} onClick={() => handleQuickInsert(item.cmd)} title={item.title}
              className="w-8 h-8 flex items-center justify-center text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors">
              {item.label}
            </button>
          ))}
          {/* Matrix button */}
          <div className="relative">
            <button onClick={() => setShowMatrixPicker(!showMatrixPicker)} title="Insert matrix"
              className="w-8 h-8 flex items-center justify-center text-xs font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors">
              [M]
            </button>
            {showMatrixPicker && (
              <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 w-48">
                <div className="text-xs font-medium text-gray-500 mb-2">Matrix size</div>
                <div className="grid grid-cols-4 gap-1">
                  {[1,2,3,4].map((r) =>
                    [1,2,3,4].map((c) => (
                      <button key={`${r}x${c}`} onClick={() => insertMatrix(r, c)}
                        className="text-[10px] px-1.5 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors">
                        {r}×{c}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar: copy LaTeX + info */}
        <div className="flex items-center justify-between mt-1">
          <button onClick={copyLatex}
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
            {showCopied ? 'Copied!' : 'Copy LaTeX'}
          </button>
          <span className="text-[10px] text-gray-400">Type or click symbols above</span>
        </div>
      </div>
    </div>
  )
}
