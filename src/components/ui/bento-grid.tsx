'use client'

// Vendored from 21st.dev -- https://21st.dev/@kokonutd/components/bento-grid
// (component id 622, author kokonutd, "Bento Grid"), fetched via the 21st MCP
// (mcp__21st__search + mcp__21st__get_component). Upstream source is saved
// at .superpowers/sdd/bento-grid-source-21st.tsx for reference. ADAPTED, not
// copied verbatim -- deviations from upstream:
//  - no cn()/@/lib/utils (this repo has neither shadcn nor a utils barrel)
//    -- plain className strings joined with a tiny local `cx` helper
//  - no lucide-react -- `icon` takes a ReactNode so callers pass their own
//    inline SVG icon components (page.tsx reuses its existing BoltIcon /
//    PaymentIcon / ApiIcon / PenIcon / StoreIcon / BotIcon)
//  - dark-only: every `dark:` variant and the light-mode gray/white classes
//    are gone, restyled with this app's SURFACE/BORDER tokens (mirrored here
//    as literals -- see page.tsx's module-scope SURFACE/BORDER consts,
//    there's no shared tokens file to import from) and the brand's #5EEAD4
//    accent instead of upstream's gray-scale palette
//  - dropped the hashtag `tags` row and the "Explore ->" hover CTA -- both
//    were templated demo filler, not something the design spec asked to keep
//  - added an optional `href`: a card with one becomes a real, keyboard-
//    focusable `<a>` (used for the Cashier API card) with a small arrow
//    glyph next to the title as the click affordance, since "Explore ->"
//    was dropped
//  - renamed `status`/`meta` to a single `chip` (small pill, top-right) --
//    the design spec's copy calls these "meta-chips"; upstream's two
//    overlapping fields for the same idea were unnecessary
//  - split upstream's one `BentoGrid(items)` component into a `BentoGrid`
//    grid container (takes `children`) and a standalone `BentoCard`, so the
//    call site can wrap each card in its own `<Reveal>` scroll-entrance
//    (with a staggered delay) and apply the column-span there -- matching
//    how every other section of page.tsx already uses `Reveal` per item
//  - hover lift and the icon-glow are `motion-safe:`-gated per this repo's
//    reduced-motion convention; the dot-pattern's opacity fade is a plain
//    CSS transition (this file follows page.tsx's own convention of only
//    gating actual transform/movement, not opacity/color fades, behind
//    motion-safe -- see e.g. its header's transition-shadow)

import type { ReactNode } from 'react'

export interface BentoItem {
  title: string
  description: string
  icon: ReactNode
  chip?: string
  hasPersistentHover?: boolean
  href?: string
}

const SURFACE = 'rgba(20,23,46,0.86)'
const BORDER = 'rgba(255,255,255,0.12)'
const ACCENT = '#5EEAD4'

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function BentoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
}

export function BentoCard({ item, className }: { item: BentoItem; className?: string }) {
  const cardClassName = cx(
    'group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-6 text-left',
    'motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-1 will-change-transform',
    item.href && 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    className
  )
  const style = {
    // hex + 2-digit-alpha suffix on the ACCENT literal, matching page.tsx's
    // own convention for translucent brand color (e.g. `${COLOR.violet}33`)
    // rather than an rgba() triple, so this stays visibly "the #5EEAD4
    // accent, just faded" rather than reading as a new arbitrary color.
    background: SURFACE,
    border: `1px solid ${item.hasPersistentHover ? `${ACCENT}59` : BORDER}`,
    boxShadow: item.hasPersistentHover ? `0 24px 48px -24px ${ACCENT}66` : undefined,
  }

  const content = (
    <>
      {/* subtle dot-pattern overlay -- dark-ground only, no light variant needed */}
      <div
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[length:16px_16px] transition-opacity duration-300',
          item.hasPersistentHover ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
        )}
      />

      <div className="relative flex items-center justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', color: ACCENT }}
        >
          {item.icon}
        </div>
        {item.chip && (
          <span
            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)' }}
          >
            {item.chip}
          </span>
        )}
      </div>

      <div className="relative">
        <h3 className="flex items-center gap-1.5 text-[16px] font-semibold tracking-tight text-white">
          {item.title}
          {item.href && <ArrowGlyph />}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
          {item.description}
        </p>
      </div>
    </>
  )

  if (item.href) {
    return (
      <a href={item.href} className={cardClassName} style={style}>
        {content}
      </a>
    )
  }

  return (
    <div className={cardClassName} style={style}>
      {content}
    </div>
  )
}

function ArrowGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={ACCENT}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}
