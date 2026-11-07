import type { Lang } from '@/components/LanguageProvider'

// Стена «Доступно на тарифе Про» для Kaspi Bot (17.10.2026). Для AI-агента
// такая же стена живёт в aiAgent.ts / aiAgentSetup.ts; общий вид -- ProGateCard.
export type ProGateDict = {
  title: string
  text: string
  cta: string
  lapsedTitle: string
  lapsedText: string
  lapsedCta: string
  // Что человек получает и что будет дальше (07.11.2026, прогон воронки Kaspi: на стене не было ни цены,
  // ни слова про кошелёк и следующий шаг). Цену подставляет вызывающий из PLAN_PRICES.
  facts: (price: string) => string[]
}

export const kaspiProGateDict: Record<Lang, ProGateDict> = {
  ru: {
    title: 'Доступно на тарифе Про',
    text: 'Kaspi Bot следит за ценами конкурентов и сам подстраивает цены в вашем Kaspi Магазине, а ещё собирает заказы, возвраты, финансы и ниши в одном месте. Перейдите на Про, чтобы подключить магазин.',
    cta: 'Перейти на Про',
    lapsedTitle: 'Продлите Про, чтобы Kaspi Bot снова работал',
    lapsedText: 'Пока тариф не продлён, Kaspi Bot не меняет цены в вашем магазине, а разделы закрыты. После продления доступ вернётся.',
    lapsedCta: 'Продлить Про',
    facts: (price) => [
      `Тариф Про: ${price} в месяц. В него входит весь кабинет магазина Kaspi.`,
      'Проверки цен бесплатны. 5 ₸ из кошелька берётся только за каждое изменение цены ботом.',
      'После оплаты подключите магазин по SMS от Kaspi: пароль от кабинета мы не видим.',
    ],
  },
  kk: {
    title: 'Про тарифінде қолжетімді',
    text: 'Kaspi Bot бәсекелестердің бағасын қадағалап, Kaspi Магазиндегі бағаларыңызды өзі түзетеді, сонымен қатар тапсырыстарды, қайтарымдарды, қаржы мен ништерді бір жерге жинайды. Дүкенді қосу үшін Про тарифіне өтіңіз.',
    cta: 'Про тарифіне өту',
    lapsedTitle: 'Kaspi Bot қайта жұмыс істеуі үшін Про тарифін ұзартыңыз',
    lapsedText: 'Тариф ұзартылмайынша, Kaspi Bot дүкеніңіздегі бағаларды өзгертпейді, ал бөлімдер жабық болады. Ұзартқаннан кейін қолжетімділік қайтады.',
    lapsedCta: 'Проны ұзарту',
    facts: (price) => [
      `Про тарифі: айына ${price}. Kaspi дүкенінің бүкіл кабинеті кіреді.`,
      'Баға тексеру тегін. Әмияннан 5 ₸ тек бот бағаны әр өзгерткенде алынады.',
      'Төлегеннен кейін дүкенді Kaspi SMS-і арқылы қосасыз: кабинет құпиясөзін біз көрмейміз.',
    ],
  },
  en: {
    title: 'Available on the Pro plan',
    text: 'Kaspi Bot watches competitor prices and adjusts the prices in your Kaspi store for you, and keeps orders, returns, finances and niches in one place. Upgrade to Pro to connect your store.',
    cta: 'Upgrade to Pro',
    lapsedTitle: 'Renew Pro to get Kaspi Bot working again',
    lapsedText: 'Until the plan is renewed, Kaspi Bot does not change the prices in your store and the sections are closed. Access returns once you renew.',
    lapsedCta: 'Renew Pro',
    facts: (price) => [
      `Pro plan: ${price} per month. It includes the whole Kaspi store cabinet.`,
      'Price checks are free. 5 ₸ is taken from the wallet only for each price change made by the bot.',
      'After paying, connect your store with an SMS code from Kaspi: we never see your cabinet password.',
    ],
  },
}

// Общие слова Про-замков кабинета (<ProGate>, <ProGateBanner>): ОДИН заголовок
// и ОДНА подпись кнопки вместо пяти разных у documents/templates/acquiring/
// contracts/signature. Пояснение страницы передаёт сама. Цена идёт отдельной
// приглушённой строкой и берётся из PLAN_PRICES (price подставляет вызывающий).
export type ProGateCtaDict = { title: string; cta: string; priceLine: (price: string) => string }

export const proGateCtaDict: Record<Lang, ProGateCtaDict> = {
  ru: { title: 'Доступно на тарифе Про', cta: 'Перейти к тарифам', priceLine: (p) => `Про: ${p} в месяц` },
  kk: { title: 'Про тарифінде қолжетімді', cta: 'Тарифтерге өту', priceLine: (p) => `Про: айына ${p}` },
  en: { title: 'Available on the Pro plan', cta: 'View plans', priceLine: (p) => `Pro: ${p} per month` },
}

// Одна строка «тариф закончился» на дашборде и в профиле (P2-16, 17.10.2026):
// у кого Про только что истёк, там раньше стояло просто «Бесплатный».
export type LapsedNoticeDict = {
  pro: (date: string) => string
  basic: (date: string) => string
  cta: string
}

export const lapsedNoticeDict: Record<Lang, LapsedNoticeDict> = {
  ru: { pro: (d) => `Про истёк ${d}`, basic: (d) => `Базовый тариф истёк ${d}`, cta: 'Продлить' },
  kk: { pro: (d) => `Про тарифі ${d} аяқталды`, basic: (d) => `Базалық тариф ${d} аяқталды`, cta: 'Ұзарту' },
  en: { pro: (d) => `Pro expired on ${d}`, basic: (d) => `Basic plan expired on ${d}`, cta: 'Renew' },
}
