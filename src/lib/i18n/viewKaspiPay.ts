// Блок оплаты Kaspi на публичной странице счёта /view/[token]: плательщик открывает ссылку без входа и
// видит её на языке, который выбран в браузере. Раньше эти строки были зашиты по-русски (аудит 02.11.2026,
// раздел 6); подсказки вокруг QR (kaspiQrScanHint и др.) уже живут в history.ts.

export interface ViewKaspiPayContent {
  checking: string
  blockTitle: string
  declined: string
  retryButton: string
  requestSentTo: (phone: string) => string
  confirmInApp: string
  cancelRequest: string
  payButton: string
  qrValidFor: (mmss: string) => string
  refreshingCode: string
  autoConfirm: string
  orDivider: string
  sending: string
  sendRequest: string
  errorInvalidPhone: string
  errorRateLimited: string
  errorAlreadyPaid: string
  errorSendFailed: string
}

export const viewKaspiPayDict: Record<'ru' | 'kk' | 'en', ViewKaspiPayContent> = {
  ru: {
    checking: 'Проверяем возможность оплаты через Kaspi...',
    blockTitle: 'Оплата через Kaspi',
    declined: 'Запрос отклонён в приложении Kaspi',
    retryButton: 'Повторить оплату',
    requestSentTo: (phone) => `Запрос отправлен на ${phone}`,
    confirmInApp: 'Подтвердите оплату в приложении Kaspi — счёт подтвердится автоматически.',
    cancelRequest: 'Отменить запрос',
    payButton: 'Оплатить через Kaspi',
    qrValidFor: (mmss) => `QR действителен ещё ${mmss}`,
    refreshingCode: 'Обновляем код…',
    autoConfirm: 'Счёт подтвердится автоматически сразу после оплаты — обновлять страницу не нужно.',
    orDivider: 'или',
    sending: 'Отправляем…',
    sendRequest: 'Отправить запрос',
    errorInvalidPhone: 'Проверьте номер телефона',
    errorRateLimited: 'Слишком много попыток, попробуйте позже',
    errorAlreadyPaid: 'Счёт уже оплачен',
    errorSendFailed: 'Не удалось отправить запрос, попробуйте ещё раз',
  },
  kk: {
    checking: 'Kaspi арқылы төлеу мүмкіндігін тексеріп жатырмыз...',
    blockTitle: 'Kaspi арқылы төлем',
    declined: 'Сұраныс Kaspi қосымшасында қабылданбады',
    retryButton: 'Төлемді қайталау',
    requestSentTo: (phone) => `Сұраныс ${phone} нөміріне жіберілді`,
    confirmInApp: 'Төлемді Kaspi қосымшасында растаңыз — шот автоматты түрде расталады.',
    cancelRequest: 'Сұранысты болдырмау',
    payButton: 'Kaspi арқылы төлеу',
    qrValidFor: (mmss) => `QR тағы ${mmss} жарамды`,
    refreshingCode: 'Кодты жаңартып жатырмыз…',
    autoConfirm: 'Шот төленгенде автоматты түрде расталады — бетті жаңартудың қажеті жоқ.',
    orDivider: 'немесе',
    sending: 'Жіберіліп жатыр…',
    sendRequest: 'Сұраныс жіберу',
    errorInvalidPhone: 'Телефон нөмірін тексеріңіз',
    errorRateLimited: 'Әрекеттер тым көп, кейінірек қайталап көріңіз',
    errorAlreadyPaid: 'Шот бұрын төленген',
    errorSendFailed: 'Сұранысты жіберу мүмкін болмады, қайталап көріңіз',
  },
  en: {
    checking: 'Checking whether you can pay with Kaspi...',
    blockTitle: 'Pay with Kaspi',
    declined: 'The request was declined in the Kaspi app',
    retryButton: 'Try paying again',
    requestSentTo: (phone) => `Request sent to ${phone}`,
    confirmInApp: 'Confirm the payment in the Kaspi app — the invoice will be marked as paid automatically.',
    cancelRequest: 'Cancel request',
    payButton: 'Pay with Kaspi',
    qrValidFor: (mmss) => `QR is valid for ${mmss} more`,
    refreshingCode: 'Refreshing the code…',
    autoConfirm: 'The invoice is confirmed automatically right after payment — no need to refresh the page.',
    orDivider: 'or',
    sending: 'Sending…',
    sendRequest: 'Send request',
    errorInvalidPhone: 'Check the phone number',
    errorRateLimited: 'Too many attempts, please try again later',
    errorAlreadyPaid: 'This invoice is already paid',
    errorSendFailed: 'Could not send the request, please try again',
  },
}
