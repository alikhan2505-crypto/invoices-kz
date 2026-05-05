'use client'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-8xl font-bold text-[#1C2056] mb-4">404</div>
        <div className="text-xl font-semibold text-[#1C2056] mb-2">Страница не найдена</div>
        <p className="text-gray-400 text-sm mb-8">
          Возможно ссылка устарела или страница была удалена
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="bg-[#1C2056] text-white px-8 py-3 rounded-xl text-sm font-medium">
          На главную
        </button>
      </div>
    </main>
  )
}