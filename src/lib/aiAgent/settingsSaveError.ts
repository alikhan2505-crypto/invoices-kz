// Какая ошибка сохранения настроек агента показывается владельцу (15.10.2026).
// Раньше save() на странице настроек не разбирал ответ сервера вовсе: на 400
// «name required» оверлей просто исчезал, и человек не понимал, что ничего не
// сохранилось. Здесь только решение «какой текст», без строк -- сами тексты в
// словаре aiAgentForms (ru/kk/en), так что функция чистая и тестируется.

export type SettingsSaveErrorKind =
  | 'name_required'   // пустое название (сервер: 'name required')
  | 'kaspi_shop'      // выбранный магазин Kaspi не найден у этого аккаунта
  | 'forbidden'       // нет доступа к разделу (тариф закончился, 403 admin_only)
  | 'not_found'       // агент удалён в другой вкладке
  | 'generic'         // всё остальное, включая обрыв сети

// status = 0 означает «ответа нет» (fetch бросил исключение).
export function settingsSaveErrorKind(status: number, error: unknown): SettingsSaveErrorKind {
  const code = typeof error === 'string' ? error : ''
  if (code === 'name required') return 'name_required'
  if (code === 'kaspi shop not found') return 'kaspi_shop'
  if (status === 403 || code === 'admin_only') return 'forbidden'
  if (status === 404 || code === 'not_found') return 'not_found'
  return 'generic'
}

// Проверка до запроса: сервер принимает «   » как название (проверяет только
// пустую строку), а агент с названием из пробелов в списке выглядит пустым.
export function isBlankAgentName(name: string): boolean {
  return name.trim().length === 0
}
