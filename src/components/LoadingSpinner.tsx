export default function LoadingSpinner() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-400 text-sm">Загрузка...</p>
      </div>
    </main>
  )
}