export default function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Was a hardcoded bg-[#EEF0F7] (always pale, regardless of theme) --
          this backdrop fills the gutter around the floating card (the
          right-3/bottom-3/left-3 margins), so a theme-unaware color here
          read as a white/pale frame around the card even in dark mode. */}
      <div className="hidden lg:block fixed inset-0 -z-10" style={{ background: 'var(--nav-bg)' }} />
      {/* The card itself is the fixed, never-moving window frame — rounded on all four
          corners, scrolling its own content internally (overflow-y-auto) so the frame
          stays put while the text inside moves. The sidebar is a fully separate fixed
          element, so this card needs no transform-containment trick of its own. */}
      {/* top-0 (not top-3): SiteNav renders as this card's first child, and the card's
          top offset used to shift the sticky bar 12px lower than on non-shell pages,
          making the viewport-fixed TopUtilityBar pill impossible to align on all
          pages at once. Flush top = one bar origin everywhere. Full corner rounding
          (all four) is back -- the alignment fix only ever needed top-0, not a
          squared-off top edge; the earlier rounded-b-only version was an unrelated
          cosmetic change bundled in by mistake. */}
      <div className="desktop-shell-glass desktop-shell-scroll lg:fixed lg:top-0 lg:right-3 lg:bottom-3 lg:left-3 lg:rounded-[28px] lg:overflow-y-auto lg:shadow-2xl lg:ring-1 lg:ring-black/5">
        {children}
      </div>
    </>
  )
}
