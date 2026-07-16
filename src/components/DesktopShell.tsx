export default function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:block fixed inset-0 -z-10 bg-[#EEF0F7]" />
      <div className="lg:fixed lg:inset-3 lg:rounded-[28px] lg:overflow-y-auto lg:shadow-2xl lg:ring-1 lg:ring-black/5 lg:[transform:translateZ(0)] lg:bg-white">
        {children}
      </div>
    </>
  )
}
