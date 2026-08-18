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
      {/* top-3 (not top-0): founder wants a top gap matching the left/right/bottom
          margins for a "floating" (парение) card effect on all four sides. This
          reintroduces the 12px sticky-bar shift the top-0 comment above used to
          warn about -- TopUtilityBar's pill is re-centered for it below
          (lg:top-[21px]), scoped to these 5 DesktopShell pages only. Full corner
          rounding (all four) stays -- with a real gap on every side there's no
          longer a flush edge anywhere that would call for a squared-off corner. */}
      <div className="desktop-shell-glass desktop-shell-scroll lg:fixed lg:top-3 lg:right-3 lg:bottom-3 lg:left-3 lg:rounded-[28px] lg:overflow-y-auto lg:shadow-2xl lg:ring-1 lg:ring-black/5">
        {children}
      </div>
    </>
  )
}
