'use client'
import { useEffect } from 'react'
import { pageDocumentTitle } from '@/lib/pageTitle'

// Вкладка и история браузера называют страницу её заголовком («История
// счетов — INVOICES.KZ»), а не одной общей строкой на все страницы кабинета.
// Next после гидрации сам переписывает <title>, поэтому пока страница на
// экране, наша строка возвращается на место; при уходе остаётся прежняя.
export function usePageDocumentTitle(title: unknown) {
  useEffect(() => {
    if (typeof title !== 'string' || !title.trim()) return
    const prev = document.title
    const next = pageDocumentTitle(title)
    document.title = next
    const mo = new MutationObserver(() => { if (document.title !== next) document.title = next })
    mo.observe(document.head, { subtree: true, childList: true, characterData: true })
    return () => {
      mo.disconnect()
      if (document.title === next) document.title = prev
    }
  }, [title])
}
