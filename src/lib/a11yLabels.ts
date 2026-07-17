// Screen-reader-only labels for icon-only buttons (back arrows, close/×,
// edit/delete icons) that have no visible text. Kept separate from the
// per-page i18n dictionaries since these never render on screen.
type Lang = 'ru' | 'kk' | 'en'

export const backLabel = (lang: Lang) =>
  lang === 'kk' ? 'Артқа' : lang === 'en' ? 'Back' : 'Назад'

export const closeLabel = (lang: Lang) =>
  lang === 'kk' ? 'Жабу' : lang === 'en' ? 'Close' : 'Закрыть'

export const deleteLabel = (lang: Lang) =>
  lang === 'kk' ? 'Жою' : lang === 'en' ? 'Delete' : 'Удалить'

export const editLabel = (lang: Lang) =>
  lang === 'kk' ? 'Өзгерту' : lang === 'en' ? 'Edit' : 'Изменить'

export const clearSearchLabel = (lang: Lang) =>
  lang === 'kk' ? 'Іздеуді тазарту' : lang === 'en' ? 'Clear search' : 'Очистить поиск'
