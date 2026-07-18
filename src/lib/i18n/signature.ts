export interface SignatureContent {
  sectionLabel: string
  signButton: string
  signingLabel: string
  scanQrHint: string
  openInEgovButton: string
  cancelButton: string
  awaitingClientStatus: string
  signedStatus: string
  signedOwnerDatePrefix: (date: string) => string
  signedClientDatePrefix: (date: string) => string
  downloadSignedButton: string
  errorPrefix: (message: string) => string
}

export const signatureDict: Record<'ru' | 'kk' | 'en', SignatureContent> = {
  ru: {
    sectionLabel: 'Электронная подпись (ЭЦП)',
    signButton: 'Подписать ЭЦП',
    signingLabel: 'Ожидаем подпись...',
    scanQrHint: 'Отсканируйте QR-код приложением eGov mobile',
    openInEgovButton: 'Открыть в eGov mobile',
    cancelButton: 'Отмена',
    awaitingClientStatus: 'Ожидает подписи клиента',
    signedStatus: 'Подписано ЭЦП с обеих сторон',
    signedOwnerDatePrefix: (date: string) => `Отправитель подписал: ${date}`,
    signedClientDatePrefix: (date: string) => `Клиент подписал: ${date}`,
    downloadSignedButton: 'Скачать подписанный документ',
    errorPrefix: (message: string) => `Ошибка подписания: ${message}`,
  },
  kk: {
    sectionLabel: 'Электрондық қолтаңба (ЭЦҚ)',
    signButton: 'ЭЦҚ қою',
    signingLabel: 'Қолтаңбаны күтудеміз...',
    scanQrHint: 'QR-кодты eGov mobile қолданбасымен сканерлеңіз',
    openInEgovButton: 'eGov mobile-де ашу',
    cancelButton: 'Бас тарту',
    awaitingClientStatus: 'Клиенттің қолтаңбасын күтуде',
    signedStatus: 'Екі жақ та ЭЦҚ қойды',
    signedOwnerDatePrefix: (date: string) => `Жіберуші қол қойды: ${date}`,
    signedClientDatePrefix: (date: string) => `Клиент қол қойды: ${date}`,
    downloadSignedButton: 'Қол қойылған құжатты жүктеу',
    errorPrefix: (message: string) => `Қол қою қатесі: ${message}`,
  },
  en: {
    sectionLabel: 'Digital signature',
    signButton: 'Sign with digital signature',
    signingLabel: 'Waiting for signature...',
    scanQrHint: 'Scan the QR code with the eGov mobile app',
    openInEgovButton: 'Open in eGov mobile',
    cancelButton: 'Cancel',
    awaitingClientStatus: 'Awaiting client signature',
    signedStatus: 'Signed by both parties',
    signedOwnerDatePrefix: (date: string) => `Sender signed: ${date}`,
    signedClientDatePrefix: (date: string) => `Client signed: ${date}`,
    downloadSignedButton: 'Download signed document',
    errorPrefix: (message: string) => `Signing error: ${message}`,
  },
}
