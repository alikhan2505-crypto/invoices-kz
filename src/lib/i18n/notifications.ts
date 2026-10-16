// Тексты страницы /profile/notifications (ru/kk/en). Каталог событий и их
// каналы — в src/lib/notificationPrefs.ts; здесь только то, что видит
// пользователь. Record<NotificationEventKey, …> — TypeScript не даст
// добавить событие в каталог и забыть подпись.
import type { NotificationEventKey, NotificationGroup } from '@/lib/notificationPrefs'

export type NotificationsLang = 'ru' | 'kk' | 'en'

export interface EventText {
  label: string
  desc: string
  // Что нужно, чтобы событие вообще случалось (тариф, подключение).
  requires?: string
}

export interface NotificationsPageContent {
  headerLabel: string
  savingLabel: string
  savedLabel: string
  loadError: string
  retryButton: string
  saveError: string
  saveMigrationPending: string

  // Telegram
  tgTitle: string
  tgSubtitle: string
  tgStatusConnected: string
  tgStatusNotConnected: string
  tgStep1Title: string
  tgStep1Body: string
  tgOpenBotButton: string
  tgPreparingLink: string
  tgLinkError: string
  tgQrCaption: string
  tgQrAlt: string
  tgStep2Title: string
  tgStep2Body: string
  tgStep3Title: string
  tgStep3Waiting: string
  tgStep3Paused: string
  tgCheckAgainButton: string
  tgStep4Title: string
  tgStep4Locked: string
  tgTestButton: string
  tgTestSending: string
  tgTestSent: string
  tgTestRateLimited: (seconds: number) => string
  tgTestFailed: string
  tgTestError: string
  tgConnectedBody: string
  tgJustConnected: string
  tgDisconnectButton: string
  tgDisconnecting: string
  tgDisconnectError: string
  tgDisconnectConfirm: string
  // До миграции: один общий тумблер Telegram (старая колонка notify_telegram)
  tgMasterLabel: string
  tgMasterDesc: string

  // Владельцу
  ownerSectionTitle: string
  ownerSectionBody: string
  tgLockedHint: string
  migrationPendingHint: string
  channelTelegram: string
  channelEmail: string
  channelBell: string
  channelChat: string
  channelSite: string
  channelSwitchLabel: (event: string, channel: string) => string
  groupTitles: Record<NotificationGroup, string>
  cfoManageLink: string
  bonusInfoLabel: string
  bonusInfoDesc: string
  requiresPrefix: string

  // Клиентам
  clientSectionTitle: string
  clientSectionBody: string
  clientNoAutoReminders: string
  clientAutoTag: string
  clientManualTag: string
}

export const notificationsDict: Record<NotificationsLang, NotificationsPageContent> = {
  ru: {
    headerLabel: 'Уведомления',
    savingLabel: 'Сохраняем…',
    savedLabel: 'Сохранено',
    loadError: 'Не удалось загрузить настройки уведомлений.',
    retryButton: 'Повторить',
    saveError: 'Не удалось сохранить — переключатель вернули как было. Попробуйте ещё раз.',
    saveMigrationPending: 'Этот переключатель пока нельзя сохранить — он заработает после ближайшего обновления. Сейчас всё приходит как раньше.',

    tgTitle: 'Уведомления приходят в Telegram',
    tgSubtitle: 'Главный канал связи с вами: оплаты и просмотры счетов, а ещё — когда клиент просит оператора или ответ ИИ-агента ждёт вашей проверки. Подключение — около минуты.',
    tgStatusConnected: 'Подключено',
    tgStatusNotConnected: 'Не подключено',
    tgStep1Title: 'Откройте бота',
    tgStep1Body: 'Кнопка откроет нашего бота в Telegram в новой вкладке — эта страница останется открытой.',
    tgOpenBotButton: 'Открыть бота в Telegram',
    tgPreparingLink: 'Готовим ссылку…',
    tgLinkError: 'Не удалось подготовить ссылку на бота.',
    tgQrCaption: 'С компьютера: наведите камеру телефона на код',
    tgQrAlt: 'QR-код ссылки на бота invoices.kz в Telegram',
    tgStep2Title: 'Нажмите «Start» в Telegram',
    tgStep2Body: 'Кнопка внизу чата с ботом (может называться «Запустить»). Больше ничего писать не нужно.',
    tgStep3Title: 'Подключение определится само',
    tgStep3Waiting: 'Ждём, когда вы нажмёте «Start»…',
    tgStep3Paused: 'Пока не видим подключения. Если уже нажали «Start» — проверьте ещё раз.',
    tgCheckAgainButton: 'Проверить',
    tgStep4Title: 'Отправьте тестовое сообщение',
    tgStep4Locked: 'Станет доступно после подключения.',
    tgTestButton: 'Отправить тестовое сообщение',
    tgTestSending: 'Отправляем…',
    tgTestSent: 'Отправили — проверьте Telegram.',
    tgTestRateLimited: (s) => `Тестовое сообщение можно отправлять не чаще раза в ${s} секунд.`,
    tgTestFailed: 'Telegram не принял сообщение — возможно, бот заблокирован в чате. Отключите Telegram и подключите заново.',
    tgTestError: 'Не удалось отправить тестовое сообщение. Попробуйте ещё раз.',
    tgConnectedBody: 'Уведомления приходят в чат с ботом invoices.kz. Что именно присылать — выберите ниже.',
    tgJustConnected: 'Готово, бот подключён.',
    tgDisconnectButton: 'Отключить Telegram',
    tgDisconnecting: 'Отключаем…',
    tgDisconnectError: 'Не удалось отключить Telegram. Попробуйте ещё раз.',
    tgDisconnectConfirm: 'Отключить Telegram? Уведомления перестанут приходить в чат, пока вы не подключите бота снова.',
    tgMasterLabel: 'Присылать уведомления в Telegram',
    tgMasterDesc: 'Общий переключатель для всех событий. Выбор по отдельным событиям заработает после ближайшего обновления.',

    ownerSectionTitle: 'Что присылать вам',
    ownerSectionBody: 'Для каждого события — отдельно Telegram и почта. Изменения сохраняются сразу.',
    tgLockedHint: 'Переключатели Telegram заработают, когда вы подключите бота выше.',
    migrationPendingHint: 'Часть переключателей заработает после ближайшего обновления — пока они неактивны, а уведомления по ним приходят как раньше. Telegram целиком можно включить или выключить общим переключателем в блоке Telegram.',
    channelTelegram: 'Telegram',
    channelEmail: 'Почта',
    channelBell: 'В колокольчике',
    channelChat: 'В чате',
    channelSite: 'На сайте',
    channelSwitchLabel: (event, channel) => `${event}: ${channel}`,
    groupTitles: {
      invoices: 'Счета',
      kaspiShop: 'Kaspi Bot',
      aiAgent: 'ИИ-агент',
      salon: 'Салон',
      documents: 'Договоры и ЭЦП',
      acquiring: 'Сверка оплат',
      account: 'Аккаунт и кошелёк',
      cfo: 'CFO',
    },
    cfoManageLink: 'Настроить в CFO',
    bonusInfoLabel: 'Бонус за заполненный профиль',
    requiresPrefix: 'Нужно',
    bonusInfoDesc: 'Всплывающее сообщение «+100 ₸ в кошелёк» сразу после того, как вы сохранили реквизиты, банк или подпись.',

    clientSectionTitle: 'Что получают ваши клиенты',
    clientSectionBody: 'Сообщения, которые уходят вашим покупателям от вашего имени.',
    clientNoAutoReminders: 'Автоматических напоминаний клиентам об оплате нет: платформа сама не пишет вашим клиентам о долге. Напомнить можно, отправив ссылку на счёт ещё раз.',
    clientAutoTag: 'Автоматически',
    clientManualTag: 'Только по вашему действию',
  },
  kk: {
    headerLabel: 'Хабарландырулар',
    savingLabel: 'Сақталуда…',
    savedLabel: 'Сақталды',
    loadError: 'Хабарландыру баптауларын жүктеу мүмкін болмады.',
    retryButton: 'Қайталау',
    saveError: 'Сақтау мүмкін болмады — ауыстырғыш бұрынғы күйіне қайтарылды. Қайталап көріңіз.',
    saveMigrationPending: 'Бұл ауыстырғышты әзірге сақтау мүмкін емес — ол жақын арадағы жаңартудан кейін іске қосылады. Қазір бәрі бұрынғыдай келеді.',

    tgTitle: 'Хабарландырулар Telegram-ға келеді',
    tgSubtitle: 'Сізбен байланыстың негізгі арнасы: төлемдер мен шоттардың ашылуы, сондай-ақ клиент операторды сұрағанда немесе AI-агенттің жауабы сіздің тексеруіңізді күтіп тұрғанда. Қосу шамамен бір минут алады.',
    tgStatusConnected: 'Қосылды',
    tgStatusNotConnected: 'Қосылмаған',
    tgStep1Title: 'Ботты ашыңыз',
    tgStep1Body: 'Батырма біздің ботты Telegram-да жаңа қойындыда ашады — бұл бет ашық қалады.',
    tgOpenBotButton: 'Ботты Telegram-да ашу',
    tgPreparingLink: 'Сілтеме дайындалуда…',
    tgLinkError: 'Ботқа сілтеме дайындау мүмкін болмады.',
    tgQrCaption: 'Компьютерден: телефон камерасын кодқа бағыттаңыз',
    tgQrAlt: 'Telegram-дағы invoices.kz ботына сілтеменің QR-коды',
    tgStep2Title: 'Telegram-да «Start» басыңыз',
    tgStep2Body: 'Бот чатының төменгі жағындағы батырма («Бастау» деп аталуы мүмкін). Басқа ештеңе жазудың қажеті жоқ.',
    tgStep3Title: 'Қосылу өзі анықталады',
    tgStep3Waiting: '«Start» басуыңызды күтудеміз…',
    tgStep3Paused: 'Әзірге қосылу көрінбейді. «Start» басып қойсаңыз — қайта тексеріңіз.',
    tgCheckAgainButton: 'Тексеру',
    tgStep4Title: 'Сынақ хабарлама жіберіңіз',
    tgStep4Locked: 'Қосылғаннан кейін қолжетімді болады.',
    tgTestButton: 'Сынақ хабарлама жіберу',
    tgTestSending: 'Жіберілуде…',
    tgTestSent: 'Жіберілді — Telegram-ды тексеріңіз.',
    tgTestRateLimited: (s) => `Сынақ хабарламаны ${s} секундта бір реттен жиі жіберуге болмайды.`,
    tgTestFailed: 'Telegram хабарламаны қабылдамады — бот чатта бұғатталған болуы мүмкін. Telegram-ды ажыратып, қайта қосыңыз.',
    tgTestError: 'Сынақ хабарламаны жіберу мүмкін болмады. Қайталап көріңіз.',
    tgConnectedBody: 'Хабарландырулар invoices.kz ботымен чатқа келеді. Нақты нені жіберу керегін төменде таңдаңыз.',
    tgJustConnected: 'Дайын, бот қосылды.',
    tgDisconnectButton: 'Telegram-ды ажырату',
    tgDisconnecting: 'Ажыратылуда…',
    tgDisconnectError: 'Telegram-ды ажырату мүмкін болмады. Қайталап көріңіз.',
    tgDisconnectConfirm: 'Telegram-ды ажырату керек пе? Ботты қайта қоспайынша, хабарландырулар чатқа келмейді.',
    tgMasterLabel: 'Хабарландыруларды Telegram-ға жіберу',
    tgMasterDesc: 'Барлық оқиғаға ортақ ауыстырғыш. Әр оқиғаны бөлек таңдау жақын арадағы жаңартудан кейін іске қосылады.',

    ownerSectionTitle: 'Сізге не жіберу керек',
    ownerSectionBody: 'Әр оқиға үшін Telegram мен пошта бөлек. Өзгерістер бірден сақталады.',
    tgLockedHint: 'Telegram ауыстырғыштары жоғарыда ботты қосқанда іске қосылады.',
    migrationPendingHint: 'Кейбір ауыстырғыштар жақын арадағы жаңартудан кейін іске қосылады — әзірге олар белсенді емес, ал хабарландырулар бұрынғыдай келеді. Telegram-ды толығымен Telegram блогындағы ортақ ауыстырғышпен қосуға не өшіруге болады.',
    channelTelegram: 'Telegram',
    channelEmail: 'Пошта',
    channelBell: 'Қоңырауда',
    channelChat: 'Чатта',
    channelSite: 'Сайтта',
    channelSwitchLabel: (event, channel) => `${event}: ${channel}`,
    groupTitles: {
      invoices: 'Шоттар',
      kaspiShop: 'Kaspi Bot',
      aiAgent: 'AI-агент',
      salon: 'Салон',
      documents: 'Шарттар және ЭЦҚ',
      acquiring: 'Төлемдерді салыстыру',
      account: 'Аккаунт және әмиян',
      cfo: 'CFO',
    },
    cfoManageLink: 'CFO-да баптау',
    bonusInfoLabel: 'Толтырылған профиль үшін бонус',
    requiresPrefix: 'Қажет',
    bonusInfoDesc: 'Деректемелерді, банкті немесе қолтаңбаны сақтаған бойда «+100 ₸ әмиянға» деген қалқымалы хабарлама шығады.',

    clientSectionTitle: 'Клиенттеріңіз не алады',
    clientSectionBody: 'Сатып алушыларыңызға сіздің атыңыздан баратын хабарламалар.',
    clientNoAutoReminders: 'Клиенттерге төлем туралы автоматты еске салу жоқ: платформа клиенттеріңізге қарыз туралы өзі жазбайды. Еске салу үшін шот сілтемесін қайта жіберуге болады.',
    clientAutoTag: 'Автоматты',
    clientManualTag: 'Тек сіздің әрекетіңізбен',
  },
  en: {
    headerLabel: 'Notifications',
    savingLabel: 'Saving…',
    savedLabel: 'Saved',
    loadError: 'Could not load your notification settings.',
    retryButton: 'Retry',
    saveError: 'Could not save — the switch was put back. Please try again.',
    saveMigrationPending: 'This switch cannot be saved yet — it starts working with the next update. For now everything arrives as before.',

    tgTitle: 'Notifications arrive in Telegram',
    tgSubtitle: 'Our main way to reach you: payments and invoice views, plus when a customer asks for an operator or an AI agent reply is waiting for your review. Connecting takes about a minute.',
    tgStatusConnected: 'Connected',
    tgStatusNotConnected: 'Not connected',
    tgStep1Title: 'Open the bot',
    tgStep1Body: 'The button opens our Telegram bot in a new tab — this page stays open.',
    tgOpenBotButton: 'Open the bot in Telegram',
    tgPreparingLink: 'Preparing the link…',
    tgLinkError: 'Could not prepare the link to the bot.',
    tgQrCaption: 'On a computer: point your phone camera at the code',
    tgQrAlt: 'QR code with the link to the invoices.kz Telegram bot',
    tgStep2Title: 'Tap “Start” in Telegram',
    tgStep2Body: 'The button at the bottom of the bot chat. You don’t need to type anything.',
    tgStep3Title: 'We detect the connection automatically',
    tgStep3Waiting: 'Waiting for you to tap “Start”…',
    tgStep3Paused: 'No connection yet. If you already tapped “Start”, check again.',
    tgCheckAgainButton: 'Check',
    tgStep4Title: 'Send a test message',
    tgStep4Locked: 'Available once connected.',
    tgTestButton: 'Send a test message',
    tgTestSending: 'Sending…',
    tgTestSent: 'Sent — check Telegram.',
    tgTestRateLimited: (s) => `You can send a test message at most once every ${s} seconds.`,
    tgTestFailed: 'Telegram did not accept the message — the bot may be blocked in the chat. Disconnect Telegram and connect it again.',
    tgTestError: 'Could not send the test message. Please try again.',
    tgConnectedBody: 'Notifications arrive in your chat with the invoices.kz bot. Choose what to receive below.',
    tgJustConnected: 'Done, the bot is connected.',
    tgDisconnectButton: 'Disconnect Telegram',
    tgDisconnecting: 'Disconnecting…',
    tgDisconnectError: 'Could not disconnect Telegram. Please try again.',
    tgDisconnectConfirm: 'Disconnect Telegram? Notifications will stop arriving in the chat until you connect the bot again.',
    tgMasterLabel: 'Send notifications to Telegram',
    tgMasterDesc: 'One switch for all events. Choosing event by event starts working with the next update.',

    ownerSectionTitle: 'What to send you',
    ownerSectionBody: 'Telegram and email are set separately for every event. Changes save instantly.',
    tgLockedHint: 'Telegram switches start working once you connect the bot above.',
    migrationPendingHint: 'Some switches start working with the next update — until then they are inactive and those notifications arrive as before. Telegram as a whole can be switched on or off with the shared switch in the Telegram block.',
    channelTelegram: 'Telegram',
    channelEmail: 'Email',
    channelBell: 'In-app',
    channelChat: 'In chat',
    channelSite: 'On the site',
    channelSwitchLabel: (event, channel) => `${event}: ${channel}`,
    groupTitles: {
      invoices: 'Invoices',
      kaspiShop: 'Kaspi Bot',
      aiAgent: 'AI agent',
      salon: 'Salon',
      documents: 'Contracts and e-signature',
      acquiring: 'Payment matching',
      account: 'Account and wallet',
      cfo: 'CFO',
    },
    cfoManageLink: 'Set up in CFO',
    bonusInfoLabel: 'Bonus for a completed profile',
    requiresPrefix: 'Requires',
    bonusInfoDesc: 'A pop-up “+100 ₸ to your wallet” right after you save your requisites, bank or signature.',

    clientSectionTitle: 'What your customers receive',
    clientSectionBody: 'Messages that go to your buyers on your behalf.',
    clientNoAutoReminders: 'There are no automatic payment reminders to customers: the platform never chases your customers about a debt. To remind them, send the invoice link again.',
    clientAutoTag: 'Automatic',
    clientManualTag: 'Only when you act',
  },
}

type EventTexts = Record<NotificationsLang, EventText>

export const notificationEventTexts: Record<NotificationEventKey, EventTexts> = {
  // ---------- Счета ----------
  invoice_viewed: {
    ru: { label: 'Клиент открыл счёт', desc: 'Когда клиент впервые открывает ссылку на счёт.' },
    kk: { label: 'Клиент шотты ашты', desc: 'Клиент шот сілтемесін алғаш ашқанда.' },
    en: { label: 'Customer opened the invoice', desc: 'When the customer opens the invoice link for the first time.' },
  },
  invoice_marked_paid: {
    ru: { label: 'Клиент нажал «Я оплатил»', desc: 'Клиент сам отметил счёт оплаченным. Это его слово — проверьте поступление денег.' },
    kk: { label: 'Клиент «Мен төледім» басты', desc: 'Клиент шотты өзі төленді деп белгіледі. Бұл — оның сөзі, ақшаның түскенін тексеріңіз.' },
    en: { label: 'Customer tapped “I paid”', desc: 'The customer marked the invoice as paid themselves. That is their word — check that the money arrived.' },
  },
  invoice_paid_kaspi: {
    ru: { label: 'Счёт оплачен через Kaspi Pay', desc: 'Kaspi подтвердил оплату — счёт сам стал «Оплачен».', requires: 'подключённая касса Kaspi Pay' },
    kk: { label: 'Шот Kaspi Pay арқылы төленді', desc: 'Kaspi төлемді растады — шот өзі «Төленді» күйіне өтті.', requires: 'қосылған Kaspi Pay кассасы' },
    en: { label: 'Invoice paid via Kaspi Pay', desc: 'Kaspi confirmed the payment — the invoice switched to “Paid” on its own.', requires: 'a connected Kaspi Pay till' },
  },
  invoice_due_tomorrow: {
    ru: { label: 'Завтра срок оплаты', desc: 'Вам, за день до срока, если счёт ещё не оплачен (для счетов без срока — на 3-й день после отправки). Клиенту ничего не уходит.' },
    kk: { label: 'Ертең төлем мерзімі', desc: 'Сізге, мерзімнен бір күн бұрын, шот әлі төленбесе (мерзімсіз шоттар үшін — жіберілгеннен кейінгі 3-күні). Клиентке ештеңе жіберілмейді.' },
    en: { label: 'Payment due tomorrow', desc: 'To you, a day before the due date if the invoice is still unpaid (invoices without a due date: on day 3 after sending). Nothing goes to the customer.' },
  },
  invoice_overdue: {
    ru: { label: 'Счёт просрочен', desc: 'Срок оплаты прошёл больше суток назад, а оплаты нет (для счетов без срока — через 7 дней после создания). Счёт помечается «Просрочен».' },
    kk: { label: 'Шоттың мерзімі өтті', desc: 'Төлем мерзімі өткеніне бір тәуліктен асты, ал төлем жоқ (мерзімсіз шоттар үшін — құрылғаннан кейін 7 күн өткенде). Шот «Мерзімі өтті» деп белгіленеді.' },
    en: { label: 'Invoice overdue', desc: 'The due date passed more than a day ago and there is no payment (invoices without a due date: 7 days after creation). The invoice is marked “Overdue”.' },
  },
  invoices_unpaid_summary: {
    ru: { label: 'Сколько счетов ждут оплаты', desc: 'Раз в день: «Неоплаченных счетов: N».' },
    kk: { label: 'Қанша шот төлемді күтіп тұр', desc: 'Күніне бір рет: «Төленбеген шоттар: N».' },
    en: { label: 'How many invoices await payment', desc: 'Once a day: “Unpaid invoices: N”.' },
  },
  weekly_report: {
    ru: { label: 'Отчёт за неделю', desc: 'По понедельникам: сколько счетов создано, оплачено и ждёт оплаты за 7 дней. Если счетов за неделю не было, не приходит.' },
    kk: { label: 'Апталық есеп', desc: 'Дүйсенбі сайын: 7 күнде қанша шот құрылды, төленді және төлемді күтіп тұр. Аптада шот болмаса, келмейді.' },
    en: { label: 'Weekly report', desc: 'Every Monday: invoices created, paid and awaiting payment over 7 days. Not sent if there were no invoices that week.' },
  },
  // ---------- Документы и сверка ----------
  document_signed: {
    ru: { label: 'Клиент подписал документ ЭЦП', desc: 'Клиент поставил свою подпись — документ подписан обеими сторонами.', requires: 'тариф Про' },
    kk: { label: 'Клиент құжатқа ЭЦҚ қойды', desc: 'Клиент өз қолтаңбасын қойды — құжатқа екі тарап та қол қойды.', requires: 'Про тарифі' },
    en: { label: 'Customer e-signed a document', desc: 'The customer added their signature — the document is signed by both sides.', requires: 'Pro plan' },
  },
  bcc_matches_found: {
    ru: { label: 'Найдены возможные оплаты (BCC)', desc: 'В выписке BCC нашлись поступления, похожие на оплату ваших счетов, — их нужно подтвердить.', requires: 'тариф Про и подключённый счёт BCC' },
    kk: { label: 'Ықтимал төлемдер табылды (BCC)', desc: 'BCC үзінді көшірмесінен шоттарыңыздың төлеміне ұқсас түсімдер табылды — оларды растау керек.', requires: 'Про тарифі және қосылған BCC шоты' },
    en: { label: 'Possible payments found (BCC)', desc: 'Your BCC statement has incoming payments that look like payments for your invoices — please confirm them.', requires: 'Pro plan and a connected BCC account' },
  },
  // ---------- Kaspi Bot ----------
  kaspi_daily_digest: {
    ru: { label: 'Дневная сводка Kaspi Bot', desc: 'Раз в день: изменения цен, заказы витрины, расход и низкий баланс кошелька. В тихий день не приходит.', requires: 'тариф Про' },
    kk: { label: 'Kaspi Bot күнделікті шолуы', desc: 'Күніне бір рет: баға өзгерістері, витрина тапсырыстары, шығын және әмиянның төмен балансы. Тыныш күні келмейді.', requires: 'Про тарифі' },
    en: { label: 'Kaspi Bot daily summary', desc: 'Once a day: price changes, storefront orders, spending and a low wallet balance. Skipped on a quiet day.', requires: 'Pro plan' },
  },
  kaspi_floor_price: {
    ru: { label: 'Цена упёрлась в минимум', desc: 'Конкурент дешевле, а снижать ниже вашего минимума нельзя. Не чаще раза в сутки на товар.', requires: 'тариф Про' },
    kk: { label: 'Баға ең төменгі шекке жетті', desc: 'Бәсекелес арзанырақ, ал сіздің ең төменгі бағаңыздан түсіруге болмайды. Бір тауарға тәулігіне бір реттен жиі емес.', requires: 'Про тарифі' },
    en: { label: 'Price hit your minimum', desc: 'A competitor is cheaper, but the price can’t go below your minimum. At most once a day per product.', requires: 'Pro plan' },
  },
  // ---------- ИИ-агент ----------
  ai_operator_requested: {
    ru: { label: 'Клиент попросил оператора', desc: 'Клиент хочет говорить с человеком — агент замолчал в этом диалоге.' },
    kk: { label: 'Клиент операторды сұрады', desc: 'Клиент адаммен сөйлескісі келеді — агент бұл диалогта үнсіз қалды.' },
    en: { label: 'Customer asked for a person', desc: 'The customer wants to talk to a human — the agent went quiet in this conversation.' },
  },
  ai_review_draft: {
    ru: { label: 'Новый ответ ждёт проверки', desc: 'Агент в режиме обучения подготовил ответ клиенту — он уйдёт после вашего одобрения.' },
    kk: { label: 'Жаңа жауап тексеруді күтіп тұр', desc: 'Оқу режиміндегі агент клиентке жауап дайындады — ол сіз мақұлдағаннан кейін кетеді.' },
    en: { label: 'A new reply awaits review', desc: 'The agent in training mode drafted a reply — it goes out once you approve it.' },
  },
  ai_invoice_draft: {
    ru: { label: 'Черновик счёта ждёт подтверждения', desc: 'Агент подготовил счёт для клиента — он уйдёт после вашего подтверждения.' },
    kk: { label: 'Шот жобасы растауды күтіп тұр', desc: 'Агент клиентке шот дайындады — ол сіз растағаннан кейін кетеді.' },
    en: { label: 'Invoice draft awaits confirmation', desc: 'The agent prepared an invoice for a customer — it goes out once you confirm it.' },
  },
  ai_wallet_empty: {
    ru: { label: 'Кошелёк агента пуст', desc: 'Баланса не хватает на ответы ИИ — клиенты получают заготовку. Не чаще раза в сутки.' },
    kk: { label: 'Агент әмияны бос', desc: 'Баланс ЖИ жауаптарына жетпейді — клиенттер дайын үлгі алады. Тәулігіне бір реттен жиі емес.' },
    en: { label: 'Agent wallet is empty', desc: 'The balance can’t cover AI replies — customers get a canned message. At most once a day.' },
  },
  ai_training_exit: {
    ru: { label: 'Агент вышел из обучения', desc: 'Ответы больше не ждут вашей проверки и сразу уходят клиентам.' },
    kk: { label: 'Агент оқу режимінен шықты', desc: 'Жауаптар енді сіздің тексеруіңізді күтпейді, клиенттерге бірден кетеді.' },
    en: { label: 'Agent finished training', desc: 'Replies no longer wait for your review and go straight to customers.' },
  },
  ai_pro_lapsed: {
    ru: { label: 'Клиенты пишут, а агент молчит', desc: 'Тариф Про закончился: сообщения клиентов сохраняются, но агент не отвечает. Не чаще раза в сутки.' },
    kk: { label: 'Клиенттер жазады, агент үнсіз', desc: 'Про тарифі аяқталды: клиенттердің хабарламалары сақталады, бірақ агент жауап бермейді. Тәулігіне бір реттен жиі емес.' },
    en: { label: 'Customers write, the agent is silent', desc: 'Your Pro plan ended: customer messages are saved, but the agent doesn’t reply. At most once a day.' },
  },
  // ---------- Салон ----------
  salon_booking_pending: {
    ru: { label: 'Новая запись ждёт подтверждения', desc: 'Клиент записался через агента — подтвердите запись в планировщике.', requires: 'сайт салона с ИИ-агентом' },
    kk: { label: 'Жаңа жазылу растауды күтіп тұр', desc: 'Клиент агент арқылы жазылды — жазылуды жоспарлағышта растаңыз.', requires: 'AI-агенті бар салон сайты' },
    en: { label: 'A new booking awaits confirmation', desc: 'A customer booked through the agent — confirm it in the planner.', requires: 'a salon site with the AI agent' },
  },
  // ---------- Настраивается отдельно ----------
  cfo_morning_digest: {
    ru: { label: 'Утренняя сводка CFO', desc: 'Деньги на счетах и платежи на сегодня. Включается в настройках CFO.' },
    kk: { label: 'CFO таңғы шолуы', desc: 'Шоттардағы ақша және бүгінгі төлемдер. CFO баптауларында қосылады.' },
    en: { label: 'CFO morning summary', desc: 'Money in your accounts and today’s payments. Turned on in the CFO settings.' },
  },
  welcome_series: {
    ru: { label: 'Письма с советами после регистрации', desc: 'Несколько писем в первую неделю: бонусы за профиль, обзор сервисов, приёмы работы.' },
    kk: { label: 'Тіркелгеннен кейінгі кеңес хаттары', desc: 'Алғашқы аптада бірнеше хат: профиль үшін бонустар, қызметтерге шолу, жұмыс тәсілдері.' },
    en: { label: 'Tips emails after sign-up', desc: 'A few emails in your first week: profile bonuses, a tour of the services, handy tricks.' },
  },
  // ---------- Что получают клиенты продавца ----------
  client_invoice_email: {
    ru: { label: 'Письмо со счётом', desc: 'Уходит, только когда вы сами нажимаете «Отправить» на счёте.' },
    kk: { label: 'Шоты бар хат', desc: 'Тек шоттағы «Жіберу» батырмасын өзіңіз басқанда кетеді.' },
    en: { label: 'Invoice email', desc: 'Sent only when you press “Send” on the invoice yourself.' },
  },
  client_recurring_invoice: {
    ru: { label: 'Повторяющийся счёт раз в месяц', desc: '1-го числа, если вы включили повтор у счёта. Выключается в самом счёте.' },
    kk: { label: 'Айына бір рет қайталанатын шот', desc: 'Айдың 1-күні, егер шотта қайталауды қоссаңыз. Шоттың өзінде өшіріледі.' },
    en: { label: 'Monthly recurring invoice', desc: 'On the 1st, if you turned on repeating for that invoice. Turned off in the invoice itself.' },
  },
  client_wholesale_invoice: {
    ru: { label: 'Счёт оптовому покупателю витрины', desc: 'Покупатель сам оформил оптовый заказ на вашей витрине — счёт уходит ему на почту.' },
    kk: { label: 'Витринаның көтерме сатып алушысына шот', desc: 'Сатып алушы витринаңызда көтерме тапсырысты өзі рәсімдеді — шот оның поштасына кетеді.' },
    en: { label: 'Invoice to a storefront wholesale buyer', desc: 'The buyer placed a wholesale order on your storefront — the invoice goes to their email.' },
  },
  client_signature_request: {
    ru: { label: 'Документ ожидает подписи', desc: 'Уходит, когда вы подписали документ ЭЦП и отправили его клиенту на подпись.' },
    kk: { label: 'Құжат қол қоюды күтіп тұр', desc: 'Құжатқа ЭЦҚ қойып, оны клиентке қол қоюға жібергенде кетеді.' },
    en: { label: 'Document awaiting signature', desc: 'Sent when you e-signed a document and sent it to the customer to sign.' },
  },
  client_payment_chat: {
    ru: { label: 'Подтверждение оплаты в чате', desc: 'Если счёт выставил ИИ-агент: после оплаты через Kaspi или нажатия «Я оплатил» клиент получает ответ в том же чате.' },
    kk: { label: 'Чаттағы төлем растауы', desc: 'Шотты AI-агент шығарса: Kaspi арқылы төлегеннен немесе «Мен төледім» басқаннан кейін клиент сол чатта жауап алады.' },
    en: { label: 'Payment confirmation in chat', desc: 'If the AI agent issued the invoice: after paying via Kaspi or tapping “I paid”, the customer gets a reply in the same chat.' },
  },
}
