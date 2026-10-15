// Словарь страницы «Клиенты» (src/app/profile/clients/page.tsx).
// До ревизии /profile 15.10.2026 страница была только на русском.

export interface ProfileClientsContent {
  headerLabel: string
  addButton: string
  searchPlaceholder: string
  totalLabel: string
  foundLabel: string
  ofLabel: (total: number) => string
  editClientTitle: string
  newClientTitle: string
  nameFieldLabel: string
  namePlaceholder: string
  binIinFieldLabel: string
  emailFieldLabel: string
  addressFieldLabel: string
  addressPlaceholder: string
  phoneFieldLabel: string
  cancelButton: string
  savingLabel: string
  saveButton: string
  nameRequiredAlert: string
  errorPrefix: (message: string) => string
  deleteConfirm: string
  notFoundLabel: string
  emptyLabel: string
  clearSearchButton: string
  binPrefix: (bin: string) => string
  newClientButton: string
}

export const profileClientsDict: Record<'ru' | 'kk' | 'en', ProfileClientsContent> = {
  ru: {
    headerLabel: 'Клиенты',
    addButton: 'Добавить',
    searchPlaceholder: 'Поиск по названию, БИН, email...',
    totalLabel: 'Всего клиентов:',
    foundLabel: 'Найдено:',
    ofLabel: (total: number) => `из ${total}`,
    editClientTitle: 'Редактировать клиента',
    newClientTitle: 'Новый клиент',
    nameFieldLabel: 'Название компании / ИП *',
    namePlaceholder: 'ТОО «Пример»',
    binIinFieldLabel: 'БИН / ИИН',
    emailFieldLabel: 'Email',
    addressFieldLabel: 'Адрес',
    addressPlaceholder: 'г. Алматы, ул. Абая 1',
    phoneFieldLabel: 'Телефон',
    cancelButton: 'Отмена',
    savingLabel: 'Сохраняем...',
    saveButton: 'Сохранить',
    nameRequiredAlert: 'Введите название',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    deleteConfirm: 'Удалить клиента?',
    notFoundLabel: 'Клиент не найден',
    emptyLabel: 'Нет клиентов',
    clearSearchButton: 'Очистить поиск',
    binPrefix: (bin: string) => `БИН/ИИН: ${bin}`,
    newClientButton: 'Новый клиент',
  },
  kk: {
    headerLabel: 'Клиенттер',
    addButton: 'Қосу',
    searchPlaceholder: 'Атауы, БСН, email бойынша іздеу...',
    totalLabel: 'Барлық клиент:',
    foundLabel: 'Табылды:',
    ofLabel: (total: number) => `/ ${total}`,
    editClientTitle: 'Клиентті өзгерту',
    newClientTitle: 'Жаңа клиент',
    nameFieldLabel: 'Компания / ЖК атауы *',
    namePlaceholder: '«Мысал» ЖШС',
    binIinFieldLabel: 'БСН / ЖСН',
    emailFieldLabel: 'Email',
    addressFieldLabel: 'Мекенжай',
    addressPlaceholder: 'Алматы қ., Абай көш. 1',
    phoneFieldLabel: 'Телефон',
    cancelButton: 'Бас тарту',
    savingLabel: 'Сақталуда...',
    saveButton: 'Сақтау',
    nameRequiredAlert: 'Атауын енгізіңіз',
    errorPrefix: (message: string) => `Қате: ${message}`,
    deleteConfirm: 'Клиентті жоясыз ба?',
    notFoundLabel: 'Клиент табылмады',
    emptyLabel: 'Клиенттер жоқ',
    clearSearchButton: 'Іздеуді тазарту',
    binPrefix: (bin: string) => `БСН/ЖСН: ${bin}`,
    newClientButton: 'Жаңа клиент',
  },
  en: {
    headerLabel: 'Clients',
    addButton: 'Add',
    searchPlaceholder: 'Search by name, BIN, email...',
    totalLabel: 'Total clients:',
    foundLabel: 'Found:',
    ofLabel: (total: number) => `of ${total}`,
    editClientTitle: 'Edit client',
    newClientTitle: 'New client',
    nameFieldLabel: 'Company / sole proprietor name *',
    namePlaceholder: 'Example LLP',
    binIinFieldLabel: 'BIN / IIN',
    emailFieldLabel: 'Email',
    addressFieldLabel: 'Address',
    addressPlaceholder: 'Almaty, Abay St. 1',
    phoneFieldLabel: 'Phone',
    cancelButton: 'Cancel',
    savingLabel: 'Saving...',
    saveButton: 'Save',
    nameRequiredAlert: 'Enter a name',
    errorPrefix: (message: string) => `Error: ${message}`,
    deleteConfirm: 'Delete this client?',
    notFoundLabel: 'No client found',
    emptyLabel: 'No clients yet',
    clearSearchButton: 'Clear search',
    binPrefix: (bin: string) => `BIN/IIN: ${bin}`,
    newClientButton: 'New client',
  },
}
