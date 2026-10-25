import KkReviewNotice from '@/components/KkReviewNotice'

// Общая обёртка всех казахских страниц инструментов (/tools/kk и /tools/kk/*).
// Единственное место, где ставится плашка «текст проверяется» для инструментов:
// какие страницы на проверке, решает реестр src/lib/kkReview.ts, а не этот файл.
// Плашка обычным блоком над страницей, в потоке (не fixed), поэтому раскладку
// инструментов не трогает.
export default function ToolsKkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <KkReviewNotice className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-3xl" />
      {children}
    </>
  )
}
