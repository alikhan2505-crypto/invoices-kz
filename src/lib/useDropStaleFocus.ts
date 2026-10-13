'use client'
import { useEffect } from 'react'

// Кнопка «← Все продукты» после возврата кнопкой «Назад» стояла в двойной
// бело-чёрной обводке (ревизия 13.10): браузер восстанавливает страницу из
// bfcache вместе с фокусом на нажатой ссылке и рисует стандартное кольцо фокуса.
// Снимаем этот «застрявший» фокус; клавиатурный фокус при Tab не трогаем.
export function useDropStaleFocus() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])
}
