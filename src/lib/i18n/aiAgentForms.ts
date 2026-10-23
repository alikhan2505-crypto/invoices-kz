// Strings for the AI-agent settings FORMS: the Settings, Prompting, Control,
// Templates, Flows and Channels tabs, plus the errors and overlays around them.
//
// Split from aiAgent.ts on purpose. That file covers the screens a reviewer or
// a customer actually walks through (agents list, channel cards, review queue)
// and was written first, under time pressure, for Meta's App Review. This one
// is the long tail: option labels, field captions, hints and error toasts.
// Same split as profileCore / profileContent / profileAccounts elsewhere in
// this folder.

export type Lang = 'ru' | 'kk' | 'en'

export interface AiAgentFormsDict {
  // option labels, keyed by the value stored in the database
  toneLabels: Record<string, string>
  goalLabels: Record<string, string>
  collectFieldLabels: Record<string, string>
  currencyLabels: Record<string, string>
  timezoneCity: Record<string, string>

  // Settings tab
  companyNameLabel: string
  toneLabel: string
  businessDescriptionLabel: string
  businessDescriptionPlaceholder: string
  goalLabel: string
  collectFieldsLabel: string
  customFieldPlaceholder: string
  addButton: string
  addOwnButton: string
  timezoneLabel: string
  currencyLabel: string
  customInstructionsLabel: string
  customInstructionsPlaceholder: string
  customInstructionsHint: string
  stopPhrasesLabel: string
  stopPhrasesHint: string
  triggerPlaceholder: string

  // Prompting tab
  connectShopTitle: string
  connectShopText: string
  connectShopCta: string
  promptPreviewTitle: string
  promptPreviewHint: string

  // Control tab
  // Training mode: replies wait for the owner instead of reaching customers.
  trainingTitle: string
  trainingBody: string
  trainingLeft: (approvals: number, days: number) => string
  trainingLeftNoDraft: (approvals: number, days: number) => string
  trainingExitPending: string
  trainingLink: string
  botStatusLabel: string
  botStatusHint: string
  // Тумблер сохраняется сразу (15.10.2026); до создания агента -- вместе с ним.
  botStatusSaved: string
  botStatusOnCreateHint: string
  errBotStatus: string
  testChatNoteTemplate: string
  testChatNoteFlow: string
  testChatNoteStopPhrase: string
  testChatNoteBudgetDepleted: string
  historyDepthLabel: string
  historyOption: (n: number) => string
  historyDepthHint: string
  kaspiShopLabel: string
  kaspiShopDefaultOption: string
  kaspiShopMissingOption: string
  kaspiShopActiveSuffix: string
  kaspiShopHint: string
  kaspiShopHintOff: string
  kaspiShopOffOption: string
  kaspiShopOffNote: string
  replyCostTitle: string
  replyCostText: (price: number) => string
  // Split rather than interpolated because the two numbers are bolded inline.
  walletBalanceLabel: string
  walletEnoughFor: string
  walletRepliesSuffix: string
  walletSharedHint: string

  // Templates tab
  templatesHint: string
  templatesEmpty: string
  triggerWordsLabel: string
  // Which surface a template answers on. Only Instagram has two.
  templateChannelLabel: string
  templateChannelAll: string
  templateChannelHint: string
  replyTextLabel: string
  replyTextPlaceholder: string
  addTemplateButton: string
  editTemplateAria: string
  deleteTemplateAria: string
  saveButton: string
  savingButton: string
  cancelButton: string

  // channel extras
  telegramExpiredHint: string
  telegramSetupHint: string
  telegramTokenPlaceholder: string
  whatsappExpiredHint: string
  websiteEmbedHint: string
  copyCodeButton: string
  copiedLabel: string
  apiKeyOnceHint: string
  copyKeyButton: string
  apiUsageSend: string
  apiUsageWithHeader: string
  apiKeyWord: string
  apiUsageReceive: string
  channelTelegramName: string
  channelWebsiteName: string
  openingWhatsapp: string
  connectExistingAppButton: string
  connectExistingAppHint: string
  connectNewNumberButton: string
  connectNewNumberHint: string
  testChatAgentFallback: string
  regenerateKeyButton: string
  connectingButton: string
  connectedChip: string

  // gates, overlays, test chat
  needsAgentTemplates: string
  needsAgentFlows: string
  needsAgentChannels: string
  noAgentSelected: string
  toAgentsList: string
  goToSettings: string
  createAgentButton: string
  saveAgentButton: string
  savingAgentButton: string
  testChatTitle: string
  testChatDisabledHint: string
  // TestChatPanel (B12, 16.10.2026): поле ввода, ошибка, рестарт, пустое состояние
  testChatTyping: string
  testChatSendError: string
  testChatPlaceholder: string
  testChatInputAria: string
  testChatSendAria: string
  testChatRestart: string
  testChatRestartText: string
  testChatRestartConfirm: string
  testChatEmptyTitle: string
  testChatEmptyText: string
  closeAria: string
  tabsAria: string
  defaultAgentName: string
  defaultBusinessName: string
  // После создания агента страница сама открывает «Каналы» с этой строкой.
  connectChannelHint: string
  saveSuccess: string

  // errors
  errConnectInstagram: string
  errDisconnectInstagram: string
  errConnectTelegramToken: string
  errConnectTelegram: string
  errDisconnectTelegram: string
  errConnectWebsite: string
  errDisconnectWebsite: string
  errConnectApi: string
  errDisconnectApi: string
  errDisconnectWhatsapp: string
  errSaveTemplate: string
  errSaveChanges: string
  errSaveNameRequired: string
  errSaveKaspiShop: string
  errSaveKaspiMigration: string
  errSaveForbidden: string
  errSaveNotFound: string
  errDeleteTemplate: string
  // deployment and Meta-dialog diagnostics -- these say plainly which side
  // failed, because a silent Embedded Signup close is otherwise unreadable
  errWaSdkLoading: string
  errWaNotConfigured: (missing: string) => string
  errWaEnvJoiner: string
  errWaWindowClosed: string
  errWaInterrupted: (step: string) => string
  errWaPhoneData: string
  errWaConnectDetail: (detail: string) => string
  errWaConnect: string
  errIgNotConfigured: string
  errIgOpen: (detail: string) => string
  errNetworkUnavailable: string
  errMetaRejected: (message: string, step: string) => string
  errMetaRejectedNoReason: string
  loadingLabel: string
  confirmDisconnectInstagram: string
  confirmDisconnectWhatsapp: string
  confirmDeleteTemplate: string
}

export const aiAgentFormsDict: Record<Lang, AiAgentFormsDict> = {
  ru: {
    toneLabels: {
      friendly: 'Дружелюбный и тёплый',
      professional: 'Профессиональный и деловой',
      energetic: 'Мотивирующий и энергичный',
      caring: 'Заботливый и внимательный',
    },
    goalLabels: {
      answer_questions: 'Отвечать на вопросы',
      qualify_lead: 'Квалифицировать заявку',
      book_appointment: 'Записать на консультацию/приём',
    },
    collectFieldLabels: {
      name: 'Имя клиента', phone: 'Номер телефона', booking: 'Бронирование',
      consultation: 'Запись на консультацию', address: 'Адрес', purpose: 'Цель обращения',
      budget: 'Бюджет', timeline: 'Желаемые сроки', people_count: 'Количество человек',
      city: 'Город', preferences: 'Предпочтения', past_experience: 'Прошлый опыт клиента',
    },
    currencyLabels: { KZT: 'Тенге (₸)', USD: 'Доллар США ($)', EUR: 'Евро (€)', RUB: 'Рубль (₽)' },
    timezoneCity: {
      'Asia/Almaty': 'Алматы, Астана', 'Asia/Aqtobe': 'Актобе', 'Asia/Atyrau': 'Атырау',
      'Asia/Oral': 'Уральск', 'Asia/Aqtau': 'Актау',
    },

    companyNameLabel: 'Название компании',
    toneLabel: 'Формат общения',
    businessDescriptionLabel: 'О бизнесе',
    businessDescriptionPlaceholder: 'Опишите подробнее что вы продаёте и как работаете',
    goalLabel: 'Основная цель',
    collectFieldsLabel: 'Какие данные агент должен собрать у клиента',
    customFieldPlaceholder: 'Например: размер обуви',
    addButton: 'Добавить',
    addOwnButton: '✨ Добавить своё',
    timezoneLabel: 'Часовой пояс',
    currencyLabel: 'Валюта',
    customInstructionsLabel: 'Дополнительные инструкции (необязательно)',
    customInstructionsPlaceholder: 'Например: не обещай скидки; доставка только по Алматы; рабочие часы 9:00–18:00',
    customInstructionsHint: 'Агент будет следовать этим правилам в каждом ответе.',
    stopPhrasesLabel: 'Стоп-фразы (передают диалог вам)',
    stopPhrasesHint: 'Если клиент напишет одну из этих фраз, агент замолчит в этом диалоге и пришлёт вам уведомление (и в Telegram, если он подключён в Профиле → Уведомления) — отвечайте в «Диалогах».',
    triggerPlaceholder: 'Триггер — запятая или Enter (например: цена, стоимость)',

    connectShopTitle: 'Подключите Kaspi Shop — агент будет знать реальные цены',
    connectShopText: 'Сейчас агент отвечает про цены только из описания бизнеса выше — без магазина он не знает точный каталог и может ошибиться. С подключённым Kaspi Shop он сам подтягивает актуальные цены (до 50 товаров) и не выдумывает то, чего нет в каталоге — это же касается сумм в счетах, которые агент выставляет из переписки.',
    connectShopCta: 'Подключить Kaspi Shop →',
    promptPreviewTitle: 'Как агент видит инструкции',
    promptPreviewHint: 'Примерный вид инструкций агента — собирается из полей выше; в реальном ответе к этой строке добавляется системный текст.',

    trainingTitle: 'Агент на обучении — клиенты пока не видят его ответов',
    trainingBody: 'Каждый ответ ждёт вашего одобрения в разделе «На проверку» и не уходит клиенту, пока вы его не отправите. Это защита: агент учится на ваших правках. Но если не заглядывать в очередь, клиент не получит ничего.',
    trainingLeft: (a, d) => `До самостоятельной работы: ${a} одобрений или ${d} дней.`,
    trainingLeftNoDraft: (a, d) => `До самостоятельной работы: ${a} одобрений или ${d} дней с первого черновика — черновиков пока не было, отсчёт дней не начался.`,
    trainingExitPending: 'Срок обучения прошёл: со следующего сообщения клиента агент начнёт отвечать сам, а вы получите уведомление.',
    trainingLink: 'Открыть «На проверку» →',
    botStatusLabel: 'Статус бота',
    botStatusHint: 'Выключенный агент не отвечает клиентам.',
    botStatusSaved: 'Сохранено',
    botStatusOnCreateHint: 'Применится, когда вы создадите агента.',
    errBotStatus: 'Не удалось изменить статус бота. Попробуйте ещё раз.',
    testChatNoteTemplate: 'Шаблон — бесплатно',
    testChatNoteFlow: 'Сценарий — бесплатно',
    testChatNoteStopPhrase: 'Стоп-фраза — в живом канале диалог перешёл бы к вам',
    testChatNoteBudgetDepleted: 'Кошелёк пуст — так сейчас отвечает живой канал. Пополните баланс, чтобы ответил ИИ',
    historyDepthLabel: 'Глубина памяти диалога',
    historyOption: (n) => `Последние ${n} обменов`,
    historyDepthHint: 'Сколько прошлых сообщений агент помнит. Больше — точнее контекст, но дороже каждый ответ.',
    kaspiShopLabel: 'Магазин Kaspi для цен и товаров',
    kaspiShopDefaultOption: 'Активный магазин аккаунта (по умолчанию)',
    kaspiShopMissingOption: 'Магазин удалён — выберите другой',
    kaspiShopActiveSuffix: ' — сейчас активный',
    kaspiShopHint: 'Откуда агент берёт названия товаров, цены, доставку и ссылки на магазин. По умолчанию он следует за магазином, переключённым в разделе Kaspi Bot — и тогда все агенты аккаунта отвечают по одному и тому же.',
    kaspiShopHintOff: 'Если агент не про товары (например, про ваш сервис), выберите «Не использовать магазин Kaspi».',
    kaspiShopOffOption: 'Не использовать магазин Kaspi (агент не называет товары и цены)',
    kaspiShopOffNote: 'Магазин не используется: агент не называет товары, цены, доставку и не присылает ссылки на магазин.',
    replyCostTitle: 'Стоимость ИИ-ответов',
    replyCostText: (p) => `Ответ по совпадению с шаблоном — бесплатно. Ответ, который сгенерировал ИИ — ${p} ₸.`,
    walletBalanceLabel: 'Баланс кошелька:',
    walletEnoughFor: '— хватит примерно на',
    walletRepliesSuffix: 'ИИ-ответов.',
    walletSharedHint: 'Кошелёк общий для Счетов, Kaspi Bot и AI-агента — пополнить можно значком кошелька в правом верхнем углу.',

    templatesHint: 'Шаблоны отвечают мгновенно и бесплатно — если сообщение клиента содержит триггер, ИИ не вызывается. Короткие слова (до 3 букв) срабатывают только в начале слова.',
    templatesEmpty: 'Шаблонов пока нет. Они создаются автоматически, когда вы одобряете ответы в разделе «На проверку», — и их можно добавить вручную.',
    triggerWordsLabel: 'Триггерные слова',
    templateChannelLabel: 'Где отвечать',
    templateChannelAll: 'Везде',
    templateChannelHint: 'Под постом ответ видят все, поэтому там он должен быть коротким и уводить в личные сообщения. В Директе можно отвечать подробно.',
    replyTextLabel: 'Текст ответа',
    replyTextPlaceholder: 'Ответ, который клиент получит мгновенно',
    addTemplateButton: '+ Добавить шаблон',
    editTemplateAria: 'Редактировать шаблон',
    deleteTemplateAria: 'Удалить шаблон',
    saveButton: 'Сохранить',
    savingButton: 'Сохраняем…',
    cancelButton: 'Отмена',

    telegramExpiredHint: 'Telegram-бот отключился — вставьте токен ещё раз, чтобы агент снова отвечал',
    telegramSetupHint: 'Создайте бота через @BotFather и вставьте токен — агент начнёт отвечать на сообщения в этом боте',
    telegramTokenPlaceholder: '123456789:AAH3xk…',
    whatsappExpiredHint: 'WhatsApp отключился — переподключите номер, чтобы агент снова отвечал',
    websiteEmbedHint: 'Вставьте перед </body> на вашем сайте:',
    copyCodeButton: 'Скопировать код',
    copiedLabel: 'Скопировано ✓',
    apiKeyOnceHint: 'Сохраните ключ сейчас — второй раз мы его не покажем:',
    copyKeyButton: 'Скопировать ключ',
    apiUsageSend: 'Отправляйте сообщения клиента:',
    apiUsageWithHeader: 'с заголовком',
    apiKeyWord: '<ключ>',
    apiUsageReceive: 'Получайте ответы агента:',
    channelTelegramName: 'Telegram-бот',
    channelWebsiteName: 'Чат для сайта',
    openingWhatsapp: 'Открываем WhatsApp…',
    connectExistingAppButton: 'У меня уже есть WhatsApp Business на телефоне',
    connectExistingAppHint: 'Подключится по QR-коду, приложение на телефоне продолжит работать, а ваши ответы с телефона будут видны в «Диалогах».',
    connectNewNumberButton: 'Подключить новый номер (по SMS)',
    connectNewNumberHint: 'Для номера, которого нет в приложении WhatsApp.',
    testChatAgentFallback: 'Ваш агент',
    regenerateKeyButton: 'Перегенерировать ключ',
    connectingButton: 'Подключаем…',
    connectedChip: 'Подключено',

    needsAgentTemplates: 'Шаблоны появятся после создания агента.',
    needsAgentFlows: 'Сценарии появятся после создания агента.',
    needsAgentChannels: 'Каналы можно подключить после создания агента.',
    noAgentSelected: 'Не указан агент — выберите его в списке «Агенты»',
    toAgentsList: 'К списку агентов',
    goToSettings: 'Перейти к настройкам',
    createAgentButton: 'Создать агента',
    saveAgentButton: 'Сохранить',
    savingAgentButton: 'Сохраняем…',
    testChatTitle: 'Тестовый чат',
    testChatDisabledHint: 'Сохраните агента, чтобы протестировать',
    testChatTyping: 'Агент печатает',
    testChatSendError: 'Не удалось получить ответ — попробуйте ещё раз',
    testChatPlaceholder: 'Напишите сообщение…',
    testChatInputAria: 'Сообщение агенту',
    testChatSendAria: 'Отправить',
    testChatRestart: 'Рестарт чата',
    testChatRestartText: 'После перезапуска сбросится контекст диалога.',
    testChatRestartConfirm: 'Перезапустить',
    testChatEmptyTitle: 'Начните диалог',
    testChatEmptyText: 'Напишите сообщение — агент ответит так же, как ответил бы реальному клиенту.',
    closeAria: 'Закрыть',
    tabsAria: 'Разделы настроек агента',
    defaultAgentName: 'Ассистент',
    defaultBusinessName: 'Ваш бизнес',
    connectChannelHint: 'Подключите канал, чтобы агент начал отвечать',
    saveSuccess: 'Сохранено',

    errConnectInstagram: 'Не удалось подключить Instagram. Попробуйте ещё раз — если не получится снова, напишите в поддержку.',
    errDisconnectInstagram: 'Не удалось отключить Instagram. Попробуйте ещё раз.',
    errConnectTelegramToken: 'Токен не подошёл — проверьте, что скопировали его из @BotFather целиком.',
    errConnectTelegram: 'Не удалось подключить Telegram. Попробуйте ещё раз — если не получится снова, напишите в поддержку.',
    errDisconnectTelegram: 'Не удалось отключить Telegram. Попробуйте ещё раз.',
    errConnectWebsite: 'Не удалось подключить чат-виджет. Попробуйте ещё раз.',
    errDisconnectWebsite: 'Не удалось отключить чат-виджет. Попробуйте ещё раз.',
    errConnectApi: 'Не удалось подключить API. Попробуйте ещё раз.',
    errDisconnectApi: 'Не удалось отключить API. Попробуйте ещё раз.',
    errDisconnectWhatsapp: 'Не удалось отключить WhatsApp. Попробуйте ещё раз.',
    errSaveTemplate: 'Не удалось сохранить шаблон. Попробуйте ещё раз.',
    errSaveChanges: 'Не удалось сохранить изменения. Попробуйте ещё раз.',
    errSaveNameRequired: 'Заполните поле «Название компании» на вкладке «Настройки».',
    errSaveKaspiShop: 'Выбранный магазин Kaspi не найден. Выберите другой на вкладке «Контроль».',
    errSaveKaspiMigration: 'Чтобы отключить магазин Kaspi, нужно применить миграцию ai_agent_kaspi_catalog_off.sql в Supabase (SQL Editor). Остальные настройки не сохранены.',
    errSaveForbidden: 'Не сохранено: AI-агент доступен на тарифе Про.',
    errSaveNotFound: 'Агент не найден — возможно, его удалили в другой вкладке.',
    errDeleteTemplate: 'Не удалось удалить шаблон. Попробуйте ещё раз.',
    confirmDisconnectInstagram: 'Отключить Instagram? Агент перестанет отвечать клиентам в этом аккаунте.',
    confirmDisconnectWhatsapp: 'Отключить WhatsApp? Агент перестанет отвечать клиентам в этом номере.',
    confirmDeleteTemplate: 'Удалить шаблон? Агент перестанет отвечать им автоматически.',
    errWaSdkLoading: 'WhatsApp SDK ещё загружается — подождите секунду и попробуйте снова.',
    errWaNotConfigured: (m) => `Подключение WhatsApp не настроено на сервере: не задан ${m}. Это настройка деплоя, повторные попытки не помогут.`,
    errWaEnvJoiner: ' и ',
    errWaWindowClosed: 'Окно Meta закрылось, не выдав код подключения, и не сообщило причину. Чаще всего это значит, что у аккаунта Facebook нет бизнес-портфеля, либо номер уже привязан к другому WhatsApp Business. Проверьте, что входите под аккаунтом с доступом администратора к бизнес-портфелю.',
    errWaInterrupted: (step) => `Подключение прервано на шаге «${step}».`,
    errWaPhoneData: 'Не удалось получить данные номера WhatsApp. Попробуйте ещё раз.',
    errWaConnectDetail: (d) => `Не удалось подключить WhatsApp: ${d}`,
    errWaConnect: 'Не удалось подключить WhatsApp. Попробуйте ещё раз — если не получится снова, напишите в поддержку.',
    errIgNotConfigured: 'Подключение Instagram не настроено на сервере: не задан NEXT_PUBLIC_INSTAGRAM_APP_ID. Это настройка деплоя, повторные попытки не помогут.',
    errIgOpen: (d) => `Не удалось открыть Instagram: ${d}`,
    errNetworkUnavailable: 'сеть недоступна',
    errMetaRejected: (m, step) => `Meta отклонила подключение: ${m}${step ? ` (шаг: ${step})` : ''}`,
    errMetaRejectedNoReason: 'Meta отклонила подключение и не назвала причину. Попробуйте ещё раз, и если повторится — напишите в поддержку.',
    loadingLabel: 'Загрузка…',
  },

  kk: {
    toneLabels: {
      friendly: 'Достық және жылы', professional: 'Кәсіби және іскерлік',
      energetic: 'Ынталандыратын және қуатты', caring: 'Қамқор және мұқият',
    },
    goalLabels: {
      answer_questions: 'Сұрақтарға жауап беру', qualify_lead: 'Өтінімді сұрыптау',
      book_appointment: 'Кеңеске/қабылдауға жазу',
    },
    collectFieldLabels: {
      name: 'Клиенттің аты', phone: 'Телефон нөмірі', booking: 'Брондау',
      consultation: 'Кеңеске жазылу', address: 'Мекенжай', purpose: 'Өтініш мақсаты',
      budget: 'Бюджет', timeline: 'Қалаған мерзім', people_count: 'Адам саны',
      city: 'Қала', preferences: 'Қалаулар', past_experience: 'Клиенттің бұрынғы тәжірибесі',
    },
    currencyLabels: { KZT: 'Теңге (₸)', USD: 'АҚШ доллары ($)', EUR: 'Еуро (€)', RUB: 'Рубль (₽)' },
    timezoneCity: {
      'Asia/Almaty': 'Алматы, Астана', 'Asia/Aqtobe': 'Ақтөбе', 'Asia/Atyrau': 'Атырау',
      'Asia/Oral': 'Орал', 'Asia/Aqtau': 'Ақтау',
    },

    companyNameLabel: 'Компания атауы',
    toneLabel: 'Қарым-қатынас стилі',
    businessDescriptionLabel: 'Бизнес туралы',
    businessDescriptionPlaceholder: 'Не сататыныңызды және қалай жұмыс істейтініңізді толығырақ жазыңыз',
    goalLabel: 'Негізгі мақсат',
    collectFieldsLabel: 'Агент клиенттен қандай деректерді жинауы керек',
    customFieldPlaceholder: 'Мысалы: аяқ киім өлшемі',
    addButton: 'Қосу',
    addOwnButton: '✨ Өзіңдікін қосу',
    timezoneLabel: 'Уақыт белдеуі',
    currencyLabel: 'Валюта',
    customInstructionsLabel: 'Қосымша нұсқаулар (міндетті емес)',
    customInstructionsPlaceholder: 'Мысалы: жеңілдік уәде етпе; жеткізу тек Алматы бойынша; жұмыс уақыты 9:00–18:00',
    customInstructionsHint: 'Агент әр жауабында осы ережелерді ұстанады.',
    stopPhrasesLabel: 'Тоқтату тіркестері (диалогты сізге береді)',
    stopPhrasesHint: 'Клиент осы тіркестердің бірін жазса, агент бұл диалогта үндемей қалады және сізге хабарлама жібереді (Telegram Профиль → Хабарламалар бөлімінде қосылған болса, онда да) — «Диалогтар» бөлімінде жауап беріңіз.',
    triggerPlaceholder: 'Триггер — үтір немесе Enter (мысалы: баға, құны)',

    connectShopTitle: 'Kaspi Shop-ты қосыңыз — агент нақты бағаларды біледі',
    connectShopText: 'Қазір агент бағалар туралы тек жоғарыдағы сипаттамадан жауап береді — дүкенсіз ол нақты каталогты білмейді және қателесуі мүмкін. Kaspi Shop қосылған болса, ол өзекті бағаларды өзі тартады (50 тауарға дейін) және каталогта жоқ нәрсені ойлап таппайды — бұл агент хат алмасудан шығаратын шоттардың сомаларына да қатысты.',
    connectShopCta: 'Kaspi Shop-ты қосу →',
    promptPreviewTitle: 'Агент нұсқауларды қалай көреді',
    promptPreviewHint: 'Агент нұсқауларының шамамен көрінісі — жоғарыдағы өрістерден жиналады; нақты жауапта бұл жолға жүйелік мәтін қосылады.',

    trainingTitle: 'Агент оқуда — клиенттер оның жауаптарын әзірге көрмейді',
    trainingBody: 'Әр жауап «Тексеруге» бөлімінде сіздің мақұлдауыңызды күтеді және сіз жібермейінше клиентке бармайды. Бұл қорғаныс: агент сіздің түзетулеріңізден үйренеді. Бірақ кезекке қарамасаңыз, клиент ештеңе алмайды.',
    trainingLeft: (a, d) => `Дербес жұмысқа дейін: ${a} мақұлдау немесе ${d} күн.`,
    trainingLeftNoDraft: (a, d) => `Дербес жұмысқа дейін: ${a} мақұлдау немесе алғашқы жауап жобасынан бастап ${d} күн — әзірге жоба болған жоқ, күн санау басталмады.`,
    trainingExitPending: 'Оқу мерзімі өтті: клиенттің келесі хабарламасынан бастап агент өзі жауап береді, ал сізге хабарлама келеді.',
    trainingLink: '«Тексеруге» бөлімін ашу →',
    botStatusLabel: 'Бот күйі',
    botStatusHint: 'Өшірілген агент клиенттерге жауап бермейді.',
    botStatusSaved: 'Сақталды',
    botStatusOnCreateHint: 'Агентті құрған кезде қолданылады.',
    errBotStatus: 'Бот күйін өзгерту мүмкін болмады. Қайталап көріңіз.',
    testChatNoteTemplate: 'Үлгі — тегін',
    testChatNoteFlow: 'Сценарий — тегін',
    testChatNoteStopPhrase: 'Тоқтату тіркесі — нақты арнада диалог сізге өтер еді',
    testChatNoteBudgetDepleted: 'Әмиян бос — нақты арна қазір осылай жауап береді. ЖИ жауап беруі үшін балансты толтырыңыз',
    historyDepthLabel: 'Диалог жадының тереңдігі',
    historyOption: (n) => `Соңғы ${n} алмасу`,
    historyDepthHint: 'Агент қанша өткен хабарламаны есте сақтайды. Көбірек — контекст дәлірек, бірақ әр жауап қымбатырақ.',
    kaspiShopLabel: 'Бағалар мен тауарларға арналған Kaspi дүкені',
    kaspiShopDefaultOption: 'Аккаунттың белсенді дүкені (әдепкі)',
    kaspiShopMissingOption: 'Дүкен жойылған — басқасын таңдаңыз',
    kaspiShopActiveSuffix: ' — қазір белсенді',
    kaspiShopHint: 'Агент тауар атаулары, бағалар, жеткізу және дүкен сілтемелерін қайдан алады. Әдепкіде ол Kaspi Bot бөлімінде ауыстырылған дүкенді ұстанады — сонда аккаунттың барлық агенттері бірдей жауап береді.',
    kaspiShopHintOff: 'Агент тауарлар туралы емес болса (мысалы, сіздің сервисіңіз туралы), «Kaspi дүкенін пайдаланбау» таңдаңыз.',
    kaspiShopOffOption: 'Kaspi дүкенін пайдаланбау (агент тауар мен бағаны атамайды)',
    kaspiShopOffNote: 'Дүкен пайдаланылмайды: агент тауарларды, бағаларды, жеткізуді атамайды және дүкен сілтемелерін жібермейді.',
    replyCostTitle: 'ИИ-жауаптардың құны',
    replyCostText: (p) => `Үлгімен сәйкес келген жауап — тегін. ИИ жасаған жауап — ${p} ₸.`,
    walletBalanceLabel: 'Әмиян балансы:',
    walletEnoughFor: '— шамамен',
    walletRepliesSuffix: 'ИИ-жауапқа жетеді.',
    walletSharedHint: 'Әмиян Шоттар, Kaspi Bot және AI-агент үшін ортақ — оң жақ жоғарғы бұрыштағы әмиян белгішесі арқылы толтыруға болады.',

    templatesHint: 'Үлгілер бірден әрі тегін жауап береді — клиенттің хабарламасында триггер болса, ИИ шақырылмайды. Қысқа сөздер (3 әріпке дейін) тек сөздің басында ғана іске қосылады.',
    templatesEmpty: 'Әзірге үлгілер жоқ. Олар «Тексеруге» бөлімінде жауаптарды мақұлдағанда автоматты түрде жасалады, оларды қолмен де қосуға болады.',
    triggerWordsLabel: 'Триггер сөздер',
    templateChannelLabel: 'Қайда жауап беру',
    templateChannelAll: 'Барлық жерде',
    templateChannelHint: 'Пост астындағы жауапты бәрі көреді, сондықтан ол қысқа болып, жеке хабарламаға шақыруы керек. Директте толық жауап беруге болады.',
    replyTextLabel: 'Жауап мәтіні',
    replyTextPlaceholder: 'Клиент бірден алатын жауап',
    addTemplateButton: '+ Үлгі қосу',
    editTemplateAria: 'Үлгіні өңдеу',
    deleteTemplateAria: 'Үлгіні жою',
    saveButton: 'Сақтау',
    savingButton: 'Сақталуда…',
    cancelButton: 'Болдырмау',

    telegramExpiredHint: 'Telegram-бот ажырады — агент қайта жауап беруі үшін токенді қайта қойыңыз',
    telegramSetupHint: '@BotFather арқылы бот құрыңыз да токенді қойыңыз — агент сол ботта жауап бере бастайды',
    telegramTokenPlaceholder: '123456789:AAH3xk…',
    whatsappExpiredHint: 'WhatsApp ажырады — агент қайта жауап беруі үшін нөмірді қайта қосыңыз',
    websiteEmbedHint: 'Сайтыңызда </body> алдына қойыңыз:',
    copyCodeButton: 'Кодты көшіру',
    copiedLabel: 'Көшірілді ✓',
    apiKeyOnceHint: 'Кілтті қазір сақтаңыз — екінші рет көрсетпейміз:',
    copyKeyButton: 'Кілтті көшіру',
    apiUsageSend: 'Клиент хабарламаларын жіберіңіз:',
    apiUsageWithHeader: 'тақырыбымен',
    apiKeyWord: '<кілт>',
    apiUsageReceive: 'Агент жауаптарын алыңыз:',
    channelTelegramName: 'Telegram-бот',
    channelWebsiteName: 'Сайтқа арналған чат',
    openingWhatsapp: 'WhatsApp ашылуда…',
    connectExistingAppButton: 'Телефонымда WhatsApp Business бұрыннан бар',
    connectExistingAppHint: 'QR-код арқылы қосылады, телефондағы қосымша жұмысын жалғастырады, ал телефоннан жауаптарыңыз «Диалогтарда» көрінеді.',
    connectNewNumberButton: 'Жаңа нөмірді қосу (SMS арқылы)',
    connectNewNumberHint: 'WhatsApp қосымшасында жоқ нөмір үшін.',
    testChatAgentFallback: 'Сіздің агентіңіз',
    regenerateKeyButton: 'Кілтті қайта жасау',
    connectingButton: 'Қосылуда…',
    connectedChip: 'Қосылған',

    needsAgentTemplates: 'Үлгілер агент құрылғаннан кейін пайда болады.',
    needsAgentFlows: 'Сценарийлер агент құрылғаннан кейін пайда болады.',
    needsAgentChannels: 'Арналарды агент құрылғаннан кейін қосуға болады.',
    noAgentSelected: 'Агент көрсетілмеген — оны «Агенттер» тізімінен таңдаңыз',
    toAgentsList: 'Агенттер тізіміне',
    goToSettings: 'Параметрлерге өту',
    createAgentButton: 'Агент құру',
    saveAgentButton: 'Сақтау',
    savingAgentButton: 'Сақталуда…',
    testChatTitle: 'Сынақ чаты',
    testChatDisabledHint: 'Сынау үшін агентті сақтаңыз',
    testChatTyping: 'Агент жазып жатыр',
    testChatSendError: 'Жауап алу мүмкін болмады — қайталап көріңіз',
    testChatPlaceholder: 'Хабарлама жазыңыз…',
    testChatInputAria: 'Агентке хабарлама',
    testChatSendAria: 'Жіберу',
    testChatRestart: 'Чатты қайта бастау',
    testChatRestartText: 'Қайта бастағаннан кейін диалог мәтінмәні тазаланады.',
    testChatRestartConfirm: 'Қайта бастау',
    testChatEmptyTitle: 'Диалогты бастаңыз',
    testChatEmptyText: 'Хабарлама жазыңыз — агент нақты клиентке қалай жауап берсе, дәл солай жауап береді.',
    closeAria: 'Жабу',
    tabsAria: 'Агент параметрлерінің бөлімдері',
    defaultAgentName: 'Ассистент',
    defaultBusinessName: 'Сіздің бизнесіңіз',
    connectChannelHint: 'Агент жауап бере бастауы үшін арнаны қосыңыз',
    saveSuccess: 'Сақталды',

    errConnectInstagram: 'Instagram-ды қосу мүмкін болмады. Қайталап көріңіз — қайта болмаса, қолдауға жазыңыз.',
    errDisconnectInstagram: 'Instagram-ды ажырату мүмкін болмады. Қайталап көріңіз.',
    errConnectTelegramToken: 'Токен келмеді — оны @BotFather-дан толық көшіргеніңізді тексеріңіз.',
    errConnectTelegram: 'Telegram-ды қосу мүмкін болмады. Қайталап көріңіз — қайта болмаса, қолдауға жазыңыз.',
    errDisconnectTelegram: 'Telegram-ды ажырату мүмкін болмады. Қайталап көріңіз.',
    errConnectWebsite: 'Чат виджетін қосу мүмкін болмады. Қайталап көріңіз.',
    errDisconnectWebsite: 'Чат виджетін ажырату мүмкін болмады. Қайталап көріңіз.',
    errConnectApi: 'API-ды қосу мүмкін болмады. Қайталап көріңіз.',
    errDisconnectApi: 'API-ды ажырату мүмкін болмады. Қайталап көріңіз.',
    errDisconnectWhatsapp: 'WhatsApp-ты ажырату мүмкін болмады. Қайталап көріңіз.',
    errSaveTemplate: 'Үлгіні сақтау мүмкін болмады. Қайталап көріңіз.',
    errSaveChanges: 'Өзгерістерді сақтау мүмкін болмады. Қайталап көріңіз.',
    errSaveNameRequired: '«Параметрлер» қойындысындағы «Компания атауы» өрісін толтырыңыз.',
    errSaveKaspiShop: 'Таңдалған Kaspi дүкені табылмады. «Бақылау» қойындысында басқасын таңдаңыз.',
    errSaveKaspiMigration: 'Kaspi дүкенін өшіру үшін Supabase-те (SQL Editor) ai_agent_kaspi_catalog_off.sql миграциясын қолдану керек. Қалған баптаулар сақталмады.',
    errSaveForbidden: 'Сақталмады: AI-агент Про тарифінде қолжетімді.',
    errSaveNotFound: 'Агент табылмады — мүмкін, оны басқа қойындыда жойған шығарсыз.',
    errDeleteTemplate: 'Үлгіні жою мүмкін болмады. Қайталап көріңіз.',
    confirmDisconnectInstagram: 'Instagram-ды ажыратасыз ба? Агент бұл аккаунтта клиенттерге жауап беруді тоқтатады.',
    confirmDisconnectWhatsapp: 'WhatsApp-ты ажыратасыз ба? Агент бұл нөмірде клиенттерге жауап беруді тоқтатады.',
    confirmDeleteTemplate: 'Үлгіні жоясыз ба? Агент онымен автоматты жауап беруді тоқтатады.',
    errWaSdkLoading: 'WhatsApp SDK әлі жүктелуде — бір секунд күтіп, қайта көріңіз.',
    errWaNotConfigured: (m) => `WhatsApp қосылымы серверде бапталмаған: ${m} берілмеген. Бұл деплой параметрі, қайталау көмектеспейді.`,
    errWaEnvJoiner: ' және ',
    errWaWindowClosed: 'Meta терезесі қосылым кодын бермей жабылды және себебін айтпады. Көбіне бұл Facebook аккаунтында бизнес-портфель жоқ дегенді, немесе нөмір басқа WhatsApp Business-ке байланған дегенді білдіреді. Бизнес-портфельге әкімші рұқсаты бар аккаунтпен кіріп тұрғаныңызды тексеріңіз.',
    errWaInterrupted: (step) => `Қосылым «${step}» қадамында үзілді.`,
    errWaPhoneData: 'WhatsApp нөмірінің деректерін алу мүмкін болмады. Қайталап көріңіз.',
    errWaConnectDetail: (d) => `WhatsApp-ты қосу мүмкін болмады: ${d}`,
    errWaConnect: 'WhatsApp-ты қосу мүмкін болмады. Қайталап көріңіз — қайта болмаса, қолдауға жазыңыз.',
    errIgNotConfigured: 'Instagram қосылымы серверде бапталмаған: NEXT_PUBLIC_INSTAGRAM_APP_ID берілмеген. Бұл деплой параметрі, қайталау көмектеспейді.',
    errIgOpen: (d) => `Instagram-ды ашу мүмкін болмады: ${d}`,
    errNetworkUnavailable: 'желі қолжетімсіз',
    errMetaRejected: (m, step) => `Meta қосылымды қабылдамады: ${m}${step ? ` (қадам: ${step})` : ''}`,
    errMetaRejectedNoReason: 'Meta қосылымды қабылдамады және себебін айтпады. Қайталап көріңіз, қайталанса — қолдауға жазыңыз.',
    loadingLabel: 'Жүктелуде…',
  },

  en: {
    toneLabels: {
      friendly: 'Friendly and warm', professional: 'Professional and businesslike',
      energetic: 'Motivating and energetic', caring: 'Caring and attentive',
    },
    goalLabels: {
      answer_questions: 'Answer questions', qualify_lead: 'Qualify the lead',
      book_appointment: 'Book a consultation',
    },
    collectFieldLabels: {
      name: "Customer's name", phone: 'Phone number', booking: 'Booking',
      consultation: 'Consultation booking', address: 'Address', purpose: 'Reason for contact',
      budget: 'Budget', timeline: 'Preferred timing', people_count: 'Number of people',
      city: 'City', preferences: 'Preferences', past_experience: "Customer's past experience",
    },
    currencyLabels: { KZT: 'Tenge (₸)', USD: 'US dollar ($)', EUR: 'Euro (€)', RUB: 'Rouble (₽)' },
    timezoneCity: {
      'Asia/Almaty': 'Almaty, Astana', 'Asia/Aqtobe': 'Aktobe', 'Asia/Atyrau': 'Atyrau',
      'Asia/Oral': 'Oral', 'Asia/Aqtau': 'Aktau',
    },

    companyNameLabel: 'Company name',
    toneLabel: 'Tone of voice',
    businessDescriptionLabel: 'About the business',
    businessDescriptionPlaceholder: 'Describe in more detail what you sell and how you work',
    goalLabel: 'Primary goal',
    collectFieldsLabel: 'What the assistant should collect from the customer',
    customFieldPlaceholder: 'For example: shoe size',
    addButton: 'Add',
    addOwnButton: '✨ Add your own',
    timezoneLabel: 'Time zone',
    currencyLabel: 'Currency',
    customInstructionsLabel: 'Additional instructions (optional)',
    customInstructionsPlaceholder: 'For example: never promise discounts; delivery within Almaty only; working hours 9:00–18:00',
    customInstructionsHint: 'The assistant follows these rules in every reply.',
    stopPhrasesLabel: 'Stop phrases (hand the conversation to you)',
    stopPhrasesHint: 'If a customer writes one of these, the assistant goes quiet in that conversation and notifies you (over Telegram too, if it is connected under Profile → Notifications) — reply from Conversations.',
    triggerPlaceholder: 'Trigger — comma or Enter (for example: price, cost)',

    connectShopTitle: 'Connect Kaspi Shop so the assistant knows real prices',
    connectShopText: 'Right now the assistant answers about prices only from the description above — without the shop it does not know the exact catalogue and can get it wrong. With Kaspi Shop connected it pulls current prices itself (up to 50 products) and does not invent what the catalogue does not have — which also covers the amounts on invoices it issues from a conversation.',
    connectShopCta: 'Connect Kaspi Shop →',
    promptPreviewTitle: 'How the assistant sees its instructions',
    promptPreviewHint: 'An approximation of the assistant’s instructions, assembled from the fields above; a system prompt is added to this in a real reply.',

    trainingTitle: 'The agent is in training — customers do not see its replies yet',
    trainingBody: 'Every reply waits for your approval under To review and does not reach the customer until you send it. That is the safeguard: the agent learns from your edits. But if nobody opens the queue, the customer gets nothing.',
    trainingLeft: (a, d) => `Until it works on its own: ${a} approvals or ${d} days.`,
    trainingLeftNoDraft: (a, d) => `Until it works on its own: ${a} approvals or ${d} days from the first draft — there have been no drafts yet, so the day count has not started.`,
    trainingExitPending: 'The training period is over: from the next customer message the agent will reply on its own, and you will get a notification.',
    trainingLink: 'Open To review →',
    botStatusLabel: 'Bot status',
    botStatusHint: 'A disabled assistant does not reply to customers.',
    botStatusSaved: 'Saved',
    botStatusOnCreateHint: 'Applies when you create the agent.',
    errBotStatus: 'Could not change the bot status. Please try again.',
    testChatNoteTemplate: 'Template — free',
    testChatNoteFlow: 'Scenario — free',
    testChatNoteStopPhrase: 'Stop phrase — in a live channel the conversation would be handed to you',
    testChatNoteBudgetDepleted: 'Wallet is empty — this is how a live channel replies right now. Top up so the AI can answer',
    historyDepthLabel: 'Conversation memory depth',
    historyOption: (n) => `Last ${n} exchanges`,
    historyDepthHint: 'How many past messages the assistant remembers. More means better context but a higher cost per reply.',
    kaspiShopLabel: 'Kaspi shop for prices and products',
    kaspiShopDefaultOption: "The account's active shop (default)",
    kaspiShopMissingOption: 'Shop was deleted — pick another one',
    kaspiShopActiveSuffix: ' — currently active',
    kaspiShopHint: 'Where the assistant takes product names, prices, delivery terms and shop links from. By default it follows whichever shop is selected in the Kaspi Bot section — and then every agent on the account answers from the same one.',
    kaspiShopHintOff: 'If the assistant is not about products (say, it is about your service), pick “Do not use a Kaspi shop”.',
    kaspiShopOffOption: 'Do not use a Kaspi shop (the assistant names no products or prices)',
    kaspiShopOffNote: 'No shop in use: the assistant names no products, prices or delivery terms and sends no shop links.',
    replyCostTitle: 'Cost of AI replies',
    replyCostText: (p) => `A reply matched by a template is free. A reply generated by AI costs ${p} ₸.`,
    walletBalanceLabel: 'Wallet balance:',
    walletEnoughFor: '— enough for about',
    walletRepliesSuffix: 'AI replies.',
    walletSharedHint: 'The wallet is shared between Invoices, Kaspi Bot and the AI agent — top it up from the wallet icon in the top right.',

    templatesHint: 'Templates reply instantly and for free — if the customer’s message contains a trigger, the AI is not called. Short words (up to 3 letters) match only at the beginning of a word.',
    templatesEmpty: 'No templates yet. They are created automatically when you approve replies under To review, and can also be added by hand.',
    triggerWordsLabel: 'Trigger words',
    templateChannelLabel: 'Where it replies',
    templateChannelAll: 'Everywhere',
    templateChannelHint: 'A reply under a post is read by everyone, so it should be short and move the person into Direct. In Direct you can answer in full.',
    replyTextLabel: 'Reply text',
    replyTextPlaceholder: 'The reply the customer receives instantly',
    addTemplateButton: '+ Add template',
    editTemplateAria: 'Edit template',
    deleteTemplateAria: 'Delete template',
    saveButton: 'Save',
    savingButton: 'Saving…',
    cancelButton: 'Cancel',

    telegramExpiredHint: 'The Telegram bot disconnected — paste the token again so the assistant can reply',
    telegramSetupHint: 'Create a bot via @BotFather and paste its token — the assistant will start replying in that bot',
    telegramTokenPlaceholder: '123456789:AAH3xk…',
    whatsappExpiredHint: 'WhatsApp disconnected — reconnect the number so the assistant can reply',
    websiteEmbedHint: 'Paste this before </body> on your website:',
    copyCodeButton: 'Copy code',
    copiedLabel: 'Copied ✓',
    apiKeyOnceHint: 'Save the key now — we will not show it again:',
    copyKeyButton: 'Copy key',
    apiUsageSend: 'Send customer messages to:',
    apiUsageWithHeader: 'with the header',
    apiKeyWord: '<key>',
    apiUsageReceive: 'Read the agent’s replies from:',
    channelTelegramName: 'Telegram bot',
    channelWebsiteName: 'Website chat',
    openingWhatsapp: 'Opening WhatsApp…',
    connectExistingAppButton: 'I already have WhatsApp Business on my phone',
    connectExistingAppHint: 'Connects with a QR code; the phone app keeps working and your replies from the phone show up in Conversations.',
    connectNewNumberButton: 'Connect a new number (via SMS)',
    connectNewNumberHint: 'For a number that is not in the WhatsApp app.',
    testChatAgentFallback: 'Your agent',
    regenerateKeyButton: 'Regenerate key',
    connectingButton: 'Connecting…',
    connectedChip: 'Connected',

    needsAgentTemplates: 'Templates appear once the agent is created.',
    needsAgentFlows: 'Flows appear once the agent is created.',
    needsAgentChannels: 'Channels can be connected once the agent is created.',
    noAgentSelected: 'No agent selected — pick one from the Agents list',
    toAgentsList: 'Back to agents',
    goToSettings: 'Go to settings',
    createAgentButton: 'Create agent',
    saveAgentButton: 'Save',
    savingAgentButton: 'Saving…',
    testChatTitle: 'Test chat',
    testChatDisabledHint: 'Save the agent to test it',
    testChatTyping: 'The agent is typing',
    testChatSendError: 'Could not get a reply — please try again',
    testChatPlaceholder: 'Write a message…',
    testChatInputAria: 'Message to the agent',
    testChatSendAria: 'Send',
    testChatRestart: 'Restart chat',
    testChatRestartText: 'Restarting clears the conversation context.',
    testChatRestartConfirm: 'Restart',
    testChatEmptyTitle: 'Start a conversation',
    testChatEmptyText: 'Write a message — the agent replies exactly as it would to a real customer.',
    closeAria: 'Close',
    tabsAria: 'Agent settings sections',
    defaultAgentName: 'Assistant',
    defaultBusinessName: 'Your business',
    connectChannelHint: 'Connect a channel so the agent can start replying',
    saveSuccess: 'Saved',

    errConnectInstagram: 'Could not connect Instagram. Please try again — if it fails again, contact support.',
    errDisconnectInstagram: 'Could not disconnect Instagram. Please try again.',
    errConnectTelegramToken: 'That token was not accepted — check that you copied it from @BotFather in full.',
    errConnectTelegram: 'Could not connect Telegram. Please try again — if it fails again, contact support.',
    errDisconnectTelegram: 'Could not disconnect Telegram. Please try again.',
    errConnectWebsite: 'Could not connect the chat widget. Please try again.',
    errDisconnectWebsite: 'Could not disconnect the chat widget. Please try again.',
    errConnectApi: 'Could not connect the API. Please try again.',
    errDisconnectApi: 'Could not disconnect the API. Please try again.',
    errDisconnectWhatsapp: 'Could not disconnect WhatsApp. Please try again.',
    errSaveTemplate: 'Could not save the template. Please try again.',
    errSaveChanges: 'Could not save the changes. Please try again.',
    errSaveNameRequired: 'Fill in “Company name” on the “Settings” tab.',
    errSaveKaspiShop: 'The selected Kaspi store was not found. Pick another one on the “Control” tab.',
    errSaveKaspiMigration: 'To turn the Kaspi shop off, apply the migration ai_agent_kaspi_catalog_off.sql in Supabase (SQL Editor). Nothing else was saved either.',
    errSaveForbidden: 'Not saved: the AI agent is available on the Pro plan.',
    errSaveNotFound: 'Agent not found — it may have been deleted in another tab.',
    errDeleteTemplate: 'Could not delete the template. Please try again.',
    confirmDisconnectInstagram: 'Disconnect Instagram? The assistant will stop replying to customers on this account.',
    confirmDisconnectWhatsapp: 'Disconnect WhatsApp? The assistant will stop replying to customers on this number.',
    confirmDeleteTemplate: 'Delete this template? The assistant will stop replying with it automatically.',
    errWaSdkLoading: 'The WhatsApp SDK is still loading — wait a second and try again.',
    errWaNotConfigured: (m) => `WhatsApp connection is not configured on the server: ${m} is not set. This is a deployment setting; retrying will not help.`,
    errWaEnvJoiner: ' and ',
    errWaWindowClosed: 'The Meta window closed without returning a connection code and without giving a reason. Most often this means the Facebook account has no business portfolio, or the number is already tied to another WhatsApp Business. Check that you are signed in with an account that has admin access to the business portfolio.',
    errWaInterrupted: (step) => `The connection stopped at the "${step}" step.`,
    errWaPhoneData: 'Could not retrieve the WhatsApp number details. Please try again.',
    errWaConnectDetail: (d) => `Could not connect WhatsApp: ${d}`,
    errWaConnect: 'Could not connect WhatsApp. Please try again — if it fails again, contact support.',
    errIgNotConfigured: 'Instagram connection is not configured on the server: NEXT_PUBLIC_INSTAGRAM_APP_ID is not set. This is a deployment setting; retrying will not help.',
    errIgOpen: (d) => `Could not open Instagram: ${d}`,
    errNetworkUnavailable: 'network unavailable',
    errMetaRejected: (m, step) => `Meta rejected the connection: ${m}${step ? ` (step: ${step})` : ''}`,
    errMetaRejectedNoReason: 'Meta rejected the connection without giving a reason. Please try again, and contact support if it happens again.',
    loadingLabel: 'Loading…',
  },
}
