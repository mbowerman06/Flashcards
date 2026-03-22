import { useEffect, useCallback, useRef, useState } from 'react'
import { useFabricCanvas } from '../../hooks/useFabricCanvas'
import DrawingToolbar from './DrawingToolbar'
import type { DrawingData } from '../../lib/card-content'

interface Props {
  drawing: DrawingData | null
  onChange: (drawing: DrawingData | null) => void
  readOnly?: boolean
  canvasHeight?: number
}

export default function DrawingCanvas({ drawing, onChange, readOnly, canvasHeight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(canvasHeight ?? 400)

  // Measure the container height dynamically when no fixed height is provided
  useEffect(() => {
    if (canvasHeight || readOnly) return
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.floor(entry.contentRect.height)
        if (h > 0) setMeasuredHeight(h)
      }
    })
    observer.observe(el)
    // Initial measurement
    if (el.clientHeight > 0) setMeasuredHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [canvasHeight, readOnly])

  const {
    canvasRef, fabricRef, activeTool, setActiveTool,
    color, setColor, strokeWidth, setStrokeWidth,
    undo, redo, zoomBy, getDrawingData, addImageToCanvas,
    colorPalette, updatePaletteColor,
    paperMode, setPaperMode, margin, setMargin, gridSpacing, setGridSpacing
  } = useFabricCanvas({ initialData: drawing, readOnly, canvasHeight: canvasHeight ?? measuredHeight })

  const handleImportImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (dataUrl) addImageToCanvas(dataUrl)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [addImageToCanvas])

  const handleSave = useCallback(() => {
    const data = getDrawingData()
    onChange(data)
  }, [getDrawingData, onChange])

  useEffect(() => {
    if (readOnly) return
    const interval = setInterval(handleSave, 1000)
    return () => clearInterval(interval)
  }, [handleSave, readOnly])

  // Resize canvas when measured height changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || readOnly || canvasHeight) return
    const parent = canvas.getSelectionElement()?.parentElement
    if (parent && parent.clientWidth > 0 && measuredHeight > 0) {
      canvas.setDimensions({ width: parent.clientWidth, height: measuredHeight })
      canvas.renderAll()
    }
  }, [measuredHeight, fabricRef, readOnly, canvasHeight])

  const handleResetView = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.requestRenderAll()
  }, [fabricRef])

  return (
    <div className="flex flex-col h-full">
      {!readOnly && (
        <DrawingToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          color={color}
          onColorChange={setColor}
          strokeWidth={strokeWidth}
          onStrokeWidthChange={setStrokeWidth}
          onUndo={undo}
          onRedo={redo}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(0.8)}
          onResetView={handleResetView}
          onImportImage={handleImportImage}
          colorPalette={colorPalette}
          onPaletteColorChange={updatePaletteColor}
          paperMode={paperMode}
          onPaperModeChange={setPaperMode}
          margin={margin}
          onMarginChange={setMargin}
          gridSpacing={gridSpacing}
          onGridSpacingChange={setGridSpacing}
        />
      )}
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
