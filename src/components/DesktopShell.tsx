export default function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:block fixed inset-0 -z-10 bg-[#EEF0F7]" />
      {/* Pure spacing wrapper — no overflow/rounding here. Rounding lives on <main> and its
          sticky header directly, since overflow:hidden on this ancestor would break
          position:sticky (a scroll-container ancestor disables sticky-to-viewport).
          Padding, not margin: a block's top margin collapses into its parent's when
          nothing separates them, which was pushing <main> flush to the true viewport
          top while the (truly fixed, collapse-immune) sidebar kept its own gap. */}
      <div className="lg:pt-3 lg:pr-3 lg:pb-3 lg:pl-[144px]">
        {children}
      </div>
    </>
  )
}
