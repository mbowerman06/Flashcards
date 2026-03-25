import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Canvas, PencilBrush, Rect, Ellipse, Line, IText, FabricObject, Triangle, Group, FabricImage
} from 'fabric'
import katex from 'katex'
import html2canvas from 'html2canvas'
import type { DrawingData, PaperMode } from '../lib/card-content'
import { useUIStore } from '../stores/ui-store'

const LATEX_PATTERN = /\$\$([^$]+)\$\$|\$([^$]+)\$/

function containsLatex(text: string): boolean {
  return LATEX_PATTERN.test(text)
}

interface LatexRenderResult {
  dataUrl: string
  scale: number  // how much to scale the image down on the canvas
}

async function renderLatexToDataUrl(text: string, fillColor: string, fontSize: number): Promise<LatexRenderResult> {
  // Replace $$...$$ (display) and $...$ (inline) with KaTeX HTML
  let html = text
  html = html.replace(/\$\$([^$]+)\$\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr, { displayMode: true, throwOnError: false })
    } catch {
      return `$$${expr}$$`
    }
  })
  html = html.replace(/\$([^$]+)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr, { displayMode: false, throwOnError: false })
    } catch {
      return `$${expr}$`
    }
  })

  // Render at 3x size for crisp output
  const renderScale = 3
  const renderFontSize = fontSize * renderScale

  // Wrapper clips the render container to 1x1px so user sees nothing,
  // but the container itself is full-size inside for accurate browser painting
  const clipWrapper = document.createElement('div')
  clipWrapper.style.position = 'fixed'
  clipWrapper.style.left = '0'
  clipWrapper.style.top = '0'
  clipWrapper.style.width = '1px'
  clipWrapper.style.height = '1px'
  clipWrapper.style.overflow = 'hidden'
  clipWrapper.style.zIndex = '-1'
  clipWrapper.style.pointerEvents = 'none'
  document.body.appendChild(clipWrapper)

  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '0'
  container.style.top = '0'
  container.style.padding = '30px'
  container.style.background = 'white'
  container.style.display = 'inline-block'
  container.style.fontSize = `${renderFontSize}px`
  container.style.color = fillColor
  container.style.fontFamily = '"KaTeX_Main", "Times New Roman", serif'
  container.style.lineHeight = 'normal'
  container.innerHTML = html
  clipWrapper.appendChild(container)

  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 150))

  try {
    const captureW = container.scrollWidth + 40
    const captureH = container.scrollHeight + 40

    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      width: captureW,
      height: captureH,
      foreignObjectRendering: true
    })
    return { dataUrl: canvas.toDataURL('image/png'), scale: 1 / (2 * renderScale) }
  } finally {
    document.body.removeChild(clipWrapper)
  }
}

export type Tool = 'select' | 'pen' | 'eraser' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'pan'

interface UseFabricCanvasOptions {
  initialData?: DrawingData | null
  readOnly?: boolean
  canvasHeight?: number
}

// Helper to create an arrow (line + triangle head)
function createArrow(
  x1: number, y1: number, x2: number, y2: number,
  strokeColor: string, sw: number
): Group {
  const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
  const headLen = Math.max(sw * 4, 12)

  const line = new Line([x1, y1, x2, y2], {
    stroke: strokeColor,
    strokeWidth: sw,
    selectable: false
  })

  const head = new Triangle({
    left: x2,
    top: y2,
    originX: 'center',
    originY: 'center',
    angle: angle + 90,
    width: headLen,
    height: headLen,
    fill: strokeColor,
    selectable: false
  })

  return new Group([line, head], { selectable: true })
}

export function useFabricCanvas(options: UseFabricCanvasOptions = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const theme = useUIStore.getState().theme
  const [activeTool, setActiveTool] = useState<Tool>('pen')
  const defaultBgColor = options.initialData?.canvasBgColor ?? (theme === 'dark' ? '#1a1a2e' : '#ffffff')
  const [color, setColor] = useState(() => {
    if (theme === 'dark') return '#ffffff'
    return '#000000'
  })
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [colorPalette, setColorPalette] = useState<string[]>(() => {
    const base = [
      '#000000', '#ff0000', '#0000ff', '#00aa00', '#ff8800',
      '#8800ff', '#00aaaa', '#ff00ff', '#888888', '#ffffff'
    ]
    if (theme === 'dark') {
      // Swap position 0 (black) and position 9 (white)
      const swapped = [...base]
      swapped[0] = '#ffffff'
      swapped[9] = '#000000'
      return swapped
    }
    return base
  })
  const [canvasBgColor, setCanvasBgColor] = useState<string>(defaultBgColor)
  const uiSettings = useUIStore.getState()
  const [paperMode, setPaperMode] = useState<PaperMode>(options.initialData?.paperMode ?? uiSettings.defaultPaperMode)
  const [margin, setMargin] = useState(options.initialData?.margin ?? uiSettings.defaultMargin)
  const [gridSpacing, setGridSpacing] = useState(options.initialData?.gridSpacing ?? uiSettings.defaultGridSpacing)
  const paperModeRef = useRef(paperMode)
  const marginRef = useRef(margin)
  const gridSpacingRef = useRef(gridSpacing)

  useEffect(() => {
    paperModeRef.current = paperMode
    fabricRef.current?.requestRenderAll()
  }, [paperMode])
  useEffect(() => {
    marginRef.current = margin
    fabricRef.current?.requestRenderAll()
  }, [margin])
  useEffect(() => {
    gridSpacingRef.current = gridSpacing
    fabricRef.current?.requestRenderAll()
  }, [gridSpacing])
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.backgroundColor = canvasBgColor
    canvas.requestRenderAll()
  }, [canvasBgColor])
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const isLoadingRef = useRef(false)
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null)
  const activeShapeRef = useRef<FabricObject | null>(null)
  const isPanningRef = useRef(false)
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null)
  const isErasingRef = useRef(false)
  const erasedSetRef = useRef<Set<FabricObject>>(new Set())
  const wasTouchPanningRef = useRef(false)
  const activeToolRef = useRef<Tool>('pen')
  const textJustExitedRef = useRef(false)
  const colorPaletteRef = useRef(colorPalette)
  const canvasHeight = options.canvasHeight ?? 400

  // Keep ref in sync
  useEffect(() => { colorPaletteRef.current = colorPalette }, [colorPalette])

  // Save undo state
  const saveUndoState = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const json = JSON.stringify(canvas.toJSON())
    if (undoStack.current.length > 0 && undoStack.current[undoStack.current.length - 1] === json) {
      return
    }
    undoStack.current.push(json)
    redoStack.current = []
    if (undoStack.current.length > 50) undoStack.current.shift()
  }, [])

  const undo = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || undoStack.current.length <= 1) return
    const current = undoStack.current.pop()!
    redoStack.current.push(current)
    const prev = undoStack.current[undoStack.current.length - 1]
    isLoadingRef.current = true
    canvas.loadFromJSON(prev).then(() => {
      canvas.renderAll()
      isLoadingRef.current = false
    })
  }, [])

  const redo = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || redoStack.current.length === 0) return
    const next = redoStack.current.pop()!
    undoStack.current.push(next)
    isLoadingRef.current = true
    canvas.loadFromJSON(next).then(() => {
      canvas.renderAll()
      isLoadingRef.current = false
    })
  }, [])

  const zoomBy = useCallback((factor: number, centerX?: number, centerY?: number) => {
    const canvas = fabricRef.current
    if (!canvas) return
    let zoom = canvas.getZoom() * factor
    zoom = Math.min(Math.max(zoom, 0.1), 10)
    const cx = centerX ?? canvas.getWidth() / 2
    const cy = centerY ?? canvas.getHeight() / 2
    canvas.zoomToPoint({ x: cx, y: cy }, zoom)
    canvas.requestRenderAll()
  }, [])

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return
    const parent = canvasRef.current.parentElement
    if (!parent) return

    const canvas = new Canvas(canvasRef.current, {
      width: parent.clientWidth,
      height: canvasHeight,
      backgroundColor: defaultBgColor,
      isDrawingMode: false,
      allowTouchScrolling: false,
      fireRightClick: true,
      fireMiddleClick: true,
      stopContextMenu: true
    })

    fabricRef.current = canvas

    if (options.readOnly) {
      canvas.selection = false
      canvas.skipTargetFind = true
    }

    if (options.initialData) {
      isLoadingRef.current = true
      canvas.loadFromJSON(
        JSON.stringify({ objects: options.initialData.objects, background: defaultBgColor })
      ).then(() => {
        canvas.renderAll()
        isLoadingRef.current = false
        undoStack.current = [JSON.stringify(canvas.toJSON())]
        if (options.readOnly) {
          setTimeout(() => {
            canvas.setDimensions({ width: parent.clientWidth, height: canvasHeight })
            canvas.renderAll()
          }, 50)
        }
      })
    } else {
      undoStack.current = [JSON.stringify(canvas.toJSON())]
    }

    // Track modifications for undo
    const trackChange = () => {
      if (!isLoadingRef.current) saveUndoState()
    }
    canvas.on('object:added', trackChange)
    canvas.on('object:modified', trackChange)
    canvas.on('object:removed', trackChange)

    // Snap to grid on object move
    canvas.on('object:moving', (opt) => {
      if (!useUIStore.getState().snapToGrid) return
      const mode = paperModeRef.current
      if (mode === 'plain') return
      const spacing = gridSpacingRef.current
      const obj = opt.target
      if (obj) {
        obj.set({
          left: Math.round((obj.left ?? 0) / spacing) * spacing,
          top: Math.round((obj.top ?? 0) / spacing) * spacing
        })
      }
    })

    // LaTeX rendering: when an IText exits editing and contains LaTeX, convert to image
    canvas.on('text:editing:exited', (opt) => {
      textJustExitedRef.current = true
      const textObj = opt.target as InstanceType<typeof IText>
      if (!textObj || !textObj.text || !containsLatex(textObj.text)) return

      const origText = textObj.text
      const origLeft = textObj.left ?? 0
      const origTop = textObj.top ?? 0
      const origColor = (textObj.fill as string) || '#000000'
      const origFontSize = textObj.fontSize ?? 18

      // Store source text as custom property for re-editing
      renderLatexToDataUrl(origText, origColor, origFontSize)
        .then(({ dataUrl, scale }) => {
          isLoadingRef.current = true
          canvas.remove(textObj)

          const imgEl = new Image()
          imgEl.onload = () => {
            const fabricImg = new FabricImage(imgEl, {
              left: origLeft,
              top: origTop,
              scaleX: scale,
              scaleY: scale
            })
            // Store the original LaTeX source for double-click re-editing
            ;(fabricImg as any)._latexSource = origText
            ;(fabricImg as any)._latexColor = origColor
            ;(fabricImg as any)._latexFontSize = origFontSize
            canvas.add(fabricImg)
            canvas.setActiveObject(fabricImg)
            isLoadingRef.current = false
            saveUndoState()
          }
          imgEl.src = dataUrl
        })
        .catch(() => {
          // If rendering fails, leave the IText as-is
        })
    })

    // Double-click on a LaTeX image to re-edit it
    canvas.on('mouse:dblclick', (opt) => {
      const target = opt.target as any
      if (!target || !target._latexSource) return

      const source = target._latexSource as string
      const left = target.left ?? 0
      const top = target.top ?? 0
      const fillColor = target._latexColor || '#000000'
      const fontSize = target._latexFontSize || 18

      isLoadingRef.current = true
      canvas.remove(target)
      isLoadingRef.current = false

      const text = new IText(source, {
        left, top, fontSize, fill: fillColor, fontFamily: 'sans-serif'
      })
      canvas.add(text)
      canvas.setActiveObject(text)
      text.enterEditing()
    })

    // Draw paper pattern after each render
    canvas.on('after:render', () => {
      const mode = paperModeRef.current
      if (mode === 'plain') return

      const ctx = canvas.getContext()
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0]
      const zoom = vpt[0]
      const panX = vpt[4]
      const panY = vpt[5]
      const w = canvas.getWidth()
      const h = canvas.getHeight()
      const spacing = gridSpacingRef.current * zoom
      const mg = marginRef.current * zoom

      if (spacing < 4) return // too zoomed out, skip drawing

      // Calculate the offset so lines tile infinitely
      const offsetX = panX % spacing
      const offsetY = panY % spacing

      ctx.save()
      ctx.lineWidth = 0.5

      if (mode === 'lined') {
        ctx.strokeStyle = '#d0d5dd'
        ctx.beginPath()
        for (let y = offsetY; y < h; y += spacing) {
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
        }
        ctx.stroke()
        // Margin line
        if (mg > 0) {
          const mx = mg + panX
          ctx.strokeStyle = '#f87171'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(mx, 0)
          ctx.lineTo(mx, h)
          ctx.stroke()
        }
      } else if (mode === 'grid') {
        ctx.strokeStyle = '#d0d5dd'
        ctx.beginPath()
        for (let x = offsetX; x < w; x += spacing) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, h)
        }
        for (let y = offsetY; y < h; y += spacing) {
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
        }
        ctx.stroke()
        if (mg > 0) {
          const mx = mg + panX
          ctx.strokeStyle = '#f87171'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(mx, 0)
          ctx.lineTo(mx, h)
          ctx.stroke()
        }
      } else if (mode === 'dot') {
        ctx.fillStyle = '#c0c5cc'
        for (let x = offsetX; x < w; x += spacing) {
          for (let y = offsetY; y < h; y += spacing) {
            ctx.beginPath()
            ctx.arc(x, y, Math.max(1, zoom * 0.8), 0, Math.PI * 2)
            ctx.fill()
          }
        }
        if (mg > 0) {
          const mx = mg + panX
          ctx.strokeStyle = '#f87171'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(mx, 0)
          ctx.lineTo(mx, h)
          ctx.stroke()
        }
      }

      ctx.restore()
    })

    // Scroll wheel zoom
    canvas.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      zoomBy(factor, e.offsetX, e.offsetY)
    })

    // Touch gestures: pinch zoom + two-finger pan
    const canvasEl = canvas.getSelectionElement()?.parentElement || parent
    let lastPinchDist: number | null = null
    let lastTouchCenter: { x: number; y: number } | null = null
    let isTouchPanning = false

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        // Temporarily disable drawing so fingers don't draw
        canvas.isDrawingMode = false
        canvas.selection = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastPinchDist = Math.sqrt(dx * dx + dy * dy)
        lastTouchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        }
        isTouchPanning = true
        wasTouchPanningRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isTouchPanning) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)

        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2

        // Pinch zoom — clamp factor to prevent wild jumps
        if (lastPinchDist !== null && lastPinchDist > 0) {
          let factor = dist / lastPinchDist
          factor = Math.min(Math.max(factor, 0.9), 1.1) // Clamp to ±10% per frame
          const rect = canvasEl.getBoundingClientRect()
          zoomBy(factor, cx - rect.left, cy - rect.top)
        }
        lastPinchDist = dist

        // Pan
        if (lastTouchCenter) {
          const vpt = canvas.viewportTransform!
          vpt[4] += cx - lastTouchCenter.x
          vpt[5] += cy - lastTouchCenter.y
          canvas.requestRenderAll()
        }
        lastTouchCenter = { x: cx, y: cy }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && isTouchPanning) {
        isTouchPanning = false
        lastPinchDist = null
        lastTouchCenter = null
        // Restore drawing mode based on active tool after 2-finger gesture
        const tool = activeToolRef.current
        if (tool === 'pen') {
          canvas.isDrawingMode = true
          canvas.selection = false
        } else if (tool === 'select') {
          canvas.selection = true
        } else if (tool === 'pan') {
          canvas.selection = false
          canvas.skipTargetFind = true
        } else {
          // For eraser, shapes, text, arrow — no drawing mode, no selection
          canvas.selection = false
        }
        // Suppress the stale single-touch that remains after lifting one finger
        // by discarding any active object the canvas may have started targeting
        canvas.discardActiveObject()
        canvas.requestRenderAll()
      }
    }

    // Disable context menu for right-click pan
    const handleContextMenu = (e: Event) => { e.preventDefault() }
    canvasEl.addEventListener('contextmenu', handleContextMenu)

    canvasEl.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvasEl.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvasEl.addEventListener('touchend', handleTouchEnd)

    // Resize
    const handleResize = () => {
      if (parent && parent.clientWidth > 0) {
        canvas.setDimensions({ width: parent.clientWidth, height: canvasHeight })
        canvas.renderAll()
      }
    }
    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | null = null
    if (options.readOnly) {
      resizeObserver = new ResizeObserver(() => {
        if (parent.clientWidth > 0) {
          canvas.setDimensions({ width: parent.clientWidth, height: canvasHeight })
          canvas.renderAll()
        }
      })
      resizeObserver.observe(parent)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      canvasEl.removeEventListener('contextmenu', handleContextMenu)
      canvasEl.removeEventListener('touchstart', handleTouchStart)
      canvasEl.removeEventListener('touchmove', handleTouchMove)
      canvasEl.removeEventListener('touchend', handleTouchEnd)
      resizeObserver?.disconnect()
      canvas.dispose()
      fabricRef.current = null
    }
  }, [])

  // Apply tool changes
  useEffect(() => {
    activeToolRef.current = activeTool
    const canvas = fabricRef.current
    if (!canvas || options.readOnly) return

    // Exit any active text editing before switching tools
    const activeObj = canvas.getActiveObject()
    if (activeObj && activeObj instanceof IText && (activeObj as InstanceType<typeof IText>).isEditing) {
      (activeObj as InstanceType<typeof IText>).exitEditing()
    }

    canvas.isDrawingMode = false
    canvas.selection = true
    canvas.skipTargetFind = false
    canvas.defaultCursor = 'default'
    canvas.hoverCursor = 'move'

    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    const isEditingText = (): boolean => {
      const active = canvas.getActiveObject()
      return !!(active && active instanceof IText && (active as InstanceType<typeof IText>).isEditing)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Suppress all canvas shortcuts when a DOM input/textarea/contenteditable is focused
      const active = document.activeElement
      const isInInput = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        (active as HTMLElement).isContentEditable
      )
      if (isInInput) return

      // Ctrl shortcuts work even during text editing
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); return }
        if (e.key === 'y') { e.preventDefault(); redo(); return }
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomBy(1.25); return }
        if (e.key === '-') { e.preventDefault(); zoomBy(0.8); return }
        return
      }

      // All other shortcuts are suppressed during text editing on canvas
      if (isEditingText()) return

      // Tool shortcuts
      const toolMap: Record<string, Tool> = {
        v: 'select', h: 'pan', p: 'pen', e: 'eraser',
        r: 'rectangle', o: 'circle', a: 'arrow', t: 'text'
      }
      const lower = e.key.toLowerCase()
      if (toolMap[lower]) { e.preventDefault(); setActiveTool(toolMap[lower]); return }

      // Space = toggle pen/eraser
      if (e.code === 'Space') {
        e.preventDefault()
        setActiveTool((prev) => prev === 'pen' ? 'eraser' : 'pen')
        return
      }

      // 0-9 = select color from palette
      if (lower >= '0' && lower <= '9') {
        const idx = lower === '0' ? 9 : parseInt(lower) - 1
        const palette = colorPaletteRef.current
        if (idx < palette.length) {
          setColor(palette[idx])
        }
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    // Middle-mouse + right-click pan wrapper
    const setupPanWrapper = () => {
      canvas.on('mouse:down', (opt) => {
        if (suppressStaleTouchDown(opt)) return
        const btn = (opt.e as MouseEvent).button
        if (btn === 1 || btn === 2) {
          isPanningRef.current = true
          lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY }
          opt.e.preventDefault()
          return
        }
        toolMouseDown(opt)
      })
      canvas.on('mouse:move', (opt) => {
        if (isPanningRef.current && lastPanPointRef.current) {
          const vpt = canvas.viewportTransform!
          vpt[4] += opt.e.clientX - lastPanPointRef.current.x
          vpt[5] += opt.e.clientY - lastPanPointRef.current.y
          lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY }
          canvas.requestRenderAll()
          return
        }
        toolMouseMove(opt)
      })
      canvas.on('mouse:up', (opt) => {
        if (isPanningRef.current) {
          isPanningRef.current = false
          lastPanPointRef.current = null
          return
        }
        toolMouseUp(opt)
      })
    }

    let toolMouseDown = (_opt: any) => {}
    let toolMouseMove = (_opt: any) => {}
    let toolMouseUp = (_opt: any) => {}

    // Guard: suppress stale single-touch events right after a two-finger pan
    const suppressStaleTouchDown = (opt: any): boolean => {
      if (wasTouchPanningRef.current && opt.e instanceof TouchEvent) {
        wasTouchPanningRef.current = false
        return true
      }
      return false
    }

    if (activeTool === 'pen') {
      canvas.isDrawingMode = true
      canvas.freeDrawingBrush = new PencilBrush(canvas)
      canvas.freeDrawingBrush.color = color
      canvas.freeDrawingBrush.width = strokeWidth
      canvas.on('mouse:down', (opt) => {
        if (suppressStaleTouchDown(opt)) return
        const btn = (opt.e as MouseEvent).button
        if (btn === 1 || btn === 2) {
          isPanningRef.current = true
          canvas.isDrawingMode = false
          lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY }
          opt.e.preventDefault()
        }
      })
      canvas.on('mouse:move', (opt) => {
        if (isPanningRef.current && lastPanPointRef.current) {
          const vpt = canvas.viewportTransform!
          vpt[4] += opt.e.clientX - lastPanPointRef.current.x
          vpt[5] += opt.e.clientY - lastPanPointRef.current.y
          lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY }
          canvas.requestRenderAll()
        }
      })
      canvas.on('mouse:up', () => {
        if (isPanningRef.current) {
          isPanningRef.current = false
          lastPanPointRef.current = null
          canvas.isDrawingMode = true
        }
      })
    } else if (activeTool === 'eraser') {
      // Drag eraser: erase anything the cursor touches while mouse is held
      canvas.selection = false
      canvas.skipTargetFind = false
      canvas.defaultCursor = 'crosshair'
      canvas.hoverCursor = 'crosshair'

      toolMouseDown = (opt: any) => {
        isErasingRef.current = true
        erasedSetRef.current = new Set()
        const target = canvas.findTarget(opt.e)
        if (target) {
          erasedSetRef.current.add(target)
          canvas.remove(target)
          canvas.renderAll()
        }
      }
      toolMouseMove = (opt: any) => {
        if (!isErasingRef.current) return
        const target = canvas.findTarget(opt.e)
        if (target && !erasedSetRef.current.has(target)) {
          erasedSetRef.current.add(target)
          canvas.remove(target)
          canvas.renderAll()
        }
      }
      toolMouseUp = () => {
        if (isErasingRef.current && erasedSetRef.current.size > 0) {
          saveUndoState()
        }
        isErasingRef.current = false
        erasedSetRef.current = new Set()
      }
      setupPanWrapper()
    } else if (activeTool === 'text') {
      canvas.defaultCursor = 'text'
      toolMouseDown = (opt: any) => {
        // Skip creating a new text box if we just exited editing — this click is for deselecting
        if (textJustExitedRef.current) {
          textJustExitedRef.current = false
          return
        }
        if (canvas.findTarget(opt.e)) return
        const pointer = canvas.getScenePoint(opt.e)
        const text = new IText('Type here', {
          left: pointer.x, top: pointer.y,
          fontSize: useUIStore.getState().drawingFontSize, fill: color, fontFamily: 'sans-serif'
        })
        canvas.add(text)
        canvas.setActiveObject(text)
        text.enterEditing()
      }
      setupPanWrapper()
    } else if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'arrow') {
      canvas.selection = false
      canvas.skipTargetFind = false
      canvas.defaultCursor = 'crosshair'

      toolMouseDown = (opt: any) => {
        // If clicking on an existing object, let fabric handle selection/dragging — don't create a new shape
        if (canvas.findTarget(opt.e)) return
        const pointer = canvas.getScenePoint(opt.e)
        shapeStartRef.current = { x: pointer.x, y: pointer.y }

        let shape: FabricObject
        if (activeTool === 'rectangle') {
          shape = new Rect({
            left: pointer.x, top: pointer.y, width: 0, height: 0,
            fill: 'transparent', stroke: color, strokeWidth
          })
        } else if (activeTool === 'circle') {
          shape = new Ellipse({
            left: pointer.x, top: pointer.y, rx: 0, ry: 0,
            fill: 'transparent', stroke: color, strokeWidth
          })
        } else {
          // Arrow: use a line while dragging, convert to arrow on mouse up
          shape = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: color, strokeWidth, strokeDashArray: [5, 3]
          })
        }
        isLoadingRef.current = true
        canvas.add(shape)
        isLoadingRef.current = false
        activeShapeRef.current = shape
      }

      toolMouseMove = (opt: any) => {
        if (!shapeStartRef.current || !activeShapeRef.current) return
        const pointer = canvas.getScenePoint(opt.e)
        const start = shapeStartRef.current
        if (activeTool === 'rectangle') {
          (activeShapeRef.current as InstanceType<typeof Rect>).set({
            left: Math.min(start.x, pointer.x), top: Math.min(start.y, pointer.y),
            width: Math.abs(pointer.x - start.x), height: Math.abs(pointer.y - start.y)
          })
        } else if (activeTool === 'circle') {
          (activeShapeRef.current as InstanceType<typeof Ellipse>).set({
            left: Math.min(start.x, pointer.x), top: Math.min(start.y, pointer.y),
            rx: Math.abs(pointer.x - start.x) / 2, ry: Math.abs(pointer.y - start.y) / 2
          })
        } else {
          (activeShapeRef.current as InstanceType<typeof Line>).set({
            x2: pointer.x, y2: pointer.y
          })
        }
        canvas.renderAll()
      }

      toolMouseUp = () => {
        if (activeShapeRef.current && shapeStartRef.current) {
          // For arrow tool: replace the dashed line with a proper arrow group
          if (activeTool === 'arrow') {
            const line = activeShapeRef.current as InstanceType<typeof Line>
            const x1 = line.x1!, y1 = line.y1!, x2 = line.x2!, y2 = line.y2!
            isLoadingRef.current = true
            canvas.remove(line)
            const arrow = createArrow(x1, y1, x2, y2, color, strokeWidth)
            canvas.add(arrow)
            isLoadingRef.current = false
          } else {
            activeShapeRef.current.setCoords()
          }
          saveUndoState()
        }
        shapeStartRef.current = null
        activeShapeRef.current = null
      }
      setupPanWrapper()
    } else if (activeTool === 'pan') {
      canvas.selection = false
      canvas.skipTargetFind = true
      canvas.defaultCursor = 'grab'
      canvas.hoverCursor = 'grab'

      canvas.on('mouse:down', (opt) => {
        if (suppressStaleTouchDown(opt)) return
        isPanningRef.current = true
        lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY }
        canvas.defaultCursor = 'grabbing'
      })
      canvas.on('mouse:move', (opt) => {
        if (isPanningRef.current && lastPanPointRef.current) {
          const vpt = canvas.viewportTransform!
          vpt[4] += opt.e.clientX - lastPanPointRef.current.x
          vpt[5] += opt.e.clientY - lastPanPointRef.current.y
          lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY }
          canvas.requestRenderAll()
        }
      })
      canvas.on('mouse:up', () => {
        isPanningRef.current = false
        lastPanPointRef.current = null
        canvas.defaultCursor = 'grab'
      })
    } else {
      setupPanWrapper()
    }

    return () => { window.removeEventListener('keydown', handleKeyDown) }
  }, [activeTool, color, strokeWidth, options.readOnly, undo, redo, saveUndoState, zoomBy])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !canvas.isDrawingMode || !canvas.freeDrawingBrush) return
    canvas.freeDrawingBrush.color = color
    canvas.freeDrawingBrush.width = strokeWidth
  }, [color, strokeWidth])

  const addImageToCanvas = useCallback((dataUrl: string) => {
    const canvas = fabricRef.current
    if (!canvas) return
    const imgEl = new Image()
    imgEl.onload = () => {
      const fabricImg = new FabricImage(imgEl, {
        left: 50,
        top: 50
      })
      // Scale down if image is larger than canvas
      const maxW = canvas.getWidth() * 0.8
      const maxH = canvas.getHeight() * 0.8
      if (fabricImg.width! > maxW || fabricImg.height! > maxH) {
        const scale = Math.min(maxW / fabricImg.width!, maxH / fabricImg.height!)
        fabricImg.scale(scale)
      }
      canvas.add(fabricImg)
      canvas.setActiveObject(fabricImg)
      canvas.requestRenderAll()
      saveUndoState()
    }
    imgEl.src = dataUrl
  }, [saveUndoState])

  const getDrawingData = useCallback((): DrawingData | null => {
    const canvas = fabricRef.current
    if (!canvas) return null
    const json = canvas.toJSON()
    const hasPaper = paperModeRef.current !== 'plain'
    if (!json.objects || json.objects.length === 0) {
      if (!hasPaper) return null
    }
    return {
      objects: json.objects || [],
      canvasWidth: canvas.getWidth(),
      canvasHeight: canvas.getHeight(),
      viewportTransform: [...(canvas.viewportTransform || [1, 0, 0, 1, 0, 0])],
      paperMode: paperModeRef.current,
      margin: marginRef.current,
      gridSpacing: gridSpacingRef.current,
      canvasBgColor: (canvas.backgroundColor as string) || '#ffffff'
    }
  }, [])

  const updatePaletteColor = useCallback((index: number, newColor: string) => {
    setColorPalette((prev) => {
      const next = [...prev]
      next[index] = newColor
      return next
    })
  }, [])

  return {
    canvasRef, fabricRef, activeTool, setActiveTool,
    color, setColor, strokeWidth, setStrokeWidth,
    undo, redo, zoomBy, getDrawingData, addImageToCanvas,
    colorPalette, updatePaletteColor,
    paperMode, setPaperMode, margin, setMargin, gridSpacing, setGridSpacing,
    canvasBgColor, setCanvasBgColor
  }
}
