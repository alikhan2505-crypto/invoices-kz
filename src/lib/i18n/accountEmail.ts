// Карточка «Добавьте почту» на дашборде для вошедших по WhatsApp (src/components/AddEmailCard.tsx).
// Казахский вычитан основателем 16.11.2026 (поправки внесены). Английский ждёт вычитки.

export interface AccountEmailContent {
  title: string
  hint: string
  emailLabel: string
  sendCode: string
  sending: string
  codeSentTo: (email: string) => string
  codeLabel: string
  confirm: string
  confirming: string
  later: string
  changeEmail: string
  done: string
  errInvalid: string
  errUndeliverable: string
  errRateLimited: string
  errWrongCode: string
  errExpired: string
  errTooMany: string
  errHasData: string
  errOtherHasNumber: string
  errGeneric: string
}

export const accountEmailDict: Record<'ru' | 'kk' | 'en', AccountEmailContent> = {
  ru: {
    title: 'Добавьте почту',
    hint: 'На неё придут счета, чеки и письма о доступе. Если такая почта уже есть в invoices.kz, мы подключим ваш номер к тому аккаунту.',
    emailLabel: 'Почта',
    sendCode: 'Отправить код',
    sending: 'Отправляем…',
    codeSentTo: e => `Код отправлен на ${e}`,
    codeLabel: 'Код из письма',
    confirm: 'Подтвердить',
    confirming: 'Проверяем…',
    later: 'Позже',
    changeEmail: 'Изменить почту',
    done: 'Почта добавлена',
    errInvalid: 'Проверьте адрес: он выглядит неверно.',
    errUndeliverable: 'На этот адрес письма не доходят. Проверьте, нет ли опечатки, или укажите другой.',
    errRateLimited: 'Слишком много попыток. Попробуйте позже.',
    errWrongCode: 'Код не подходит. Проверьте цифры.',
    errExpired: 'Код устарел. Отправьте новый.',
    errTooMany: 'Слишком много неверных попыток. Отправьте новый код.',
    errHasData: 'В этом аккаунте уже есть данные, а такая почта принадлежит другому аккаунту. Напишите нам в поддержку, соединим вручную.',
    errOtherHasNumber: 'К аккаунту с этой почтой уже привязан другой номер WhatsApp. Напишите нам в поддержку.',
    errGeneric: 'Что-то пошло не так. Попробуйте ещё раз.',
  },
  kk: {
    title: 'Поштаңызды қосыңыз',
    hint: 'Оған шоттар, чектер және қолжетімділік туралы хаттар келеді. Мұндай пошта invoices.kz-те бұрыннан бар болса, нөміріңізді сол аккаунтқа қосамыз.',
    emailLabel: 'Пошта',
    sendCode: 'Код жіберу',
    sending: 'Жіберілуде…',
    codeSentTo: e => `Код ${e} мекенжайына жіберілді`,
    codeLabel: 'Хаттағы код',
    confirm: 'Растау',
    confirming: 'Тексерілуде…',
    later: 'Кейінірек',
    changeEmail: 'Поштаны өзгерту',
    done: 'Пошта қосылды',
    errInvalid: 'Мекенжайды тексеріңіз: ол дұрыс емес сияқты.',
    errUndeliverable: 'Бұл мекенжайға хаттар жетпейді. Қате жоқтығын тексеріңіз немесе басқасын көрсетіңіз.',
    errRateLimited: 'Тым көп әрекет жасадыңыз. Кейінірек қайталап көріңіз.',
    errWrongCode: 'Код сәйкес емес. Сандарды тексеріңіз.',
    errExpired: 'Кодтың мерзімі өтті. Жаңасын жіберіңіз.',
    errTooMany: 'Қате кодты енгізу әрекеттері тым көп. Жаңа код жіберіңіз.',
    errHasData: 'Бұл аккаунтта деректер бар, ал бұл пошта басқа аккаунтқа тиесілі. Қолдау қызметіне жазыңыз, біз аккаунттарды қолмен біріктіреміз.',
    errOtherHasNumber: 'Осы поштасы бар аккаунтқа басқа WhatsApp нөмірі байланған. Қолдау қызметіне жазыңыз.',
    errGeneric: 'Бірдеңе дұрыс болмады. Қайталап көріңіз.',
  },
  en: {
    title: 'Add your email',
    hint: 'Invoices, receipts and access emails will go there. If this email already exists in invoices.kz, we will connect your number to that account.',
    emailLabel: 'Email',
    sendCode: 'Send code',
    sending: 'Sending…',
    codeSentTo: e => `Code sent to ${e}`,
    codeLabel: 'Code from the email',
    confirm: 'Confirm',
    confirming: 'Checking…',
    later: 'Later',
    changeEmail: 'Change email',
    done: 'Email added',
    errInvalid: 'Check the address: it looks wrong.',
    errUndeliverable: 'Emails to this address do not arrive. Check for a typo or use another one.',
    errRateLimited: 'Too many attempts. Try again later.',
    errWrongCode: 'That code does not match. Check the digits.',
    errExpired: 'The code expired. Send a new one.',
    errTooMany: 'Too many wrong attempts. Send a new code.',
    errHasData: 'This account already has data and the email belongs to another account. Contact support and we will merge them.',
    errOtherHasNumber: 'The account with this email already has another WhatsApp number linked. Contact support.',
    errGeneric: 'Something went wrong. Try again.',
  },
}
