'use client'

// Vendored from 21st.dev — https://21st.dev/@serafimcloud/components/splite
// (component id 1166, author serafimcloud), fetched via the 21st MCP
// (mcp__21st__search + mcp__21st__get_component). Kept faithful to the
// upstream source so future updates can be diffed cleanly; the only
// deviations are this comment block and the optional `globalMouseTracking`
// prop below. That prop was added 2026-08-30 (landing v2 founder feedback,
// see docs/superpowers/specs/2026-08-30-landing-v2-founder-feedback-design.md
// §2): the hosted Spline scene's look-at behavior is authored inside Spline
// itself and only reacts to pointer events that land on its own <canvas>.
// We can't edit the scene, so when this prop is on we forward window-level
// pointer/mouse events onto that canvas so the robot's head tracks the
// cursor across the whole viewport, not just while hovering the canvas.

import { Suspense, lazy, useEffect, useRef } from 'react'

const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  scene: string
  className?: string
  /** Forward window-wide pointermove/mousemove events to the Spline
   * canvas so scene look-at behavior tracks the cursor even when it's
   * outside the canvas bounds. Default false (vendored default behavior
   * — only enable where a full-viewport tracking effect is wanted). */
  globalMouseTracking?: boolean
}

export function SplineScene({ scene, className, globalMouseTracking = false }: SplineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!globalMouseTracking) return

    const forwardToCanvas = (event: PointerEvent | MouseEvent) => {
      // The canvas mounts asynchronously (after the Suspense fallback
      // resolves), so it's looked up lazily on every event rather than
      // cached once.
      const canvas = containerRef.current?.querySelector('canvas')
      if (!canvas || event.target === canvas) return

      try {
        const { clientX, clientY } = event
        if (typeof PointerEvent !== 'undefined') {
          canvas.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }))
        }
        canvas.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }))
      } catch {
        // Swallow — synthetic event dispatch failing should never break the page.
      }
    }

    window.addEventListener('pointermove', forwardToCanvas)
    window.addEventListener('mousemove', forwardToCanvas)

    return () => {
      window.removeEventListener('pointermove', forwardToCanvas)
      window.removeEventListener('mousemove', forwardToCanvas)
    }
  }, [globalMouseTracking])

  return (
    <div ref={containerRef} className="h-full w-full">
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center">
            <span className="loader"></span>
          </div>
        }
      >
        <Spline scene={scene} className={className} />
      </Suspense>
    </div>
  )
}
