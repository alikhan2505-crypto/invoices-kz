export default function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:block fixed inset-0 -z-10 bg-[#EEF0F7]" />
      {/* The card itself is the fixed, never-moving window frame — rounded on all four
          corners, scrolling its own content internally (overflow-y-auto) so the frame
          stays put while the text inside moves. The sidebar is a fully separate fixed
          element, so this card needs no transform-containment trick of its own. */}
      <div className="lg:fixed lg:top-3 lg:right-3 lg:bottom-3 lg:left-[144px] lg:rounded-[28px] lg:overflow-y-auto lg:shadow-2xl lg:ring-1 lg:ring-black/5 lg:bg-white">
        {children}
      </div>
    </>
  )
}
