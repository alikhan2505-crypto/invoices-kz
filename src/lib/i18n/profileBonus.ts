import type { BinValidationError, IikValidationError } from '@/lib/kzIdentifiers'
import type { BonusIneligibleReason, ProfileBonusBlock } from '@/lib/profileBonus'

// Бонус за заполненный профиль, проверка БИН/ИИН и ИИК на вводе, оплата
// тарифа с кошелька на /upgrade.
export interface ProfileBonusContent {
  // проверка на вводе
  binErrors: Record<BinValidationError, string>
  iikErrors: Record<IikValidationError, string>

  // всплывашка после начисления
  bonusToast: (amount: number) => string

  // карточка «Готовность к счёту» на /profile
  cardTitle: string
  cardWalletHint: string
  blockLabels: Record<ProfileBonusBlock, string>
  bonusAmountTag: (amount: number) => string
  claimedLabel: string
  fillLabel: string
  /** Поля заполнены, но бонус ещё не получен — повторить проверку. */
  claimLabel: string
  checkingLabel: string
  allClaimedLabel: string
  reasonTexts: Partial<Record<BonusIneligibleReason, string>>

  // /upgrade — оплата с кошелька
  walletBalanceLine: (balance: string) => string
  payFullyFromWalletButton: (amount: string) => string
  payPartlyFromWalletButton: (wallet: string, kaspi: string) => string
  payOnlyKaspiButton: string
  walletChoiceTitle: string
  walletPayingLabel: string
  walletPaidTitle: string
  fromWalletLabel: string
  viaKaspiLabel: string
  /** Под суммами в окне частичной оплаты: удержание вернётся, если не оплатить. */
  walletHoldNote: (amount: string) => string
  /** Выбор суммы списания с кошелька в окне «Как оплатить». */
  walletAmountLabel: string
  walletAmountInputAria: string
  walletAmountSliderAria: string
  /** Подпись неактивной главной кнопки, пока сумма в «щели» и не подтверждена. */
  walletAmountInvalidButton: string
  /** Быстрая кнопка «списать всё, что можно». */
  walletAmountAll: string
  walletRemainderLine: (kaspi: string) => string
  walletRemainderNone: string
  /** Введена сумма в «щели» у цены: на Kaspi осталось бы меньше минимума. */
  walletGapHint: (max: string, full: string) => string
  /** Кошелёк почти покрывает цену: больше max списать нельзя из-за минимума на Kaspi. */
  walletMinRemainderCapHint: (max: string) => string
  /** Введено больше, чем есть на кошельке. */
  walletCappedHint: (balance: string) => string
  walletErrors: {
    insufficient: string
    changed: string
    busy: string
    unavailable: string
    generic: string
  }
}

export const profileBonusDict: Record<'ru' | 'kk' | 'en', ProfileBonusContent> = {
  ru: {
    binErrors: {
      empty: 'Укажите БИН или ИИН',
      length: 'БИН/ИИН — это ровно 12 цифр',
      chars: 'В БИН/ИИН только цифры',
      checksum: 'Такого БИН/ИИН не бывает — проверьте цифры, похоже на опечатку',
    },
    iikErrors: {
      empty: 'Укажите ИИК',
      prefix: 'ИИК начинается с KZ',
      length: 'ИИК — это KZ и ещё 18 букв и цифр, всего 20 знаков',
      chars: 'В ИИК бывают только латинские буквы и цифры',
      checksum: 'Такого ИИК не бывает — проверьте цифры, похоже на опечатку',
    },
    bonusToast: (amount) => `+${amount} ₸ в кошелёк`,
    cardTitle: 'Готовность к счёту',
    cardWalletHint: 'Кошельком можно оплатить тариф Про и ответы ИИ-агента',
    blockLabels: {
      requisites: 'Реквизиты',
      bank: 'Банковский счёт',
      signature: 'Подпись или печать',
    },
    bonusAmountTag: (amount) => `+${amount} ₸`,
    claimedLabel: '✓ получено',
    fillLabel: 'Заполнить',
    claimLabel: 'Получить',
    checkingLabel: 'Проверяем…',
    allClaimedLabel: 'Все бонусы за профиль получены',
    reasonTexts: {
      bin_invalid: 'БИН/ИИН с опечаткой',
      bin_missing: 'Нет БИН/ИИН',
      company_name_missing: 'Нет названия компании',
      bin_not_in_registry: 'БИН/ИИН не найден в госреестре',
      registry_unavailable: 'Реестр не отвечает — попробуем позже',
      bin_already_rewarded: 'Бонус за этот БИН уже получен',
      bank_missing: 'Нет банковского счёта',
      iik_invalid: 'ИИК с опечаткой',
      bik_missing: 'Не указан БИК',
      signature_missing: 'Нет подписи или печати',
      signature_invalid: 'Не удалось прочитать картинку',
      signature_blank: 'Подпись пустая — нарисуйте заново',
      stamp_blank: 'Печать на фото не видна — сфотографируйте ещё раз',
      image_too_dark: 'Фото слишком тёмное — сфотографируйте печать при хорошем свете на белом листе',
    },
    walletBalanceLine: (balance) => `В кошельке ${balance} ₸`,
    payFullyFromWalletButton: (amount) => `Оплатить с кошелька — ${amount} ₸`,
    payPartlyFromWalletButton: (wallet, kaspi) => `Списать ${wallet} ₸ с кошелька, остальное ${kaspi} ₸ через Kaspi`,
    payOnlyKaspiButton: 'Оплатить только через Kaspi',
    walletChoiceTitle: 'Как оплатить',
    walletPayingLabel: 'Списываем с кошелька…',
    walletPaidTitle: 'Оплачено с кошелька',
    fromWalletLabel: 'С кошелька',
    viaKaspiLabel: 'Через Kaspi',
    walletHoldNote: (amount) => `Если не оплатите, ${amount} ₸ вернутся в кошелёк`,
    walletAmountLabel: 'Сколько списать с кошелька',
    walletAmountInputAria: 'Сумма списания с кошелька, тенге',
    walletAmountSliderAria: 'Сумма списания с кошелька',
    walletAmountInvalidButton: 'Укажите другую сумму',
    walletAmountAll: 'Всё',
    walletRemainderLine: (kaspi) => `Остаток через Kaspi: ${kaspi} ₸`,
    walletRemainderNone: 'Через Kaspi платить не нужно',
    walletGapHint: (max, full) => `На Kaspi должно остаться не меньше 100 ₸. Введите до ${max} ₸ или всю сумму ${full} ₸.`,
    walletMinRemainderCapHint: (max) => `Больше ${max} ₸ списать нельзя: на Kaspi должно остаться не меньше 100 ₸.`,
    walletCappedHint: (balance) => `На кошельке ${balance} ₸, больше списать нельзя.`,
    walletErrors: {
      insufficient: 'В кошельке недостаточно денег. Обновите страницу — покажем, сколько можно списать.',
      changed: 'Баланс кошелька только что изменился. Выберите сумму ещё раз.',
      busy: 'Тариф только что обновился. Попробуйте ещё раз через минуту.',
      unavailable: 'Оплата с кошелька пока недоступна. Оплатите через Kaspi.',
      generic: 'Не получилось оплатить с кошелька. Попробуйте ещё раз.',
    },
  },
  kk: {
    binErrors: {
      empty: 'БСН немесе ЖСН көрсетіңіз',
      length: 'БСН/ЖСН — дәл 12 цифр',
      chars: 'БСН/ЖСН-да тек цифрлар болады',
      checksum: 'Мұндай БСН/ЖСН болмайды — цифрларды тексеріңіз, қате терілген сияқты',
    },
    iikErrors: {
      empty: 'ЖСК көрсетіңіз',
      prefix: 'ЖСК KZ әріптерінен басталады',
      length: 'ЖСК — KZ және тағы 18 әріп пен цифр, барлығы 20 таңба',
      chars: 'ЖСК-да тек латын әріптері мен цифрлар болады',
      checksum: 'Мұндай ЖСК болмайды — цифрларды тексеріңіз, қате терілген сияқты',
    },
    bonusToast: (amount) => `Әмиянға +${amount} ₸`,
    cardTitle: 'Шот жазуға дайындық',
    cardWalletHint: 'Әмиянмен Про тарифін және AI-агенттің жауаптарын төлеуге болады',
    blockLabels: {
      requisites: 'Деректемелер',
      bank: 'Банк шоты',
      signature: 'Қолтаңба немесе мөр',
    },
    bonusAmountTag: (amount) => `+${amount} ₸`,
    claimedLabel: '✓ алынды',
    fillLabel: 'Толтыру',
    claimLabel: 'Алу',
    checkingLabel: 'Тексеріп жатырмыз…',
    allClaimedLabel: 'Профиль үшін барлық бонус алынды',
    reasonTexts: {
      bin_invalid: 'БСН/ЖСН қате терілген',
      bin_missing: 'БСН/ЖСН жоқ',
      company_name_missing: 'Компания атауы жоқ',
      bin_not_in_registry: 'БСН/ЖСН мемлекеттік тізілімнен табылмады',
      registry_unavailable: 'Тізілім жауап бермей тұр — кейінірек тексереміз',
      bin_already_rewarded: 'Бұл БСН үшін бонус бұрын алынған',
      bank_missing: 'Банк шоты жоқ',
      iik_invalid: 'ЖСК қате терілген',
      bik_missing: 'БСК көрсетілмеген',
      signature_missing: 'Қолтаңба да, мөр де жоқ',
      signature_invalid: 'Суретті оқу мүмкін болмады',
      signature_blank: 'Қолтаңба бос — қайта салыңыз',
      stamp_blank: 'Суретте мөр көрінбейді — қайта суретке түсіріңіз',
      image_too_dark: 'Сурет тым қараңғы — мөрді ақ параққа қойып, жарық жерде түсіріңіз',
    },
    walletBalanceLine: (balance) => `Әмиянда ${balance} ₸`,
    payFullyFromWalletButton: (amount) => `Әмиянмен төлеу — ${amount} ₸`,
    payPartlyFromWalletButton: (wallet, kaspi) => `Әмияннан ${wallet} ₸, қалған ${kaspi} ₸ Kaspi арқылы`,
    payOnlyKaspiButton: 'Тек Kaspi арқылы төлеу',
    walletChoiceTitle: 'Қалай төлейсіз',
    walletPayingLabel: 'Әмияннан алып жатырмыз…',
    walletPaidTitle: 'Әмиянмен төленді',
    fromWalletLabel: 'Әмияннан',
    viaKaspiLabel: 'Kaspi арқылы',
    walletHoldNote: (amount) => `Төлемесеңіз, ${amount} ₸ әмиянға қайтады`,
    walletAmountLabel: 'Әмияннан қанша алу керек',
    walletAmountInputAria: 'Әмияннан алынатын сома, теңге',
    walletAmountSliderAria: 'Әмияннан алынатын сома',
    walletAmountInvalidButton: 'Басқа соманы көрсетіңіз',
    walletAmountAll: 'Барлығы',
    walletRemainderLine: (kaspi) => `Kaspi арқылы қалғаны: ${kaspi} ₸`,
    walletRemainderNone: 'Kaspi арқылы төлеудің қажеті жоқ',
    walletGapHint: (max, full) => `Kaspi-де кемінде 100 ₸ қалуы керек. ${max} ₸ дейін немесе бүкіл ${full} ₸ сомасын енгізіңіз.`,
    walletMinRemainderCapHint: (max) => `${max} ₸ сомасынан артық алуға болмайды: Kaspi-де кемінде 100 ₸ қалуы керек.`,
    walletCappedHint: (balance) => `Әмияндағы сома ${balance} ₸, одан артық алуға болмайды.`,
    walletErrors: {
      insufficient: 'Әмиянда ақша жеткіліксіз. Бетті жаңартыңыз — қанша алуға болатынын көрсетеміз.',
      changed: 'Әмиян балансы жаңа ғана өзгерді. Соманы қайта таңдаңыз.',
      busy: 'Тариф жаңа ғана жаңарды. Бір минуттан кейін қайталап көріңіз.',
      unavailable: 'Әмиянмен төлеу әзірге қолжетімсіз. Kaspi арқылы төлеңіз.',
      generic: 'Әмиянмен төлеу сәтсіз аяқталды. Қайталап көріңіз.',
    },
  },
  en: {
    binErrors: {
      empty: 'Enter your BIN or IIN',
      length: 'A BIN/IIN is exactly 12 digits',
      chars: 'A BIN/IIN contains digits only',
      checksum: 'This BIN/IIN can’t exist — please check the digits, it looks like a typo',
    },
    iikErrors: {
      empty: 'Enter your IIK (account number)',
      prefix: 'An IIK starts with KZ',
      length: 'An IIK is KZ plus 18 letters and digits, 20 characters in total',
      chars: 'An IIK contains only Latin letters and digits',
      checksum: 'This IIK can’t exist — please check the digits, it looks like a typo',
    },
    bonusToast: (amount) => `+${amount} ₸ to your wallet`,
    cardTitle: 'Ready to invoice',
    cardWalletHint: 'Use the wallet to pay for the Pro plan and AI agent replies',
    blockLabels: {
      requisites: 'Company details',
      bank: 'Bank account',
      signature: 'Signature or stamp',
    },
    bonusAmountTag: (amount) => `+${amount} ₸`,
    claimedLabel: '✓ received',
    fillLabel: 'Fill in',
    claimLabel: 'Get bonus',
    checkingLabel: 'Checking…',
    allClaimedLabel: 'All profile bonuses received',
    reasonTexts: {
      bin_invalid: 'BIN/IIN has a typo',
      bin_missing: 'No BIN/IIN yet',
      company_name_missing: 'No company name yet',
      bin_not_in_registry: 'BIN/IIN not found in the state registry',
      registry_unavailable: 'The registry isn’t responding — we’ll retry later',
      bin_already_rewarded: 'This BIN has already received the bonus',
      bank_missing: 'No bank account yet',
      iik_invalid: 'IIK has a typo',
      bik_missing: 'BIK is missing',
      signature_missing: 'No signature or stamp yet',
      signature_invalid: 'Couldn’t read the image',
      signature_blank: 'The signature is empty — please draw it again',
      stamp_blank: 'The stamp isn’t visible in the photo — please take it again',
      image_too_dark: 'The photo is too dark — shoot the stamp on white paper in good light',
    },
    walletBalanceLine: (balance) => `Wallet balance: ${balance} ₸`,
    payFullyFromWalletButton: (amount) => `Pay from wallet — ${amount} ₸`,
    payPartlyFromWalletButton: (wallet, kaspi) => `Use ${wallet} ₸ from wallet, pay the remaining ${kaspi} ₸ via Kaspi`,
    payOnlyKaspiButton: 'Pay via Kaspi only',
    walletChoiceTitle: 'How would you like to pay',
    walletPayingLabel: 'Charging your wallet…',
    walletPaidTitle: 'Paid from wallet',
    fromWalletLabel: 'From wallet',
    viaKaspiLabel: 'Via Kaspi',
    walletHoldNote: (amount) => `If you don’t pay, ${amount} ₸ goes back to your wallet`,
    walletAmountLabel: 'How much to take from the wallet',
    walletAmountInputAria: 'Amount to take from the wallet, tenge',
    walletAmountSliderAria: 'Amount to take from the wallet',
    walletAmountInvalidButton: 'Enter a different amount',
    walletAmountAll: 'All',
    walletRemainderLine: (kaspi) => `Remaining via Kaspi: ${kaspi} ₸`,
    walletRemainderNone: 'Nothing to pay via Kaspi',
    walletGapHint: (max, full) => `At least 100 ₸ must be left for Kaspi. Enter up to ${max} ₸ or the full ${full} ₸.`,
    walletMinRemainderCapHint: (max) => `You can’t take more than ${max} ₸: at least 100 ₸ must be left for Kaspi.`,
    walletCappedHint: (balance) => `Your wallet has ${balance} ₸, you can’t take more.`,
    walletErrors: {
      insufficient: 'Not enough money in the wallet. Refresh the page to see how much can be used.',
      changed: 'Your wallet balance just changed. Please choose the amount again.',
      busy: 'Your plan was just updated. Please try again in a minute.',
      unavailable: 'Paying from the wallet isn’t available yet. Please pay via Kaspi.',
      generic: 'Couldn’t pay from the wallet. Please try again.',
    },
  },
}
