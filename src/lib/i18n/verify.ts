export interface VerifyContent {
  loadingLabel: string
  pageTitle: string
  intro: string
  documentLabel: (title: string) => string
  codeLabel: string
  signedByLabel: string
  onBehalfOfPrefix: (company: string) => string
  iinPrefix: (iin: string) => string
  ownerSignedPrefix: (date: string) => string
  clientSignedPrefix: (date: string) => string
  downloadDocumentButton: string
  downloadCardButton: string
  notFoundTitle: string
  notFoundBody: string
}

export const verifyDict: Record<'ru' | 'kk' | 'en', VerifyContent> = {
  ru: {
    loadingLabel: 'Загрузка...',
    pageTitle: 'Проверка электронной подписи',
    intro: 'Документ подписан и зарегистрирован в сервисе SIGEX (НУЦ РК). Ниже — подтверждённые данные подписи.',
    documentLabel: (title: string) => title,
    codeLabel: 'Номер карточки в SIGEX:',
    signedByLabel: 'Подписал(а):',
    onBehalfOfPrefix: (company: string) => `от имени ${company}`,
    iinPrefix: (iin: string) => `ИИН ${iin}`,
    ownerSignedPrefix: (date: string) => `Отправитель подписал: ${date}`,
    clientSignedPrefix: (date: string) => `Клиент подписал: ${date}`,
    downloadDocumentButton: 'Скачать документ',
    downloadCardButton: 'Скачать карточку для проверки подписи',
    notFoundTitle: 'Документ не найден',
    notFoundBody: 'Проверьте правильность ссылки или номера карточки.',
  },
  kk: {
    loadingLabel: 'Жүктелуде...',
    pageTitle: 'Электрондық қолтаңбаны тексеру',
    intro: 'Құжат қол қойылған және SIGEX (ҚР ҰКО) сервисінде тіркелген. Төменде — расталған қолтаңба деректері.',
    documentLabel: (title: string) => title,
    codeLabel: 'SIGEX-тегі карточка нөмірі:',
    signedByLabel: 'Қол қойған:',
    onBehalfOfPrefix: (company: string) => `${company} атынан`,
    iinPrefix: (iin: string) => `ЖСН ${iin}`,
    ownerSignedPrefix: (date: string) => `Жіберуші қол қойды: ${date}`,
    clientSignedPrefix: (date: string) => `Клиент қол қойды: ${date}`,
    downloadDocumentButton: 'Құжатты жүктеу',
    downloadCardButton: 'Қолтаңбаны тексеру карточкасын жүктеу',
    notFoundTitle: 'Құжат табылмады',
    notFoundBody: 'Сілтеменің немесе карточка нөмірінің дұрыстығын тексеріңіз.',
  },
  en: {
    loadingLabel: 'Loading...',
    pageTitle: 'Digital signature verification',
    intro: 'This document is signed and registered with the SIGEX (NCA RK) service. Confirmed signature details below.',
    documentLabel: (title: string) => title,
    codeLabel: 'SIGEX card number:',
    signedByLabel: 'Signed by:',
    onBehalfOfPrefix: (company: string) => `on behalf of ${company}`,
    iinPrefix: (iin: string) => `IIN ${iin}`,
    ownerSignedPrefix: (date: string) => `Sender signed: ${date}`,
    clientSignedPrefix: (date: string) => `Client signed: ${date}`,
    downloadDocumentButton: 'Download document',
    downloadCardButton: 'Download signature verification card',
    notFoundTitle: 'Document not found',
    notFoundBody: 'Check the link or card number.',
  },
}
