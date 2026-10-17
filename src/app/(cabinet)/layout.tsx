import type { Metadata } from 'next'
import { noindexMetadata } from '@/lib/noindex'
import DesktopShell from '@/components/DesktopShell'
import SiteNav from '@/components/SiteNav'

// Один каркас на весь личный кабинет (счета, история, профиль, тарифы…).
// Раньше КАЖДАЯ страница сама оборачивала себя в <DesktopShell> + <SiteNav />,
// поэтому при любом переходе верхнее меню и окно-карточка уничтожались и
// собирались заново (мигание, основатель просил трижды: «верхний бар не должен
// обновляться, только рабочая зона снизу»).
//
// Теперь каркас живёт здесь: Next не пересоздаёт layout при переходе между
// страницами одной группы, поэтому меняется только {children}. Страницы
// отдают голое содержимое. Адреса не затронуты -- (cabinet) это группа
// маршрутов, в URL её нет.
//
// Что НЕ входит сюда намеренно: публичные страницы (/view, /contract-view,
// /login, лендинги, /tools, /guides, /shop, /print, /planner), /admin (своя
// шапка) и продуктовые кабинеты с боковым меню (/kaspi-shop, /kaspi-api, /cfo,
// /ai-agent) -- у них свой ProductShell.
// Личный кабинет не для поисковиков (17.10.2026): раньше все эти страницы
// наследовали 'index, follow' от корневого layout.
export const metadata: Metadata = noindexMetadata()

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        {children}
      </main>
    </DesktopShell>
  )
}
