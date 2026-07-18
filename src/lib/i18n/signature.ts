export interface SignatureContent {
  sectionLabel: string
  signButton: string
  signingLabel: string
  scanQrHint: string
  openInEgovButton: string
  cancelButton: string
  awaitingClientStatus: string
  signedBothStatus: string
  signedOwnerOnlyStatus: string
  signedOwnerDatePrefix: (date: string) => string
  signedClientDatePrefix: (date: string) => string
  downloadDocumentButton: string
  downloadVerificationCardButton: string
  errorPrefix: (message: string) => string
  signedByLabel: string
  onBehalfOfPrefix: (company: string) => string
  iinPrefix: (iin: string) => string
  attestationTitle: string
  attestationDateLabel: string
  attestationVerifyCodeLabel: string
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
    signedBothStatus: 'Подписано ЭЦП с обеих сторон',
    signedOwnerOnlyStatus: 'Подписано ЭЦП отправителем',
    signedOwnerDatePrefix: (date: string) => `Отправитель подписал: ${date}`,
    signedClientDatePrefix: (date: string) => `Клиент подписал: ${date}`,
    downloadDocumentButton: 'Скачать документ',
    downloadVerificationCardButton: 'Скачать карточку для проверки подписи',
    errorPrefix: (message: string) => `Ошибка подписания: ${message}`,
    signedByLabel: 'Подписал(а):',
    onBehalfOfPrefix: (company: string) => `от имени ${company}`,
    iinPrefix: (iin: string) => `ИИН ${iin}`,
    attestationTitle: 'Документ подписан электронной цифровой подписью (ЭЦП)',
    attestationDateLabel: 'Дата подписи:',
    attestationVerifyCodeLabel: 'Код проверки (SIGEX):',
  },
  kk: {
    sectionLabel: 'Электрондық қолтаңба (ЭЦҚ)',
    signButton: 'ЭЦҚ қою',
    signingLabel: 'Қолтаңбаны күтудеміз...',
    scanQrHint: 'QR-кодты eGov mobile қолданбасымен сканерлеңіз',
    openInEgovButton: 'eGov mobile-де ашу',
    cancelButton: 'Бас тарту',
    awaitingClientStatus: 'Клиенттің қолтаңбасын күтуде',
    signedBothStatus: 'Екі жақ та ЭЦҚ қойды',
    signedOwnerOnlyStatus: 'Жіберуші ЭЦҚ қойды',
    signedOwnerDatePrefix: (date: string) => `Жіберуші қол қойды: ${date}`,
    signedClientDatePrefix: (date: string) => `Клиент қол қойды: ${date}`,
    downloadDocumentButton: 'Құжатты жүктеу',
    downloadVerificationCardButton: 'Қолтаңбаны тексеру карточкасын жүктеу',
    errorPrefix: (message: string) => `Қол қою қатесі: ${message}`,
    signedByLabel: 'Қол қойған:',
    onBehalfOfPrefix: (company: string) => `${company} атынан`,
    iinPrefix: (iin: string) => `ЖСН ${iin}`,
    attestationTitle: 'Құжат электрондық цифрлық қолтаңбамен (ЭЦҚ) қол қойылды',
    attestationDateLabel: 'Қол қою күні:',
    attestationVerifyCodeLabel: 'Тексеру коды (SIGEX):',
  },
  en: {
    sectionLabel: 'Digital signature',
    signButton: 'Sign with digital signature',
    signingLabel: 'Waiting for signature...',
    scanQrHint: 'Scan the QR code with the eGov mobile app',
    openInEgovButton: 'Open in eGov mobile',
    cancelButton: 'Cancel',
    awaitingClientStatus: 'Awaiting client signature',
    signedBothStatus: 'Signed by both parties',
    signedOwnerOnlyStatus: 'Signed by sender',
    signedOwnerDatePrefix: (date: string) => `Sender signed: ${date}`,
    signedClientDatePrefix: (date: string) => `Client signed: ${date}`,
    downloadDocumentButton: 'Download document',
    downloadVerificationCardButton: 'Download signature verification card',
    errorPrefix: (message: string) => `Signing error: ${message}`,
    signedByLabel: 'Signed by:',
    onBehalfOfPrefix: (company: string) => `on behalf of ${company}`,
    iinPrefix: (iin: string) => `IIN ${iin}`,
    attestationTitle: 'This document is signed with a digital signature (ЭЦП)',
    attestationDateLabel: 'Signed on:',
    attestationVerifyCodeLabel: 'Verification code (SIGEX):',
  },
}
