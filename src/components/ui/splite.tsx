'use client'

// Vendored from 21st.dev — https://21st.dev/@serafimcloud/components/splite
// (component id 1166, author serafimcloud), fetched via the 21st MCP
// (mcp__21st__search + mcp__21st__get_component). Kept faithful to the
// upstream source so future updates can be diffed cleanly; the only
// deviation is this comment block.

import { Suspense, lazy } from 'react'

const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  scene: string
  className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <span className="loader"></span>
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}
