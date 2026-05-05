export default function Loading() {
  return (
    <main className="min-h-screen bg-[#1C2056] flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-bold text-white mb-2">INVOICES.KZ</div>
        <div className="text-white/60 text-sm mb-8">Счета за 1 минуту</div>
        <div className="flex justify-center gap-1">
          <div className="w-2 h-2 bg-[#2DC48D] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-[#2DC48D] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-[#2DC48D] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </main>
  )
}