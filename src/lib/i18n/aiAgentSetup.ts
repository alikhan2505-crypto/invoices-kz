// Строки мастера «сначала канал» /ai-agent/setup, счётчика бесплатных
// ответов WhatsApp и плашки «Продлите Про» (16.10.2026). Отдельный словарь,
// чтобы не раздувать aiAgent.ts; та же форма: ru/kk/en по `lang` из
// useLanguage().

import type { Lang } from './aiAgent'

export interface AiAgentSetupDict {
  // мастер: общее
  pageTitle: string
  stepLabels: [string, string, string, string, string]
  stepOf: (step: number, total: number) => string
  next: string
  back: string
  fineTuneLink: string
  fineTuneText: string
  saveError: string
  loadError: string

  // шаг 0
  step0Title: string
  step0Text: string
  createButton: string
  creating: string
  createError: string

  // шаг 1
  step1Title: string
  step1Text: string
  laterLink: string
  channelConnectedNote: string
  instagramConnected: string

  // шаг 2
  step2Title: string
  step2Text: string
  nameLabel: string
  descLabel: string
  descPlaceholder: string
  descMore: (left: number) => string
  descEnough: string
  kaspiCardTitle: string
  kaspiCardText: (store: string) => string
  kaspiStoreLabel: string

  // шаг 3
  step3Title: string
  step3Text: string
  suggestions: string[]

  // шаг 4
  step4Title: string
  channelsLabel: string
  noChannelYet: string
  balanceLabel: string
  balanceEnough: (replies: number) => string
  lowBalance: string
  topUp: string
  modeTitle: string
  modeActive: string
  modeActiveHint: string
  modeTraining: string
  modeTrainingHint: string
  modeTrainingWarn: string
  launchButton: string
  launching: string
  launchNeedsChannel: string
  launchNeedsBusiness: string
  descReachedShort: (min: number) => string
  toChannelStep: string
  launchError: string

  // список агентов
  draftBadge: string
  continueSetup: string

  // счётчик WhatsApp
  waTitle: string
  waUsageLine: (used: number, limit: number) => string
  waResets: string
  waApprox: string
  waApproxHint: string
  waOver: string
  waUnavailable: string
  waKpiLabel: string
  waKpiSub: (limit: number) => string

  // Про кончился
  lapsedTitle: string
  lapsedText: string
  lapsedNoAgentsText: string
  lapsedCta: string
  lapsedDialogsLink: string

  // «Диалоги» (бывшая «Переписка»)
  dialogsTitle: string
  dialogsSubtitle: string
  dialogsSubtitleReadOnly: string
}

export const aiAgentSetupDict: Record<Lang, AiAgentSetupDict> = {
  ru: {
    pageTitle: 'Новый агент',
    stepLabels: ['Создать', 'Канал', 'О бизнесе', 'Проверка', 'Запуск'],
    stepOf: (s, t) => `Шаг ${s} из ${t}`,
    next: 'Дальше',
    back: 'Назад',
    fineTuneLink: 'Тонкая настройка',
    fineTuneText: 'Тон, цель, какие данные собирать и остальное — в настройках агента. Всё уже заполнено по умолчанию.',
    saveError: 'Не удалось сохранить. Попробуйте ещё раз.',
    loadError: 'Не удалось загрузить агента. Обновите страницу.',

    step0Title: 'Создадим AI-агента',
    step0Text: 'Агент появится сразу, но отвечать клиентам начнёт только после кнопки «Запустить» на последнем шаге.',
    createButton: 'Создать агента',
    creating: 'Создаём…',
    createError: 'Не удалось создать агента. Попробуйте ещё раз.',

    step1Title: 'Где агент будет отвечать?',
    step1Text: 'Подключите канал. Агент пока выключен — клиенты ничего не получат до запуска.',
    laterLink: 'Подключу позже — сначала проверю в тестовом чате',
    channelConnectedNote: 'Канал подключён. Дальше — расскажите агенту о бизнесе.',
    instagramConnected: 'Instagram подключён',

    step2Title: 'Расскажите о бизнесе',
    step2Text: 'Это единственное, что агент знает о вас. Чем конкретнее — тем точнее ответы.',
    nameLabel: 'Название — агент представится от его имени',
    descLabel: 'О бизнесе',
    descPlaceholder: 'Например: «Кофейня „Зерно“ в Алматы. Капучино 1 200 ₸, латте 1 400 ₸, круассаны от 900 ₸. Доставка по городу через Яндекс — от 30 минут. Работаем каждый день с 8:00 до 22:00.»',
    descMore: (n) => `Ещё ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'символ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'символа' : 'символов'}: что продаёте, цены, доставка, график`,
    descEnough: 'Достаточно, чтобы агент отвечал по делу',
    kaspiCardTitle: 'Товары из Kaspi Bot',
    kaspiCardText: (s) => `Цены и наличие агент возьмёт из магазина «${s}» — описывать каждый товар не нужно.`,
    kaspiStoreLabel: 'Магазин',

    step3Title: 'Проверьте, как агент отвечает',
    step3Text: 'Напишите как клиент или нажмите готовый вопрос. Ответ ИИ стоит столько же, сколько в живом канале.',
    suggestions: ['Сколько стоит?', 'Есть доставка?', 'Позовите менеджера'],

    step4Title: 'Запуск',
    channelsLabel: 'Каналы',
    noChannelYet: 'Канал не подключён',
    balanceLabel: 'Баланс кошелька',
    balanceEnough: (n) => `хватит примерно на ${n} ответов`,
    lowBalance: 'Без баланса клиент получит только заготовку «Мы скоро ответим»',
    topUp: 'Пополнить',
    modeTitle: 'Как отвечать клиентам',
    modeActive: 'Отвечать клиентам сразу',
    modeActiveHint: 'Агент отвечает сам и мгновенно. Все ответы видны в «Диалогах».',
    modeTraining: 'Сначала показывать ответы мне',
    modeTrainingHint: 'Каждый ответ ждёт вашего одобрения в разделе «На проверку».',
    modeTrainingWarn: 'В WhatsApp ответить можно только в течение 24 часов после сообщения клиента — не успеете одобрить, ответ уже не уйдёт. Чат для сайта всё равно отвечает сразу: посетитель ждёт на странице.',
    launchButton: 'Запустить',
    launching: 'Запускаем…',
    launchNeedsChannel: 'Подключите хотя бы один канал — без него агенту некуда отвечать.',
    launchNeedsBusiness: 'Сначала расскажите агенту о бизнесе — хотя бы 80 символов или подключите Kaspi Bot.',
    descReachedShort: (m) => `Описание короче ${m} символов`,
    toChannelStep: 'Подключить канал',
    launchError: 'Не удалось запустить. Попробуйте ещё раз.',

    draftBadge: 'Черновик',
    continueSetup: 'Продолжить настройку',

    waTitle: 'Бесплатные ответы WhatsApp',
    waUsageLine: (u, l) => `${u.toLocaleString('ru-RU')} из ${l.toLocaleString('ru-RU')} бесплатных в этом месяце`,
    waResets: 'обнулится 1-го',
    waApprox: 'примерно, по всем WhatsApp-диалогам агента',
    waApproxHint: 'Считаем ответы агента и рассылки по всем WhatsApp-диалогам этого агента — если у него несколько номеров, цифра общая. Meta считает лимит на каждый номер отдельно и по своему времени, поэтому цифра примерная.',
    waOver: 'Сверх лимита ≈ $0.018 за сообщение — платите Meta напрямую. Проверьте способ оплаты в WhatsApp-аккаунте. Агент продолжает отвечать.',
    waUnavailable: 'Счётчик сейчас недоступен',
    waKpiLabel: 'Бесплатных ответов WhatsApp',
    waKpiSub: (l) => `из ${l.toLocaleString('ru-RU')} в этом месяце · примерно, по всем WhatsApp-диалогам агента`,

    lapsedTitle: 'Продлите Про, чтобы агент снова отвечал',
    lapsedText: 'Пока тариф не продлён, агент не отвечает клиентам и ничего не списывает, но их новые сообщения сохраняются — диалоги доступны для чтения. После продления агент заработает сам — настраивать заново не нужно.',
    lapsedNoAgentsText: 'Тариф Про закончился. Продлите его, чтобы снова создавать агентов и отвечать клиентам в WhatsApp, Instagram, Telegram и на сайте.',
    lapsedCta: 'Продлить Про',
    lapsedDialogsLink: 'Открыть диалоги (только чтение)',

    dialogsTitle: 'Диалоги',
    dialogsSubtitle: 'Живая переписка с клиентами по всем каналам — перехватите диалог, просто ответив',
    dialogsSubtitleReadOnly: 'Переписка с клиентами по всем каналам — только чтение',
  },

  kk: {
    pageTitle: 'Жаңа агент',
    stepLabels: ['Құру', 'Арна', 'Бизнес туралы', 'Тексеру', 'Іске қосу'],
    stepOf: (s, t) => `Қадам ${s} / ${t}`,
    next: 'Әрі қарай',
    back: 'Артқа',
    fineTuneLink: 'Қосымша баптаулар',
    fineTuneText: 'Үн, мақсат, қандай деректер жинау керек және қалғаны — агент параметрлерінде. Бәрі әдепкі бойынша толтырылған.',
    saveError: 'Сақтау мүмкін болмады. Қайталап көріңіз.',
    loadError: 'Агентті жүктеу мүмкін болмады. Бетті жаңартыңыз.',

    step0Title: 'AI-агент құрайық',
    step0Text: 'Агент бірден пайда болады, бірақ клиенттерге соңғы қадамдағы «Іске қосу» батырмасынан кейін ғана жауап бере бастайды.',
    createButton: 'Агент құру',
    creating: 'Құрылуда…',
    createError: 'Агентті құру мүмкін болмады. Қайталап көріңіз.',

    step1Title: 'Агент қай жерде жауап береді?',
    step1Text: 'Арнаны қосыңыз. Агент әзірге өшірулі — іске қосылғанға дейін клиенттер ештеңе алмайды.',
    laterLink: 'Кейін қосамын — алдымен сынақ чатында тексеремін',
    channelConnectedNote: 'Арна қосылды. Енді агентке бизнесіңіз туралы айтып беріңіз.',
    instagramConnected: 'Instagram қосылды',

    step2Title: 'Бизнесіңіз туралы айтып беріңіз',
    step2Text: 'Агент сіз туралы тек осыны біледі. Неғұрлым нақты жазсаңыз, жауаптар соғұрлым дәл болады.',
    nameLabel: 'Атауы — агент өзін осы атпен таныстырады',
    descLabel: 'Бизнес туралы',
    descPlaceholder: 'Мысалы: «Алматыдағы „Дән“ кофеханасы. Капучино 1 200 ₸, латте 1 400 ₸, круассан 900 ₸-ден. Қала бойынша Яндекс арқылы жеткізу — 30 минуттан. Күн сайын 8:00-ден 22:00-ге дейін жұмыс істейміз.»',
    descMore: (n) => `Тағы ${n} таңба: не сатасыз, бағалар, жеткізу, жұмыс кестесі`,
    descEnough: 'Агент нақты жауап беруі үшін жеткілікті',
    kaspiCardTitle: 'Kaspi Bot-тағы тауарлар',
    kaspiCardText: (s) => `Бағалар мен қолда бар-жоғын агент «${s}» дүкенінен алады — әр тауарды сипаттаудың қажеті жоқ.`,
    kaspiStoreLabel: 'Дүкен',

    step3Title: 'Агенттің қалай жауап беретінін тексеріңіз',
    step3Text: 'Клиент ретінде жазыңыз немесе дайын сұрақты басыңыз. ИИ жауабының бағасы нақты арнадағыдай.',
    suggestions: ['Бағасы қанша?', 'Жеткізу бар ма?', 'Менеджерді шақырыңызшы'],

    step4Title: 'Іске қосу',
    channelsLabel: 'Арналар',
    noChannelYet: 'Арна қосылмаған',
    balanceLabel: 'Әмиян балансы',
    balanceEnough: (n) => `шамамен ${n} жауапқа жетеді`,
    lowBalance: 'Баланс болмаса, клиент тек «Жақында жауап береміз» деген дайын хабарды алады',
    topUp: 'Толтыру',
    modeTitle: 'Клиенттерге қалай жауап беру керек',
    modeActive: 'Клиенттерге бірден жауап беру',
    modeActiveHint: 'Агент өзі, лезде жауап береді. Барлық жауап «Диалогтар» бөлімінде көрінеді.',
    modeTraining: 'Алдымен жауаптарды маған көрсету',
    modeTrainingHint: 'Әр жауап «Тексеруге» бөлімінде сіздің мақұлдауыңызды күтеді.',
    modeTrainingWarn: 'WhatsApp-та клиент хабарынан кейін тек 24 сағат ішінде жауап беруге болады — мақұлдап үлгермесеңіз, жауап енді кетпейді. Сайттағы чат бәрібір бірден жауап береді: келуші бетте күтіп отыр.',
    launchButton: 'Іске қосу',
    launching: 'Іске қосылуда…',
    launchNeedsChannel: 'Кемінде бір арнаны қосыңыз — онсыз агенттің жауап беретін жері жоқ.',
    launchNeedsBusiness: 'Алдымен агентке бизнесіңіз туралы айтып беріңіз — кемінде 80 таңба, немесе Kaspi Bot-ты қосыңыз.',
    descReachedShort: (m) => `Сипаттама ${m} таңбадан қысқа`,
    toChannelStep: 'Арнаны қосу',
    launchError: 'Іске қосу мүмкін болмады. Қайталап көріңіз.',

    draftBadge: 'Жоба',
    continueSetup: 'Баптауды жалғастыру',

    waTitle: 'WhatsApp тегін жауаптары',
    waUsageLine: (u, l) => `Осы айда: ${u.toLocaleString('ru-RU')} / ${l.toLocaleString('ru-RU')} тегін жауап`,
    waResets: 'айдың 1-күні нөлденеді',
    waApprox: 'шамамен, агенттің барлық WhatsApp диалогтары бойынша',
    waApproxHint: 'Агенттің барлық WhatsApp диалогтарындағы жауаптары мен таратылымдары есептеледі — нөмірі бірнешеу болса, сан ортақ. Meta лимитті әр нөмірге бөлек және өз уақыты бойынша есептейді, сондықтан сан шамамен.',
    waOver: 'Лимиттен тыс ≈ $0.018 бір хабарламаға — Meta-ға тікелей төлейсіз. WhatsApp аккаунтындағы төлем тәсілін тексеріңіз. Агент жауап беруін тоқтатпайды.',
    waUnavailable: 'Есептегіш қазір қолжетімсіз',
    waKpiLabel: 'WhatsApp тегін жауаптары',
    waKpiSub: (l) => `осы айда ${l.toLocaleString('ru-RU')} ішінен · шамамен, агенттің барлық WhatsApp диалогтары бойынша`,

    lapsedTitle: 'Агент қайта жауап беруі үшін Про тарифін ұзартыңыз',
    lapsedText: 'Тариф ұзартылмайынша агент клиенттерге жауап бермейді және ештеңе есептен шығармайды, бірақ олардың жаңа хабарлары сақталады — диалогтарды оқуға болады. Ұзартқаннан кейін агент өзі қайта жұмыс істейді — қайта баптаудың қажеті жоқ.',
    lapsedNoAgentsText: 'Про тарифі аяқталды. Агенттерді қайта құру және клиенттерге WhatsApp, Instagram, Telegram мен сайтта жауап беру үшін оны ұзартыңыз.',
    lapsedCta: 'Про-ны ұзарту',
    lapsedDialogsLink: 'Диалогтарды ашу (тек оқу)',

    dialogsTitle: 'Диалогтар',
    dialogsSubtitle: 'Барлық арна бойынша клиенттермен жанды хат алмасу — жай ғана жауап беріп, диалогты өзіңізге алыңыз',
    dialogsSubtitleReadOnly: 'Барлық арна бойынша клиенттермен хат алмасу — тек оқу',
  },

  en: {
    pageTitle: 'New agent',
    stepLabels: ['Create', 'Channel', 'Business', 'Test', 'Launch'],
    stepOf: (s, t) => `Step ${s} of ${t}`,
    next: 'Next',
    back: 'Back',
    fineTuneLink: 'Fine-tuning',
    fineTuneText: 'Tone, goal, which details to collect and the rest live in the agent’s settings. Everything already has sensible defaults.',
    saveError: 'Could not save. Please try again.',
    loadError: 'Could not load the agent. Refresh the page.',

    step0Title: 'Let’s create your AI agent',
    step0Text: 'The agent is created right away, but it starts replying to customers only after you press “Launch” on the last step.',
    createButton: 'Create agent',
    creating: 'Creating…',
    createError: 'Could not create the agent. Please try again.',

    step1Title: 'Where will the agent reply?',
    step1Text: 'Connect a channel. The agent is still off — customers get nothing until you launch it.',
    laterLink: 'I’ll connect later — let me try the test chat first',
    channelConnectedNote: 'Channel connected. Next, tell the agent about your business.',
    instagramConnected: 'Instagram connected',

    step2Title: 'Tell us about your business',
    step2Text: 'This is all the agent knows about you. The more specific, the more accurate its replies.',
    nameLabel: 'Name — the agent introduces itself with it',
    descLabel: 'About the business',
    descPlaceholder: 'For example: “Zerno coffee shop in Almaty. Cappuccino 1,200 ₸, latte 1,400 ₸, croissants from 900 ₸. City delivery via Yandex from 30 minutes. Open daily 8:00–22:00.”',
    descMore: (n) => `${n} more ${n === 1 ? 'character' : 'characters'}: what you sell, prices, delivery, hours`,
    descEnough: 'Enough for the agent to give useful answers',
    kaspiCardTitle: 'Products from Kaspi Bot',
    kaspiCardText: (s) => `The agent takes prices and stock from the “${s}” store — no need to describe every product.`,
    kaspiStoreLabel: 'Store',

    step3Title: 'Check how the agent replies',
    step3Text: 'Write as a customer or tap a ready-made question. An AI reply costs the same as in a live channel.',
    suggestions: ['How much is it?', 'Do you deliver?', 'Can I talk to a manager?'],

    step4Title: 'Launch',
    channelsLabel: 'Channels',
    noChannelYet: 'No channel connected',
    balanceLabel: 'Wallet balance',
    balanceEnough: (n) => `enough for about ${n} replies`,
    lowBalance: 'With no balance, customers only get the canned “We’ll reply soon” message',
    topUp: 'Top up',
    modeTitle: 'How to reply to customers',
    modeActive: 'Reply to customers right away',
    modeActiveHint: 'The agent replies on its own, instantly. Every reply is visible under Conversations.',
    modeTraining: 'Show replies to me first',
    modeTrainingHint: 'Each reply waits for your approval under To review.',
    modeTrainingWarn: 'WhatsApp only allows a reply within 24 hours of the customer’s message — if you don’t approve in time, the reply can no longer be sent. The website chat still replies right away: the visitor is waiting on the page.',
    launchButton: 'Launch',
    launching: 'Launching…',
    launchNeedsChannel: 'Connect at least one channel — without it the agent has nowhere to reply.',
    launchNeedsBusiness: 'First tell the agent about your business — at least 80 characters, or connect Kaspi Bot.',
    descReachedShort: (m) => `The description is shorter than ${m} characters`,
    toChannelStep: 'Connect a channel',
    launchError: 'Could not launch. Please try again.',

    draftBadge: 'Draft',
    continueSetup: 'Continue setup',

    waTitle: 'Free WhatsApp replies',
    waUsageLine: (u, l) => `${u.toLocaleString('en-US')} of ${l.toLocaleString('en-US')} free this month`,
    waResets: 'resets on the 1st',
    waApprox: 'approximate, across all of this agent’s WhatsApp chats',
    waApproxHint: 'Counts the agent’s replies and broadcasts across all of this agent’s WhatsApp chats — if it has several numbers, the figure is combined. Meta counts the limit per number and by its own clock, so the figure is approximate.',
    waOver: 'Over the limit ≈ $0.018 per message — you pay Meta directly. Check the payment method in your WhatsApp account. The agent keeps replying.',
    waUnavailable: 'The counter is unavailable right now',
    waKpiLabel: 'Free WhatsApp replies',
    waKpiSub: (l) => `of ${l.toLocaleString('en-US')} this month · approximate, across all of the agent’s WhatsApp chats`,

    lapsedTitle: 'Renew Pro so the agent replies again',
    lapsedText: 'Until the plan is renewed, the agent doesn’t reply to customers and charges nothing, but their new messages are saved — conversations stay readable. Once you renew, the agent starts working again on its own — no need to set it up again.',
    lapsedNoAgentsText: 'Your Pro plan has expired. Renew it to create agents again and reply to customers on WhatsApp, Instagram, Telegram and your website.',
    lapsedCta: 'Renew Pro',
    lapsedDialogsLink: 'Open conversations (read-only)',

    dialogsTitle: 'Conversations',
    dialogsSubtitle: 'Live conversations with customers across every channel — take over a conversation just by replying',
    dialogsSubtitleReadOnly: 'Conversations with customers across every channel — read-only',
  },
}
