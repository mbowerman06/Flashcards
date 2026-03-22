import { useState } from 'react'
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
}

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select (V)', icon: 'V' },
  { id: 'pan', label: 'Pan (H)', icon: 'H' },
  { id: 'pen', label: 'Pen (P)', icon: 'P' },
  { id: 'eraser', label: 'Eraser (E)', icon: 'E' },
  { id: 'rectangle', label: 'Rectangle (R)', icon: 'R' },
  { id: 'circle', label: 'Circle (O)', icon: 'O' },
  { id: 'arrow', label: 'Arrow (A)', icon: 'A' },
  { id: 'text', label: 'Text (T)', icon: 'T' }
]

const btnClass =
  'w-8 h-8 flex items-center justify-center rounded bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'

export default function DrawingToolbar({
  activeTool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetView,
  onImportImage,
  colorPalette,
  onPaletteColorChange,
  paperMode,
  onPaperModeChange,
  margin,
  onMarginChange,
  gridSpacing,
  onGridSpacingChange
}: Props) {
  const [editingSlot, setEditingSlot] = useState<number | null>(null)

  return (
    <div className="flex flex-col bg-gray-50 border-b border-gray-200 shrink-0">
      {/* Main toolbar row */}
      <div className="flex items-center gap-2 p-2 flex-wrap">
        {/* Tool buttons */}
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
            className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold transition-colors ${
              activeTool === tool.id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {tool.icon}
          </button>
        ))}

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Color picker + Import image */}
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-300"
          title="Color"
        />
        {onImportImage && (
          <button onClick={onImportImage} title="Import Image" className={btnClass}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}

        {/* Stroke width */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Width:</span>
          <input
            type="range"
            min={1}
            max={20}
            value={strokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-xs text-gray-600 w-4">{strokeWidth}</span>
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Undo / Redo */}
        <button onClick={onUndo} title="Undo (Ctrl+Z)" className={btnClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
          </svg>
        </button>
        <button onClick={onRedo} title="Redo (Ctrl+Y)" className={btnClass}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" />
          </svg>
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        {/* Zoom controls */}
        <button onClick={onZoomOut} title="Zoom Out (Ctrl+-)" className={btnClass}>
          <span className="text-lg font-bold leading-none">&minus;</span>
        </button>
        <button onClick={onResetView} title="Reset View" className={btnClass}>
          <span className="text-xs font-bold">1:1</span>
        </button>
        <button onClick={onZoomIn} title="Zoom In (Ctrl+=)" className={btnClass}>
          <span className="text-lg font-bold leading-none">+</span>
        </button>
      </div>

      {/* Color palette row */}
      {colorPalette && (
        <div className="flex items-center gap-1 px-2 pb-2">
          <span className="text-xs text-gray-400 mr-1">Palette:</span>
          {colorPalette.map((c, i) => {
            const key = i === 9 ? '0' : String(i + 1)
            const isActive = color === c
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div className="relative">
                  <button
                    onClick={() => onColorChange(c)}
                    onDoubleClick={() => setEditingSlot(i)}
                    title={`Color ${key} (press ${key})${isActive ? ' - active' : ''}\nDouble-click to change`}
                    className={`w-6 h-6 rounded border-2 transition-all ${
                      isActive ? 'border-blue-500 scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                  {editingSlot === i && (
                    <input
                      type="color"
                      value={c}
                      autoFocus
                      className="absolute top-0 left-0 w-6 h-6 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        onPaletteColorChange?.(i, e.target.value)
                        onColorChange(e.target.value)
                      }}
                      onBlur={() => setEditingSlot(null)}
                    />
                  )}
                </div>
                <span className="text-[8px] text-gray-400 leading-none">{key}</span>
              </div>
            )
          })}
          <span className="text-[10px] text-gray-300 ml-1">Space: pen/eraser | Right-click: pan</span>
        </div>
      )}

      {/* Paper mode row */}
      {onPaperModeChange && (
        <div className="flex items-center gap-2 px-2 pb-2 flex-wrap">
          <span className="text-xs text-gray-400">Paper:</span>
          {([
            { id: 'plain' as PaperMode, label: 'Plain' },
            { id: 'lined' as PaperMode, label: 'Lined' },
            { id: 'grid' as PaperMode, label: 'Grid' },
            { id: 'dot' as PaperMode, label: 'Dot' }
          ]).map((p) => (
            <button
              key={p.id}
              onClick={() => onPaperModeChange(p.id)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                paperMode === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}

          {paperMode !== 'plain' && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-1" />
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Spacing:</span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={gridSpacing}
                  onChange={(e) => onGridSpacingChange?.(Number(e.target.value))}
                  className="w-16"
                />
                <span className="text-xs text-gray-600 w-5">{gridSpacing}</span>
              </div>
              <div className="w-px h-4 bg-gray-300 mx-1" />
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Margin:</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={margin}
                  onChange={(e) => onMarginChange?.(Number(e.target.value))}
                  className="w-16"
                />
                <span className="text-xs text-gray-600 w-5">{margin || 0}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
