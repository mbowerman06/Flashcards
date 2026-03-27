import { useState, useRef, useEffect } from 'react'
import type { Tool } from '../../hooks/useFabricCanvas'
import type { PaperMode } from '../../lib/card-content'

interface Props {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  color: string
  onColorChange: (color: string) => void
  strokeWidth: number
  onStrokeWidthChange: (width: number) => void
  onUndo: () => void
  onRedo: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
  onImportImage?: () => void
  colorPalette?: string[]
  onPaletteColorChange?: (index: number, color: string) => void
  paperMode?: PaperMode
  onPaperModeChange?: (mode: PaperMode) => void
  margin?: number
  onMarginChange?: (margin: number) => void
  gridSpacing?: number
  onGridSpacingChange?: (spacing: number) => void
  onToggleFullscreen?: () => void
  isFullscreen?: boolean
  canvasColor?: string
  onCanvasColorChange?: (color: string) => void
  onExportImage?: () => void
  onPrintDrawing?: () => void
  shapeFill?: boolean
  onShapeFillChange?: (fill: boolean) => void
}

// SVG icons — tldraw-inspired clean style, consistent 24x24 viewBox, 1.5 stroke
const S = 'w-[18px] h-[18px]'
const icons: Record<string, JSX.Element> = {
  select: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M6 3l12 9-5.5 1.2 3 5.8-2 1-3-5.8L6 18V3z" />
    </svg>
  ),
  pan: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20" />
      <path d="M12 2l-3 3M12 2l3 3" />
      <path d="M12 22l-3-3M12 22l3-3" />
      <path d="M2 12l3-3M2 12l3 3" />
      <path d="M22 12l-3-3M22 12l-3 3" />
    </svg>
  ),
  pen: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2l4 4L7 21l-5 1 1-5z" />
    </svg>
  ),
  eraser: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20H9L4.5 15.5a2 2 0 010-2.8l8.2-8.2a2 2 0 012.8 0l5 5a2 2 0 010 2.8L13.5 20" />
      <path d="M9 12l4 4" />
    </svg>
  ),
  rectangle: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="5" width="16" height="14" rx="1" />
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="12" rx="8" ry="7" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17L17 5" /><path d="M10 5h7v7" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" className={S} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7V5h14v2" /><path d="M12 5v14" /><path d="M9 19h6" />
    </svg>
  )
}

const tools: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'pan', label: 'Pan', key: 'H' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'rectangle', label: 'Rectangle', key: 'R' },
  { id: 'circle', label: 'Circle', key: 'O' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'text', label: 'Text', key: 'T' }
]

const tb = 'w-7 h-7 flex items-center justify-center rounded transition-colors'
const tbIdle = `${tb} text-gray-500 hover:bg-gray-200`
const tbActive = `${tb} bg-blue-600 text-white`
const sep = 'w-px h-5 bg-gray-300 mx-0.5'

function Dropdown({ open, onClose, children, align = 'left', parentRef }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: 'left' | 'right'; parentRef?: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && !(parentRef?.current?.contains(target))) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, parentRef])
  if (!open) return null
  return (
    <div ref={ref} className={`absolute top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 min-w-[200px]`}>
      {children}
    </div>
  )
}

export default function DrawingToolbar(props: Props) {
  const {
    activeTool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange,
    onUndo, onRedo, onZoomIn, onZoomOut, onResetView, onImportImage,
    colorPalette, onPaletteColorChange,
    paperMode, onPaperModeChange, margin, onMarginChange, gridSpacing, onGridSpacingChange,
    onToggleFullscreen, isFullscreen,
    canvasColor, onCanvasColorChange
  } = props

  const [showPalette, setShowPalette] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const paletteButtonRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0 relative z-10 flex-wrap">
      {/* Tools */}
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          title={`${tool.label} (${tool.key})`}
          className={activeTool === tool.id ? tbActive : tbIdle}
        >
          {icons[tool.id]}
        </button>
      ))}

      {/* Shape fill toggle */}
      {props.onShapeFillChange && (
        <button
          onClick={() => props.onShapeFillChange!(!props.shapeFill)}
          className={props.shapeFill ? tbActive : tbIdle}
          title={props.shapeFill ? 'Shapes: filled' : 'Shapes: outline only'}
        >
          {props.shapeFill ? (
            <svg viewBox="0 0 24 24" className="w-[16px] h-[16px]" fill="currentColor" stroke="currentColor" strokeWidth="1"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-[16px] h-[16px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
          )}
        </button>
      )}

      <div className={sep} />

      {/* Color swatch (click to open palette) */}
      <div className="relative flex items-center">
        <button
          ref={paletteButtonRef}
          onClick={() => { setShowPalette(!showPalette); setShowSettings(false) }}
          className={`w-5 h-5 rounded border-2 transition-all ${showPalette ? 'border-blue-500 scale-110' : 'border-gray-300'}`}
          style={{ backgroundColor: color }}
          title="Color palette (1-9, 0)"
        />
        <Dropdown open={showPalette} onClose={() => setShowPalette(false)} parentRef={paletteButtonRef as any}>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs text-gray-500 font-medium">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-gray-300 ml-auto"
            />
          </div>
          {colorPalette && (
            <div className="grid grid-cols-5 gap-1.5">
              {colorPalette.map((c, i) => {
                const key = i === 9 ? '0' : String(i + 1)
                const isActive = color === c
                return (
                  <div key={i} className="relative flex flex-col items-center">
                    <button
                      onClick={() => onColorChange(c)}
                      onDoubleClick={() => setEditingSlot(i)}
                      title={`${key} — double-click to change`}
                      className={`w-7 h-7 rounded border-2 ${isActive ? 'border-blue-500 scale-110' : 'border-gray-200'}`}
                      style={{ backgroundColor: c }}
                    />
                    <span className="text-[8px] text-gray-400 mt-0.5">{key}</span>
                    {editingSlot === i && (
                      <input type="color" value={c} autoFocus
                        className="absolute top-0 left-0 w-7 h-7 opacity-0 cursor-pointer"
                        onChange={(e) => { onPaletteColorChange?.(i, e.target.value); onColorChange(e.target.value) }}
                        onBlur={() => setEditingSlot(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Width</span>
              <input type="range" min={1} max={20} value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                className="flex-1 h-1"
              />
              <span className="text-xs text-gray-600 w-4 text-right">{strokeWidth}</span>
            </div>
          </div>
        </Dropdown>
      </div>

      {/* Inline stroke width — Krita-style compact slider */}
      <div className="flex items-center gap-1 group" title={`Stroke width: ${strokeWidth}`}>
        <div className="w-3 h-3 rounded-full border border-gray-400 shrink-0"
          style={{ backgroundColor: color, transform: `scale(${0.4 + (strokeWidth / 20) * 0.6})` }} />
        <input
          type="range" min={1} max={20} value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="w-14 h-1 accent-gray-500 cursor-pointer"
        />
      </div>

      {/* Import image */}
      {onImportImage && (
        <button onClick={onImportImage} title="Import Image" className={tbIdle}>
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <circle cx="5.5" cy="5.5" r="1" />
            <path d="M2 12l3.5-3.5a1 1 0 011.4 0L10 11.5" />
            <path d="M9.5 10l1-1a1 1 0 011.4 0L14 11" />
          </svg>
        </button>
      )}

      <div className={sep} />

      {/* Undo/Redo */}
      <button onClick={onUndo} title="Undo (Ctrl+Z)" className={tbIdle}>
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6h8a4 4 0 010 8H6" /><path d="M5 3L2 6l3 3" />
        </svg>
      </button>
      <button onClick={onRedo} title="Redo (Ctrl+Y)" className={tbIdle}>
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 6H6a4 4 0 000 8h4" /><path d="M11 3l3 3-3 3" />
        </svg>
      </button>

      <div className={sep} />

      {/* Zoom */}
      <button onClick={onZoomOut} title="Zoom Out (Ctrl+-)" className={tbIdle}>
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 8h10" />
        </svg>
      </button>
      <button onClick={onResetView} title="Reset View" className={`${tbIdle} text-[10px] font-bold`}>
        1:1
      </button>
      <button onClick={onZoomIn} title="Zoom In (Ctrl+=)" className={tbIdle}>
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>

      <div className={sep} />

      {/* Settings dropdown (paper, margin, spacing) */}
      {onPaperModeChange && (
        <div className="relative" ref={settingsButtonRef}>
          <button
            onClick={() => { setShowSettings(!showSettings); setShowPalette(false) }}
            title="Canvas settings"
            className={showSettings ? tbActive : tbIdle}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <Dropdown open={showSettings} onClose={() => setShowSettings(false)} align="right" parentRef={settingsButtonRef}>
            <div className="text-xs font-medium text-gray-500 mb-2">Paper</div>
            <div className="flex gap-1 mb-3">
              {(['plain', 'lined', 'grid', 'dot'] as PaperMode[]).map((p) => (
                <button key={p} onClick={() => onPaperModeChange(p)}
                  className={`px-2.5 py-1 text-xs rounded capitalize ${paperMode === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {p}
                </button>
              ))}
            </div>
            {paperMode !== 'plain' && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500 w-14">Spacing</span>
                  <input type="range" min={10} max={80} value={gridSpacing}
                    onChange={(e) => onGridSpacingChange?.(Number(e.target.value))}
                    className="flex-1 h-1" />
                  <span className="text-xs text-gray-600 w-6 text-right">{gridSpacing}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">Margin</span>
                  <input type="range" min={0} max={1200} value={margin}
                    onChange={(e) => onMarginChange?.(Number(e.target.value))}
                    className="flex-1 h-1" />
                  <span className="text-xs text-gray-600 w-6 text-right">{margin}</span>
                </div>
              </>
            )}
            {onCanvasColorChange && (
              <div className="mt-3 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Canvas color</span>
                  <input
                    type="color"
                    value={canvasColor ?? '#ffffff'}
                    onChange={(e) => onCanvasColorChange(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-gray-300 ml-auto"
                  />
                </div>
              </div>
            )}
            {(props.onExportImage || props.onPrintDrawing) && (
              <div className="mt-3 pt-2 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-500 mb-2">Export</div>
                <div className="flex gap-2">
                  {props.onExportImage && (
                    <button onClick={props.onExportImage} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors text-gray-700">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
                      </svg>
                      Save PNG
                    </button>
                  )}
                  {props.onPrintDrawing && (
                    <button onClick={props.onPrintDrawing} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors text-gray-700">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
                      </svg>
                      Save PDF
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
              Space: pen/eraser &middot; Right-click: pan
            </div>
          </Dropdown>
        </div>
      )}

      {/* Fullscreen */}
      {onToggleFullscreen && (
        <button onClick={onToggleFullscreen} title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'} className={tbIdle}>
          {isFullscreen ? (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v4H2M10 14v-4h4M2 10h4v4M14 6h-4V2" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6V2h4M14 10v4h-4M10 2h4v4M6 14H2v-4" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
