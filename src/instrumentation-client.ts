// Выполняется в браузере до гидратации (Next 16, см.
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
// PostHog запускаем после загрузки страницы, когда браузер простаивает: иначе его кусок
// (около 107 КБ gzip) приходил бы посреди гидратации и на телефоне задерживал первые
// нажатия (ревью 05.11: +1,5 с при 4x CPU). Цена: кто ушёл в первые 1–3 секунды, в PostHog
// не попадёт (посещение всё равно видно в Vercel Analytics).
import { startPosthog, trackNavigation } from '@/lib/analytics/posthogClient'

function whenIdle(): void {
  // В WKWebView (Safari, Instagram на iPhone) requestIdleCallback нет.
  const idle = (window as Partial<Window>).requestIdleCallback
  if (idle) idle.call(window, startPosthog, { timeout: 2000 })
  else window.setTimeout(startPosthog, 1)
}

try {
  if (document.readyState === 'complete') whenIdle()
  else {
    window.addEventListener('load', whenIdle, { once: true })
    // Событие load может задержать долгая картинка или виджет: запускаемся не позже 6 с.
    window.setTimeout(startPosthog, 6000)
  }
} catch {
  // аналитика не должна ломать сайт
}

export function onRouterTransitionStart(url: string) {
  trackNavigation(url)
}
