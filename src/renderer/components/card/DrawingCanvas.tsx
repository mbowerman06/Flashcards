import { useEffect, useCallback, useRef, useState } from 'react'
import { useFabricCanvas } from '../../hooks/useFabricCanvas'
import DrawingToolbar from './DrawingToolbar'
import type { DrawingData } from '../../lib/card-content'
import { useUIStore } from '../../stores/ui-store'

interface Props {
  drawing: DrawingData | null
  onChange: (drawing: DrawingData | null) => void
  readOnly?: boolean
  canvasHeight?: number
}

export default function DrawingCanvas({ drawing, onChange, readOnly, canvasHeight }: Props) {
  const autoSaveInterval = useUIStore((s) => s.autoSaveInterval)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(canvasHeight ?? 400)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
    paperMode, setPaperMode, margin, setMargin, gridSpacing, setGridSpacing,
    canvasBgColor, setCanvasBgColor,
    shapeFill, setShapeFill
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
    const interval = setInterval(handleSave, autoSaveInterval)
    return () => clearInterval(interval)
  }, [handleSave, readOnly, autoSaveInterval])

  // Resize canvas when measured height changes (e.g. switching side-by-side ↔ stacked layout)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || readOnly || canvasHeight) return
    const parent = canvas.getSelectionElement()?.parentElement
    if (parent && parent.clientWidth > 0 && measuredHeight > 0) {
      canvas.setDimensions({ width: parent.clientWidth, height: measuredHeight })
      // Re-render to prevent content clipping after layout change
      canvas.requestRenderAll()
    }
  }, [measuredHeight, fabricRef, readOnly, canvasHeight])

  const handleResetView = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.requestRenderAll()
  }, [fabricRef])

  const handleExportImage = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    // Export current view as-is (with pan/zoom)
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })
    const link = document.createElement('a')
    link.download = `drawing-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }, [fabricRef])

  const handlePrintDrawing = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 })
    window.electronAPI.saveDrawingPDF(dataUrl)
  }, [fabricRef])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
    // Trigger multiple resize checks to handle layout settling at different rates
    const doResize = () => {
      const canvas = fabricRef.current
      if (!canvas) return
      const parent = containerRef.current
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        canvas.setDimensions({ width: parent.clientWidth, height: parent.clientHeight })
        canvas.renderAll()
      }
    }
    setTimeout(doResize, 50)
    setTimeout(doResize, 150)
    setTimeout(doResize, 300)
  }, [fabricRef])

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsFullscreen(false) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  return (
    <div ref={wrapperRef}
      className={isFullscreen ? 'fixed inset-0 z-[9999] bg-white flex flex-col' : 'flex flex-col h-full'}
      style={isFullscreen ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
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
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          canvasColor={canvasBgColor}
          onCanvasColorChange={setCanvasBgColor}
          onExportImage={handleExportImage}
          shapeFill={shapeFill}
          onShapeFillChange={setShapeFill}
          onPrintDrawing={handlePrintDrawing}
        />
      )}
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
