// Полноэкранная заставка для закрытых/динамических сегментов (view, planner,
// verify, shop, ai-agent и др.). Раньше лежала корневым src/app/loading.tsx и из-за
// этого КАЖДАЯ публичная страница (лендинг, инструменты, гайды) отдавалась в HTML
// как «Загрузка...» + скрытый блок с контентом, раскрываемый скриптом. Публичным
// SEO-страницам заставка не нужна (они отдаются статически), поэтому она живёт
// только в сегментах, где страница реально ждёт данных (22.10.2026).
export default function RootSplash() {
  return (
    <main className="min-h-screen bg-[#1C2056] flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-bold text-white mb-2">INVOICES.KZ</div>
        <div className="text-white/60 text-sm mb-8">Счета за 1 минуту</div>
        <div className="flex justify-center gap-1 mb-3">
          <div className="w-2 h-2 bg-[#2DC48D] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-[#2DC48D] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-[#2DC48D] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
        <div className="text-white/40 text-xs">Загрузка...</div>
      </div>
    </main>
  )
}