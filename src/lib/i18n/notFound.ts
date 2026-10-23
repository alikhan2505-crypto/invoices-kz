// The three strings of the 404 page, kept apart from the big misc dictionary
// (upgrade/admin/promo copy, ~23 KB) because app/not-found.tsx is bundled into
// every route -- it must not drag that dictionary into every page's JS.
export interface NotFoundContent {
  notFoundTitle: string
  notFoundBody: string
  goHomeButton: string
}

export const notFoundDict: Record<'ru' | 'kk' | 'en', NotFoundContent> = {
  ru: {
    notFoundTitle: 'Страница не найдена',
    notFoundBody: 'Возможно ссылка устарела или страница была удалена',
    goHomeButton: 'На главную',
  },
  kk: {
    notFoundTitle: 'Бет табылмады',
    notFoundBody: 'Сілтеме ескірген немесе бет жойылған болуы мүмкін',
    goHomeButton: 'Басты бетке',
  },
  en: {
    notFoundTitle: 'Page not found',
    notFoundBody: 'This link may be outdated or the page may have been removed',
    goHomeButton: 'Go home',
  },
}
