// Лёгкий глобальный сигнал «баланс кошелька изменился».
//
// Плашка в правом верхнем углу (TopUtilityBar) и баланс в боковом меню
// (ProductShell) читают баланс один раз при монтировании, поэтому после оплаты
// тарифа с кошелька, возврата удержания, бонуса +100 ₸ или пополнения цифра
// оставалась старой до перезагрузки. Теперь место, меняющее баланс, зовёт
// notifyWalletChanged(), а оба потребителя подписаны через useWalletRefresh.
// Если сигнал так и не придёт — плашка всё равно перечитается при смене
// маршрута и когда вкладка снова становится видимой.

import { useEffect, useRef } from 'react'

export const WALLET_CHANGED_EVENT = 'wallet-balance-changed'

/** Пауза, в которую пачка сигналов (удержание + возврат + бонус) схлопывается в один запрос. */
export const WALLET_REFRESH_DEBOUNCE_MS = 400

export interface WalletChangedDetail {
  /** Кто послал сигнал: этот потребитель свой же сигнал не перечитывает (он уже обновился сам). */
  source?: string
}

/** Сообщить всем подписчикам, что баланс кошелька только что изменился. Безопасно на сервере. */
export function notifyWalletChanged(source?: string): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent<WalletChangedDetail>(WALLET_CHANGED_EVENT, { detail: { source } }))
  } catch {
    // Сигнал — удобство, не обязанность: без него остаются смена маршрута и возврат на вкладку.
  }
}

/** Дебаунс с trailing-вызовом; cancel() снимает отложенный вызов (размонтирование). */
export function createDebounced(fn: () => void, ms: number, timers: {
  set: (cb: () => void, ms: number) => unknown
  clear: (id: unknown) => void
} = { set: (cb, d) => setTimeout(cb, d), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>) }) {
  let id: unknown = null
  return {
    call() {
      if (id !== null) timers.clear(id)
      id = timers.set(() => { id = null; fn() }, ms)
    },
    cancel() {
      if (id !== null) { timers.clear(id); id = null }
    },
  }
}

/** Нужно ли перечитывать баланс по этому сигналу (свой же сигнал игнорируем). */
export function shouldRefreshOnSignal(detail: WalletChangedDetail | undefined | null, ownSource?: string): boolean {
  if (!ownSource) return true
  return detail?.source !== ownSource
}

/**
 * Перечитывать баланс: по сигналу notifyWalletChanged, при смене маршрута
 * (routeKey) и когда вкладка снова видима. Все триггеры схлопываются дебаунсом.
 * enabled=false (не вошли / публичная страница) — ничего не делает.
 */
export function useWalletRefresh(
  refetch: () => void | Promise<void>,
  opts: { enabled: boolean; routeKey?: string; ownSource?: string },
): void {
  const { enabled, routeKey, ownSource } = opts
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch
  const debouncedRef = useRef<ReturnType<typeof createDebounced> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const debounced = createDebounced(() => { void refetchRef.current() }, WALLET_REFRESH_DEBOUNCE_MS)
    debouncedRef.current = debounced
    const onSignal = (e: Event) => {
      if (shouldRefreshOnSignal((e as CustomEvent<WalletChangedDetail>).detail, ownSource)) debounced.call()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') debounced.call() }
    window.addEventListener(WALLET_CHANGED_EVENT, onSignal)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(WALLET_CHANGED_EVENT, onSignal)
      document.removeEventListener('visibilitychange', onVisible)
      debounced.cancel()
      debouncedRef.current = null
    }
  }, [enabled, ownSource])

  // Смена маршрута: первый рендер пропускаем — начальную загрузку делает сам потребитель.
  const lastRouteRef = useRef(routeKey)
  useEffect(() => {
    if (lastRouteRef.current === routeKey) return
    lastRouteRef.current = routeKey
    if (enabled) debouncedRef.current?.call()
  }, [routeKey, enabled])
}
