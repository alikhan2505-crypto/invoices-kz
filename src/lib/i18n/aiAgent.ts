// Strings for the screens of the AI-agent section that a person actually sees
// while connecting a channel and approving a reply: the agents list, the
// Channels tab, and the review queue.
//
// Scope is deliberate. This section was built after the app's 2026-07 i18n
// pass and never entered the dictionaries, so every one of its pages was
// hardcoded Russian. Meta's App Review rejected our screencast on 2026-09-07
// partly for that ("измените язык пользовательского интерфейса на английский"),
// and these are the screens the re-recorded video shows. The settings form
// itself (Промптинг / Контроль / Шаблоны / Сценарии) is not on camera and is
// not translated here -- a separate pass, not a blocker for the submission.
//
// Same shape as every other dictionary in this folder: one object per
// language, ru/kk/en, indexed by the `lang` from useLanguage().

export type Lang = 'ru' | 'kk' | 'en'

export interface AiAgentDict {
  // shared
  loading: string
  adminOnly: string
  allAgents: string
  backToAgents: string

  // agents list
  agentsTitle: string
  agentsSubtitle: string
  createAgentButton: string
  emptyTitle: string
  emptyText: string
  emptyCta: string
  goalAnswerQuestions: string
  goalQualifyLead: string
  goalBookAppointment: string
  statusTraining: string
  statusActive: string
  connectedTo: (account: string) => string
  instagramDisconnected: string
  channelNotConnected: string
  createdOn: (date: string) => string
  deleteAgentAria: (name: string) => string
  deleteAgentTitle: string
  deleteAgentConfirm: (name: string) => string
  deleteAgentWarning: string
  deleteAgentTypeName: string
  deleting: string
  deleteButton: string
  cancelButton: string
  deleteAgentError: string

  // agent page header + tabs
  agentPageTitle: string
  agentLabel: (name: string) => string
  agentPageSubtitle: string
  testChatButton: string
  tabSettings: string
  tabPrompting: string
  tabControl: string
  tabTemplates: string
  tabFlows: string
  tabChannels: string
  reviewQueueLink: string

  // channels
  channelInstagramDesc: string
  channelTelegramDesc: string
  channelWhatsappDesc: string
  channelWebsiteDesc: string
  channelApiDesc: string
  chipConnected: (account: string) => string
  chipReconnectNeeded: string
  chipNotConnected: string
  chipComingSoon: string
  connectButton: string
  disconnectButton: string
  disconnecting: string
  reconnectButton: string
  openingInstagram: string
  instagramExpiredHint: string

  // review queue
  reviewTitle: string
  reviewSubtitle: string
  reviewEmpty: string
  reviewInReview: (count: number) => string
  customerQuestion: string
  anotherVariant: string
  generating: string
  freeLeft: (left: number, total: number) => string
  freeUsedUp: string
  regenPricingHint: string
  becomesTemplateHint: string
  sendButton: string
  sendingButton: string
  skipButton: string
}

export const aiAgentDict: Record<Lang, AiAgentDict> = {
  ru: {
    loading: 'Загрузка…',
    adminOnly: 'Эта функция пока доступна только администраторам.',
    allAgents: 'Все агенты',
    backToAgents: 'Все агенты',

    agentsTitle: 'Агенты',
    agentsSubtitle: 'Ваши AI-сотрудники, которые отвечают клиентам в Instagram',
    createAgentButton: '+ Создать агента',
    emptyTitle: 'Пока нет ни одного агента',
    emptyText: 'Создайте AI-сотрудника, подключите Instagram — и он начнёт отвечать вашим клиентам на комментарии и сообщения.',
    emptyCta: 'Создать первого агента',
    goalAnswerQuestions: 'Отвечать на вопросы',
    goalQualifyLead: 'Квалифицировать заявку',
    goalBookAppointment: 'Записать на консультацию/приём',
    statusTraining: 'Обучается',
    statusActive: 'Активен',
    connectedTo: (a) => `Подключено: ${a}`,
    instagramDisconnected: 'Instagram отключился — переподключите',
    channelNotConnected: 'Канал не подключён',
    createdOn: (d) => `Создан ${d}`,
    deleteAgentAria: (n) => `Удалить агента ${n}`,
    deleteAgentTitle: 'Удалить агента',
    deleteAgentConfirm: (n) => `Вы уверены, что хотите удалить агента «${n}»?`,
    deleteAgentWarning: 'Будет удалено безвозвратно: все настройки, подключения и диалоги агента',
    deleteAgentTypeName: 'Для подтверждения введите название агента',
    deleting: 'Удаляем…',
    deleteButton: 'Удалить',
    cancelButton: 'Отмена',
    deleteAgentError: 'Не удалось удалить агента. Попробуйте ещё раз.',

    agentPageTitle: 'AI-агент',
    agentLabel: (n) => `Агент: ${n}`,
    agentPageSubtitle: 'Настройте ассистента, который отвечает вашим клиентам в Instagram и Telegram',
    testChatButton: 'Тестовый чат',
    tabSettings: 'Настройки',
    tabPrompting: 'Промптинг',
    tabControl: 'Контроль',
    tabTemplates: 'Шаблоны',
    tabFlows: 'Сценарии',
    tabChannels: 'Каналы',
    reviewQueueLink: 'Диалоги на проверке',

    channelInstagramDesc: 'Агент отвечает на сообщения в Директ вашего бизнес-аккаунта Instagram',
    channelTelegramDesc: 'Агент отвечает на сообщения в вашем Telegram-боте, созданном через @BotFather',
    channelWhatsappDesc: 'Агент отвечает на сообщения в вашем WhatsApp Business — официальный WhatsApp Cloud API',
    channelWebsiteDesc: 'Виджет чата на вашем сайте — агент отвечает посетителям в реальном времени',
    channelApiDesc: 'Подключите свою систему — CRM, сайт или приложение — через HTTP API',
    chipConnected: (a) => `Подключено: ${a}`,
    chipReconnectNeeded: 'Требуется переподключение',
    chipNotConnected: 'Не подключен',
    chipComingSoon: 'Канал в работе',
    connectButton: 'Подключить',
    disconnectButton: 'Отключить',
    disconnecting: 'Отключаем…',
    reconnectButton: 'Переподключить',
    openingInstagram: 'Открываем Instagram…',
    instagramExpiredHint: 'Instagram отключился — переподключите аккаунт, чтобы агент снова отвечал',

    reviewTitle: 'Диалоги на проверке',
    reviewSubtitle: 'Черновики ответов ждут вашего одобрения',
    reviewEmpty: 'Пока нечего проверять',
    reviewInReview: (c) => `На проверке: ${c}`,
    customerQuestion: 'Вопрос клиента',
    anotherVariant: 'Другой вариант',
    generating: 'Генерация…',
    freeLeft: (l, t) => `осталось ${l} из ${t} бесплатных`,
    freeUsedUp: 'бесплатные закончились — 5 ₸ за вариант',
    regenPricingHint: 'Первые 3 варианта — бесплатно, дальше 5 ₸ за генерацию. Списывается с единого кошелька.',
    becomesTemplateHint: 'После отправки ответ станет шаблоном — похожие вопросы (по ключевым словам) получат его бесплатно и мгновенно',
    sendButton: 'Отправить',
    sendingButton: 'Отправляется…',
    skipButton: 'Пропустить',
  },

  kk: {
    loading: 'Жүктелуде…',
    adminOnly: 'Бұл мүмкіндік әзірге тек әкімшілерге қолжетімді.',
    allAgents: 'Барлық агенттер',
    backToAgents: 'Барлық агенттер',

    agentsTitle: 'Агенттер',
    agentsSubtitle: 'Instagram-да клиенттерге жауап беретін AI-қызметкерлеріңіз',
    createAgentButton: '+ Агент құру',
    emptyTitle: 'Әзірге бірде-бір агент жоқ',
    emptyText: 'AI-қызметкер құрыңыз, Instagram-ды қосыңыз — ол клиенттеріңіздің пікірлері мен хабарламаларына жауап бере бастайды.',
    emptyCta: 'Бірінші агентті құру',
    goalAnswerQuestions: 'Сұрақтарға жауап беру',
    goalQualifyLead: 'Өтінімді сұрыптау',
    goalBookAppointment: 'Кеңеске/қабылдауға жазу',
    statusTraining: 'Оқып жатыр',
    statusActive: 'Белсенді',
    connectedTo: (a) => `Қосылған: ${a}`,
    instagramDisconnected: 'Instagram ажырады — қайта қосыңыз',
    channelNotConnected: 'Арна қосылмаған',
    createdOn: (d) => `Құрылған ${d}`,
    deleteAgentAria: (n) => `${n} агентін жою`,
    deleteAgentTitle: 'Агентті жою',
    deleteAgentConfirm: (n) => `«${n}» агентін жойғыңыз келе ме?`,
    deleteAgentWarning: 'Қайтарымсыз жойылады: агенттің барлық параметрлері, қосылымдары және диалогтары',
    deleteAgentTypeName: 'Растау үшін агенттің атауын енгізіңіз',
    deleting: 'Жойылуда…',
    deleteButton: 'Жою',
    cancelButton: 'Болдырмау',
    deleteAgentError: 'Агентті жою мүмкін болмады. Қайталап көріңіз.',

    agentPageTitle: 'AI-агент',
    agentLabel: (n) => `Агент: ${n}`,
    agentPageSubtitle: 'Instagram мен Telegram-да клиенттеріңізге жауап беретін ассистентті баптаңыз',
    testChatButton: 'Сынақ чаты',
    tabSettings: 'Параметрлер',
    tabPrompting: 'Промптинг',
    tabControl: 'Бақылау',
    tabTemplates: 'Үлгілер',
    tabFlows: 'Сценарийлер',
    tabChannels: 'Арналар',
    reviewQueueLink: 'Тексерудегі диалогтар',

    channelInstagramDesc: 'Агент Instagram бизнес-аккаунтыңыздың Директіндегі хабарламаларға жауап береді',
    channelTelegramDesc: '@BotFather арқылы құрылған Telegram-ботыңыздағы хабарламаларға агент жауап береді',
    channelWhatsappDesc: 'Агент WhatsApp Business-іңіздегі хабарламаларға жауап береді — ресми WhatsApp Cloud API',
    channelWebsiteDesc: 'Сайтыңыздағы чат виджеті — агент келушілерге нақты уақытта жауап береді',
    channelApiDesc: 'Өз жүйеңізді — CRM, сайт немесе қосымша — HTTP API арқылы қосыңыз',
    chipConnected: (a) => `Қосылған: ${a}`,
    chipReconnectNeeded: 'Қайта қосу қажет',
    chipNotConnected: 'Қосылмаған',
    chipComingSoon: 'Арна жасалуда',
    connectButton: 'Қосу',
    disconnectButton: 'Ажырату',
    disconnecting: 'Ажыратылуда…',
    reconnectButton: 'Қайта қосу',
    openingInstagram: 'Instagram ашылуда…',
    instagramExpiredHint: 'Instagram ажырады — агент қайта жауап беруі үшін аккаунтты қайта қосыңыз',

    reviewTitle: 'Тексерудегі диалогтар',
    reviewSubtitle: 'Жауап жобалары сіздің мақұлдауыңызды күтуде',
    reviewEmpty: 'Әзірге тексеретін ештеңе жоқ',
    reviewInReview: (c) => `Тексеруде: ${c}`,
    customerQuestion: 'Клиенттің сұрағы',
    anotherVariant: 'Басқа нұсқа',
    generating: 'Жасалуда…',
    freeLeft: (l, t) => `${t} тегіннің ${l} қалды`,
    freeUsedUp: 'тегіндері бітті — нұсқасы 5 ₸',
    regenPricingHint: 'Алғашқы 3 нұсқа тегін, әрі қарай генерация 5 ₸. Бірыңғай әмиеттен есептен шығарылады.',
    becomesTemplateHint: 'Жіберілгеннен кейін жауап үлгіге айналады — ұқсас сұрақтар (кілт сөздер бойынша) оны тегін әрі бірден алады',
    sendButton: 'Жіберу',
    sendingButton: 'Жіберілуде…',
    skipButton: 'Өткізіп жіберу',
  },

  en: {
    loading: 'Loading…',
    adminOnly: 'This feature is currently available to administrators only.',
    allAgents: 'All agents',
    backToAgents: 'All agents',

    agentsTitle: 'Agents',
    agentsSubtitle: 'Your AI assistants that reply to customers on Instagram',
    createAgentButton: '+ Create agent',
    emptyTitle: 'No agents yet',
    emptyText: 'Create an AI assistant, connect Instagram — and it will start replying to your customers’ comments and messages.',
    emptyCta: 'Create your first agent',
    goalAnswerQuestions: 'Answer questions',
    goalQualifyLead: 'Qualify the lead',
    goalBookAppointment: 'Book a consultation',
    statusTraining: 'Training',
    statusActive: 'Active',
    connectedTo: (a) => `Connected: ${a}`,
    instagramDisconnected: 'Instagram disconnected — reconnect it',
    channelNotConnected: 'Channel not connected',
    createdOn: (d) => `Created ${d}`,
    deleteAgentAria: (n) => `Delete agent ${n}`,
    deleteAgentTitle: 'Delete agent',
    deleteAgentConfirm: (n) => `Are you sure you want to delete the agent “${n}”?`,
    deleteAgentWarning: 'This permanently deletes the agent’s settings, connections and conversations',
    deleteAgentTypeName: 'Type the agent’s name to confirm',
    deleting: 'Deleting…',
    deleteButton: 'Delete',
    cancelButton: 'Cancel',
    deleteAgentError: 'Could not delete the agent. Please try again.',

    agentPageTitle: 'AI agent',
    agentLabel: (n) => `Agent: ${n}`,
    agentPageSubtitle: 'Set up the assistant that replies to your customers on Instagram and Telegram',
    testChatButton: 'Test chat',
    tabSettings: 'Settings',
    tabPrompting: 'Prompting',
    tabControl: 'Control',
    tabTemplates: 'Templates',
    tabFlows: 'Flows',
    tabChannels: 'Channels',
    reviewQueueLink: 'Replies awaiting review',

    channelInstagramDesc: 'The assistant replies to direct messages on your Instagram business account',
    channelTelegramDesc: 'The assistant replies to messages in your Telegram bot created via @BotFather',
    channelWhatsappDesc: 'The assistant replies to messages in your WhatsApp Business — official WhatsApp Cloud API',
    channelWebsiteDesc: 'A chat widget on your website — the assistant replies to visitors in real time',
    channelApiDesc: 'Connect your own system — CRM, website or app — over an HTTP API',
    chipConnected: (a) => `Connected: ${a}`,
    chipReconnectNeeded: 'Reconnection required',
    chipNotConnected: 'Not connected',
    chipComingSoon: 'Channel in progress',
    connectButton: 'Connect',
    disconnectButton: 'Disconnect',
    disconnecting: 'Disconnecting…',
    reconnectButton: 'Reconnect',
    openingInstagram: 'Opening Instagram…',
    instagramExpiredHint: 'Instagram disconnected — reconnect the account so the assistant can reply again',

    reviewTitle: 'Replies awaiting review',
    reviewSubtitle: 'Draft replies are waiting for your approval',
    reviewEmpty: 'Nothing to review yet',
    reviewInReview: (c) => `In review: ${c}`,
    customerQuestion: 'Customer’s question',
    anotherVariant: 'Another version',
    generating: 'Generating…',
    freeLeft: (l, t) => `${l} of ${t} free left`,
    freeUsedUp: 'free versions used up — 5 ₸ per version',
    regenPricingHint: 'The first 3 versions are free, after that 5 ₸ per generation, charged to your platform wallet.',
    becomesTemplateHint: 'Once sent, this reply becomes a template — similar questions (matched by keywords) get it instantly and for free',
    sendButton: 'Send',
    sendingButton: 'Sending…',
    skipButton: 'Skip',
  },
}
