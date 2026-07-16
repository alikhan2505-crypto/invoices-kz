export default function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:block fixed inset-0 -z-10 bg-[#EEF0F7]" />
      {/* Pure spacing wrapper — no overflow/rounding here. Rounding lives on <main> and its
          sticky header directly, since overflow:hidden on this ancestor would break
          position:sticky (a scroll-container ancestor disables sticky-to-viewport). */}
      <div className="lg:mt-3 lg:mr-3 lg:mb-3 lg:ml-[104px]">
        {children}
      </div>
    </>
  )
}
