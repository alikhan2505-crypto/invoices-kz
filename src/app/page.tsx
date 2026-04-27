export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-[#1C2056] mb-2">INVOICES.KZ</h1>
        <p className="text-gray-500 mb-8">Счета за 1 минуту</p>
        <a href="/login" className="bg-[#1C2056] text-white px-8 py-4 rounded-xl text-lg font-medium">
          Начать работу
        </a>
      </div>
    </main>
  )
}