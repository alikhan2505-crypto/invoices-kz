// Карточка «WhatsApp» в разделе «Вход и Face ID» (src/components/WhatsAppLinkCard.tsx). kk вычитан основателем 16.11.2026 (поправки внесены), en ждёт вычитки.

export interface WhatsAppLinkContent {
  title: string
  hintUnlinked: string
  hintLinked: (phone: string) => string
  link: string
  linking: string
  codeIntro: string
  openWhatsApp: string
  codeLabel: string
  confirm: string
  confirming: string
  unlink: string
  unlinkConfirm: string
  unlinkDone: string
  linkedDone: string
  errWrongCode: string
  errExpired: string
  errTooMany: string
  errTaken: string
  errAlreadyLinked: string
  errUnavailable: string
  errRateLimited: string
  errGeneric: string
}

export const whatsappLinkDict: Record<'ru' | 'kk' | 'en', WhatsAppLinkContent> = {
  ru: {
    title: 'Вход через WhatsApp',
    hintUnlinked: 'Привяжите номер WhatsApp, и в этот аккаунт можно будет входить одним сообщением, без почты.',
    hintLinked: p => `Номер ${p} привязан. Входить можно через кнопку «Войти через WhatsApp».`,
    link: 'Привязать WhatsApp',
    linking: 'Готовим…',
    codeIntro: 'Откройте WhatsApp и отправьте готовое сообщение. В ответ придёт код: введите его здесь.',
    openWhatsApp: 'Открыть WhatsApp снова',
    codeLabel: 'Код из WhatsApp',
    confirm: 'Подтвердить',
    confirming: 'Проверяем…',
    unlink: 'Отвязать номер',
    unlinkConfirm: 'Отвязать номер WhatsApp от аккаунта? Входить через WhatsApp в этот аккаунт будет нельзя.',
    unlinkDone: 'Номер отвязан.',
    linkedDone: 'Номер привязан.',
    errWrongCode: 'Код не подходит. Проверьте цифры.',
    errExpired: 'Код устарел. Начните привязку заново.',
    errTooMany: 'Слишком много неверных попыток. Начните привязку заново.',
    errTaken: 'Этот номер уже привязан к другому аккаунту. Напишите нам в поддержку.',
    errAlreadyLinked: 'К этому аккаунту уже привязан номер.',
    errUnavailable: 'Вход через WhatsApp сейчас недоступен. Попробуйте позже.',
    errRateLimited: 'Слишком много попыток. Попробуйте позже.',
    errGeneric: 'Что-то пошло не так. Попробуйте ещё раз.',
  },
  kk: {
    title: 'WhatsApp арқылы кіру',
    hintUnlinked: 'WhatsApp нөміріңізді байлаңыз, содан кейін бұл аккаунтқа поштасыз, бір хабарламамен кіре аласыз.',
    hintLinked: p => `${p} нөмірі байланған. «WhatsApp арқылы кіру» батырмасы арқылы кіре аласыз.`,
    link: 'WhatsApp-ты байлау',
    linking: 'Дайындалуда…',
    codeIntro: 'WhatsApp-ты ашып, дайын хабарламаны жіберіңіз. Жауап ретінде код келеді: оны осында енгізіңіз.',
    openWhatsApp: 'WhatsApp-ты қайта ашу',
    codeLabel: 'WhatsApp-тағы код',
    confirm: 'Растау',
    confirming: 'Тексерілуде…',
    unlink: 'Нөмірді ажырату',
    unlinkConfirm: 'WhatsApp нөмірін аккаунттан ажыратасыз ба? Бұл аккаунтқа WhatsApp арқылы кіру мүмкін болмайды.',
    unlinkDone: 'Нөмір ажыратылды.',
    linkedDone: 'Нөмір байланды.',
    errWrongCode: 'Код сәйкес емес. Сандарды тексеріңіз.',
    errExpired: 'Кодтың мерзімі өтті. Байлауды қайта бастаңыз.',
    errTooMany: 'Қате кодты енгізу әрекеттері тым көп. Байлауды қайта бастаңыз.',
    errTaken: 'Бұл нөмір басқа аккаунтқа байланған. Қолдау қызметіне жазыңыз.',
    errAlreadyLinked: 'Бұл аккаунтқа нөмір бұрыннан байланған.',
    errUnavailable: 'WhatsApp арқылы кіру қазір қолжетімсіз. Кейінірек қайталаңыз.',
    errRateLimited: 'Тым көп әрекет жасадыңыз. Кейінірек қайталап көріңіз.',
    errGeneric: 'Бірдеңе дұрыс болмады. Қайталап көріңіз.',
  },
  en: {
    title: 'Sign in with WhatsApp',
    hintUnlinked: 'Link your WhatsApp number and you can sign in to this account with a single message, no email needed.',
    hintLinked: p => `Number ${p} is linked. Use the “Sign in with WhatsApp” button to sign in.`,
    link: 'Link WhatsApp',
    linking: 'Preparing…',
    codeIntro: 'Open WhatsApp and send the prepared message. A code will come back: enter it here.',
    openWhatsApp: 'Open WhatsApp again',
    codeLabel: 'Code from WhatsApp',
    confirm: 'Confirm',
    confirming: 'Checking…',
    unlink: 'Unlink number',
    unlinkConfirm: 'Unlink the WhatsApp number from this account? You will not be able to sign in to it via WhatsApp.',
    unlinkDone: 'Number unlinked.',
    linkedDone: 'Number linked.',
    errWrongCode: 'That code does not match. Check the digits.',
    errExpired: 'The code expired. Start linking again.',
    errTooMany: 'Too many wrong attempts. Start linking again.',
    errTaken: 'This number is already linked to another account. Contact support.',
    errAlreadyLinked: 'A number is already linked to this account.',
    errUnavailable: 'WhatsApp sign-in is unavailable right now. Try again later.',
    errRateLimited: 'Too many attempts. Try again later.',
    errGeneric: 'Something went wrong. Try again.',
  },
}
