export interface ContractsContent {
  headerLabel: string
  uploadButton: string
  newContractTitle: string
  titleFieldLabel: string
  titleFieldPlaceholder: string
  clientNameFieldLabel: string
  clientNameFieldPlaceholder: string
  clientEmailFieldLabel: string
  clientEmailFieldPlaceholder: string
  fileFieldLabel: string
  chooseFileButton: string
  fileChosenLabel: (name: string) => string
  cancelButton: string
  saveButton: string
  savingLabel: string
  titleRequiredAlert: string
  fileRequiredAlert: string
  errorPrefix: (msg: string) => string
  noContractsHint: string
  noContractsSubHint: string
  deleteContractConfirm: string
  statusNotSent: string
  statusAwaitingClient: string
  statusSigned: string
  loadingLabel: string
  contractNotFoundLabel: string
  fromLabel: string
  clientLabel: string
  noClientLabel: string
  createdLabel: (date: string) => string
  viewFileButton: string
  deleteButton: string
  publicIntro: string
  publicViewFileButton: string
  ecpSectionLabel: string
  proBadge: string
  proLockedHint: string
  goToPlansButton: string
}

export const contractsDict: Record<'ru' | 'kk' | 'en', ContractsContent> = {
  ru: {
    headerLabel: 'Договора',
    uploadButton: '+ Загрузить',
    newContractTitle: 'Новый договор',
    titleFieldLabel: 'Название договора *',
    titleFieldPlaceholder: 'Договор оказания услуг №1',
    clientNameFieldLabel: 'Клиент',
    clientNameFieldPlaceholder: 'ТОО «Пример»',
    clientEmailFieldLabel: 'Email клиента',
    clientEmailFieldPlaceholder: 'client@mail.kz',
    fileFieldLabel: 'Файл договора (PDF) *',
    chooseFileButton: 'Выбрать файл',
    fileChosenLabel: (name: string) => `Выбран: ${name}`,
    cancelButton: 'Отмена',
    saveButton: 'Загрузить',
    savingLabel: 'Загружаем...',
    titleRequiredAlert: 'Введите название договора',
    fileRequiredAlert: 'Выберите файл договора в формате PDF',
    errorPrefix: (msg: string) => `Ошибка: ${msg}`,
    noContractsHint: 'Нет договоров',
    noContractsSubHint: 'Загрузите договор, чтобы подписать его ЭЦП вместе с клиентом',
    deleteContractConfirm: 'Удалить договор?',
    statusNotSent: 'Не подписан',
    statusAwaitingClient: 'Ожидает подписи клиента',
    statusSigned: 'Подписан обеими сторонами',
    loadingLabel: 'Загрузка...',
    contractNotFoundLabel: 'Договор не найден',
    fromLabel: 'От кого',
    clientLabel: 'Клиент',
    noClientLabel: 'Клиент не указан',
    createdLabel: (date: string) => `Загружен: ${date}`,
    viewFileButton: 'Открыть файл',
    deleteButton: 'Удалить договор',
    publicIntro: 'Вам направлен договор на подписание электронной цифровой подписью (ЭЦП). Ознакомьтесь с документом и подпишите его через приложение eGov mobile.',
    publicViewFileButton: 'Открыть договор',
    ecpSectionLabel: 'Электронная подпись (ЭЦП)',
    proBadge: 'Про',
    proLockedHint: 'Доступно на тарифе Про',
    goToPlansButton: 'Перейти к тарифам',
  },
  kk: {
    headerLabel: 'Шарттар',
    uploadButton: '+ Жүктеу',
    newContractTitle: 'Жаңа шарт',
    titleFieldLabel: 'Шарттың атауы *',
    titleFieldPlaceholder: 'Қызмет көрсету шарты №1',
    clientNameFieldLabel: 'Клиент',
    clientNameFieldPlaceholder: '«Мысал» ЖШС',
    clientEmailFieldLabel: 'Клиенттің email',
    clientEmailFieldPlaceholder: 'client@mail.kz',
    fileFieldLabel: 'Шарт файлы (PDF) *',
    chooseFileButton: 'Файл таңдау',
    fileChosenLabel: (name: string) => `Таңдалды: ${name}`,
    cancelButton: 'Бас тарту',
    saveButton: 'Жүктеу',
    savingLabel: 'Жүктелуде...',
    titleRequiredAlert: 'Шарттың атауын енгізіңіз',
    fileRequiredAlert: 'PDF форматындағы шарт файлын таңдаңыз',
    errorPrefix: (msg: string) => `Қате: ${msg}`,
    noContractsHint: 'Шарттар жоқ',
    noContractsSubHint: 'Клиентпен бірге ЭЦҚ қою үшін шартты жүктеңіз',
    deleteContractConfirm: 'Шартты жою керек пе?',
    statusNotSent: 'Қол қойылмаған',
    statusAwaitingClient: 'Клиенттің қол қоюын күтуде',
    statusSigned: 'Екі жақ та қол қойды',
    loadingLabel: 'Жүктелуде...',
    contractNotFoundLabel: 'Шарт табылмады',
    fromLabel: 'Кімнен',
    clientLabel: 'Клиент',
    noClientLabel: 'Клиент көрсетілмеген',
    createdLabel: (date: string) => `Жүктелді: ${date}`,
    viewFileButton: 'Файлды ашу',
    deleteButton: 'Шартты жою',
    publicIntro: 'Сізге электрондық цифрлық қолтаңбамен (ЭЦҚ) қол қою үшін шарт жіберілді. Құжатпен танысып, eGov mobile қосымшасы арқылы қол қойыңыз.',
    publicViewFileButton: 'Шартты ашу',
    ecpSectionLabel: 'Электрондық қолтаңба (ЭЦҚ)',
    proBadge: 'Про',
    proLockedHint: 'Про тарифінде қолжетімді',
    goToPlansButton: 'Тарифтерге өту',
  },
  en: {
    headerLabel: 'Contracts',
    uploadButton: '+ Upload',
    newContractTitle: 'New contract',
    titleFieldLabel: 'Contract title *',
    titleFieldPlaceholder: 'Service agreement #1',
    clientNameFieldLabel: 'Client',
    clientNameFieldPlaceholder: 'Example LLP',
    clientEmailFieldLabel: 'Client email',
    clientEmailFieldPlaceholder: 'client@mail.kz',
    fileFieldLabel: 'Contract file (PDF) *',
    chooseFileButton: 'Choose file',
    fileChosenLabel: (name: string) => `Selected: ${name}`,
    cancelButton: 'Cancel',
    saveButton: 'Upload',
    savingLabel: 'Uploading...',
    titleRequiredAlert: 'Enter a contract title',
    fileRequiredAlert: 'Choose a PDF contract file',
    errorPrefix: (msg: string) => `Error: ${msg}`,
    noContractsHint: 'No contracts',
    noContractsSubHint: 'Upload a contract to sign it with ЭЦП together with your client',
    deleteContractConfirm: 'Delete this contract?',
    statusNotSent: 'Not signed',
    statusAwaitingClient: 'Awaiting client signature',
    statusSigned: 'Signed by both parties',
    loadingLabel: 'Loading...',
    contractNotFoundLabel: 'Contract not found',
    fromLabel: 'From',
    clientLabel: 'Client',
    noClientLabel: 'No client specified',
    createdLabel: (date: string) => `Uploaded: ${date}`,
    viewFileButton: 'Open file',
    deleteButton: 'Delete contract',
    publicIntro: 'You have been sent a contract for electronic digital signature (ЭЦП). Review the document and sign it via the eGov mobile app.',
    publicViewFileButton: 'Open contract',
    ecpSectionLabel: 'Electronic signature (ЭЦП)',
    proBadge: 'Pro',
    proLockedHint: 'Available on the Pro plan',
    goToPlansButton: 'View plans',
  },
}
