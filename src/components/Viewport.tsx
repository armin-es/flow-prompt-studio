import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '../store/graphStore'
import { useWireStore } from '../store/wireStore'
import { useHistoryStore } from '../store/historyStore'
import { useViewport } from '../hooks/useViewport'
import { tryCompleteWireTo } from '../lib/completeWire'
import { NodeComponent } from './NodeComponent'
import { EdgeLayer } from './EdgeLayer'
import { WireLayer } from './WireLayer'
import { MarqueeOverlay } from './MarqueeOverlay'

export function Viewport() {
  const viewport = useGraphStore((s) => s.viewport)
  const nodeIds = useGraphStore(useShallow((s) => Array.from(s.nodes.keys())))
  const setSelectionInMarquee = useGraphStore((s) => s.setSelectionInMarquee)
  const clearSelection = useGraphStore((s) => s.clearSelection)
  const { pan, zoomAt, toGraphSpace } = useViewport()
  const wireMove = useWireStore((s) => s.move)

  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const isMarquee = useRef(false)
  const [marquee, setMarquee] = useState<{
    a: { x: number; y: number }
    b: { x: number; y: number }
  } | null>(null)
  const mStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (useWireStore.getState().wire) {
        wireMove(toGraphSpace(e.clientX, e.clientY))
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [wireMove, toGraphSpace])

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const w = useWireStore.getState().wire
      if (!w) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = el?.closest('[data-input-port]') as HTMLElement | null
      if (target) {
        const id = target.getAttribute('data-node-id')
        const raw = target.getAttribute('data-port-index')
        if (id != null && raw != null) {
          const idx = Number(raw)
          if (Number.isFinite(idx)) {
            tryCompleteWireTo(id, idx)
            return
          }
        }
      }
      useWireStore.getState().end()
    }
    document.addEventListener('pointerup', onUp, true)
    return () => document.removeEventListener('pointerup', onUp, true)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (useWireStore.getState().wire) {
      return
    }
    if (e.shiftKey) {
      isMarquee.current = true
      mStart.current = { x: e.clientX, y: e.clientY }
      setMarquee({ a: mStart.current, b: mStart.current })
      window.addEventListener('pointermove', onMarqueeMove)
      window.addEventListener('pointerup', onMarqueeUp, { once: true })
      return
    }
    isPanning.current = true
    lastPan.current = { x: e.clientX, y: e.clientY }
    clearSelection()
    window.addEventListener('pointermove', onPanMove)
    window.addEventListener('pointerup', onPanUp, { once: true })
  }

  const onMarqueeMove = (e: PointerEvent) => {
    if (!isMarquee.current) return
    setMarquee({ a: mStart.current, b: { x: e.clientX, y: e.clientY } })
  }

  const onMarqueeUp = (e: PointerEvent) => {
    window.removeEventListener('pointermove', onMarqueeMove)
    isMarquee.current = false
    setMarquee(null)
    const a = mStart.current
    const b = { x: e.clientX, y: e.clientY }
    const minSx = Math.min(a.x, b.x)
    const maxSx = Math.max(a.x, b.x)
    const minSy = Math.min(a.y, b.y)
    const maxSy = Math.max(a.y, b.y)
    if (maxSx - minSx < 2 && maxSy - minSy < 2) {
      return
    }
    const p1 = toGraphSpace(minSx, minSy)
    const p2 = toGraphSpace(maxSx, maxSy)
    const gMinX = Math.min(p1.x, p2.x)
    const gMaxX = Math.max(p1.x, p2.x)
    const gMinY = Math.min(p1.y, p2.y)
    const gMaxY = Math.max(p1.y, p2.y)
    const { nodes } = useGraphStore.getState()
    const inBox: string[] = []
    for (const n of nodes.values()) {
      const L = n.position.x
      const R = n.position.x + n.width
      const T = n.position.y
      const B = n.position.y + n.height
      if (R < gMinX || L > gMaxX || B < gMinY || T > gMaxY) {
        continue
      }
      inBox.push(n.id)
    }
    if (inBox.length > 0) {
      setSelectionInMarquee(inBox, e.metaKey || e.ctrlKey)
      useHistoryStore.getState().commit()
    }
  }

  const onPanMove = (e: PointerEvent) => {
    if (!isPanning.current) return
    pan(e.clientX - lastPan.current.x, e.clientY - lastPan.current.y)
    lastPan.current = { x: e.clientX, y: e.clientY }
  }

  const onPanUp = () => {
    isPanning.current = false
    window.removeEventListener('pointermove', onPanMove)
  }

  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.clientX, e.clientY, -e.deltaY)
  }

  const { translateX, translateY, scale } = viewport

  return (
    <div
      className="viewport"
      id="graph-viewport"
      tabIndex={-1}
      role="application"
      aria-label="Prompt graph. Pan by dragging the background, Shift-drag to select. Use arrow keys to nudge when nodes are selected."
      onPointerDown={onPointerDown}
      onWheel={onWheel}
    >
      <div
        className="graph-layer"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {nodeIds.map((id) => (
          <NodeComponent key={id} nodeId={id} />
        ))}
      </div>
      <EdgeLayer />
      <WireLayer />
      <MarqueeOverlay box={marquee} />
    </div>
  )
}
