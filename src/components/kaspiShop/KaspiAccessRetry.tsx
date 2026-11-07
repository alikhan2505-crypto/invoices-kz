'use client'
// Экран «не удалось проверить подключение к Kaspi» с кнопкой «Повторить».
// Показывается вместо спиннера, когда запрос /api/kaspi-shop/wallet упал: сбой
// не равен «магазин не подключён», поэтому продавца никуда не уводим (аудит
// Kaspi 2026-11-06, K12). Стиль плашки тот же, что у плашек ошибок страниц.
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import PageContainer from '@/components/PageContainer'

export default function KaspiAccessRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
          <div role="alert" className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm flex-1 min-w-[200px]" style={{ color: 'var(--nav-critical)' }}>{message}</span>
            <button type="button" onClick={onRetry} className="text-xs font-semibold rounded-lg px-3 py-2 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        </PageContainer>
      </main>
    </DesktopShell>
  )
}
