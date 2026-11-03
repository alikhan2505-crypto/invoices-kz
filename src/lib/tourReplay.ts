// «Показать тур заново»: на странице с туром (src/components/DashboardTour.tsx,
// GuidedTour) тур регистрирует здесь свою запускалку, а пункт «Показать тур по
// странице» в панели помощи (TopUtilityBar) её вызывает. Реестр общий на вкладку:
// страницы без тура ничего не регистрируют, и пункта у них нет.

type Starter = () => void

const starters: Starter[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

/** Регистрирует запускалку тура; возвращает функцию отмены (вызывать при размонтировании). */
export function registerTourStarter(start: Starter): () => void {
  starters.push(start)
  notify()
  return () => {
    const at = starters.indexOf(start)
    if (at >= 0) starters.splice(at, 1)
    notify()
  }
}

/** Есть ли на странице тур, который можно показать заново. */
export function hasReplayableTour(): boolean {
  return starters.length > 0
}

/** Для useSyncExternalStore: подписка на появление и пропажу тура. */
export function subscribeReplayableTour(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Запускает последний зарегистрированный тур (самый «верхний» на странице). false — запускать нечего. */
export function replayTour(): boolean {
  const start = starters[starters.length - 1]
  if (!start) return false
  start()
  return true
}
