'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Security() {
  const router = useRouter()
  const [ecpConnected] = useState(false)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">ЭЦП и безопасность</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* ECP status */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Электронная подпись</div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {ecpConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#2DC48D]/10 flex items-center justify-center text-xl">🔒</div>
                  <div>
                    <div className="text-sm font-medium text-[#2DC48D]">ЭЦП подключена</div>
                    <div className="text-xs text-gray-400">Годна до: 15.08.2026</div>
                    <div className="text-xs text-gray-400">ИП First Project</div>
                  </div>
                </div>
                <button className="text-xs text-red-400 border border-red-200 rounded-lg px-3 py-1.5">
                  Отключить
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🔓</div>
                <div className="text-sm font-medium text-[#1C2056] mb-1">ЭЦП не подключена</div>
                <div className="text-xs text-gray-400 mb-4">Подключите ЭЦП НУЦ РК для подписания счетов</div>
                <button
                  onClick={() => alert('Интеграция с НУЦ РК — скоро!')}
                  className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
                  Подключить ЭЦП
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Security */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Безопасность входа</div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-lg">🔐</span>
                <span className="text-sm text-gray-800">Вход по FaceID / TouchID</span>
              </div>
              <div className="text-xs text-gray-400">Скоро</div>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-lg">🔑</span>
                <span className="text-sm text-gray-800">Изменить PIN-код</span>
              </div>
              <div className="text-xs text-gray-400">Скоро</div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-[#1C2056]/5 rounded-2xl p-4">
          <div className="text-xs text-[#1C2056] font-medium mb-1">Что такое ЭЦП?</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            Электронная цифровая подпись (ЭЦП) — это аналог рукописной подписи. 
            Счета подписанные ЭЦП имеют юридическую силу в Казахстане. 
            Получить ЭЦП можно бесплатно в НУЦ РК (pki.gov.kz).
          </div>
        </div>
      </div>
    </main>
  )
}