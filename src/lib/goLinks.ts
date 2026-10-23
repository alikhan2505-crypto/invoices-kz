// Короткие ссылки invoices.kz/go/<код> для постов, чатов и рекламы (17.10.2026).
// Один код = один адрес на странице бесплатного инструмента с готовой UTM-меткой:
// метку не надо набирать руками, а перепутать источник в аналитике нельзя.
//
// Таблица живёт в коде, расширять — просто добавить строку в GO_LINKS. Редиректы
// собирает next.config.ts (goRedirects), то есть /go/<код> отвечает ещё до
// отрисовки страницы и без запроса к базе. permanent: false (307) — браузеры не
// кешируют, поэтому цель можно поменять в любой момент, не меняя напечатанную
// или опубликованную ссылку. Как и у /car, /qr.
//
// Метки (договорённость плана трафика от 15.10):
//   чат-пост        tg_<чат> / chat_post   / <инструмент>_oct
//   ответ в чате    tg_<чат> / chat_reply  / <инструмент>_reply
//   платный пост    sellers_kz / paid_post / <инструмент>_oct
//   органика        ig | tiktok / organic_social / …
//   рекламные ролики meta / paid_reels / …
//   личные сообщения dm / outreach / …
// Параметры, которые человек добавит к ссылке сам, Next передаёт дальше.
//
// Дальше метки читают сами страницы: tool_events (события инструментов) и
// site_visits (лендинги) — /admin → «Инструменты».

export interface GoUtm {
  source: string
  medium: string
  campaign: string
}

export interface GoLink {
  /** Код в адресе: invoices.kz/go/<code>. Строчные латинские буквы, цифры, дефис. */
  code: string
  /** Куда ведёт: путь на invoices.kz (страница обязана существовать). */
  path: string
  utm: GoUtm
  /** Для кого/зачем ссылка — подсказка тому, кто добавляет строки. */
  note: string
}

const link = (code: string, path: string, source: string, medium: string, campaign: string, note: string): GoLink =>
  ({ code, path, utm: { source, medium, campaign }, note })

export const GO_LINKS: readonly GoLink[] = [
  // Ссылки в чатах Telegram: пост про инструмент.
  link('nakladnye', '/tools/waybills', 'tg_chat', 'chat_post', 'waybills_oct', 'пост в чате продавцов: склейка накладных Kaspi'),
  link('marzha', '/tools/margin', 'tg_chat', 'chat_post', 'margin_oct', 'пост в чате продавцов: калькулятор маржи Kaspi'),
  // Ответы людям в чатах: инструмент под вопрос.
  link('kontragent', '/tools/kontragent', 'tg_chat', 'chat_reply', 'kontragent_reply', 'ответ в чате: проверка контрагента по БИН'),
  link('schet', '/tools/schet', 'tg_chat', 'chat_reply', 'schet_reply', 'ответ в чате: счёт на оплату'),
  link('kp', '/tools/kp', 'tg_chat', 'chat_reply', 'kp_reply', 'ответ в чате: коммерческое предложение'),
  link('nalogi', '/tools/nalogi', 'tg_chat', 'chat_reply', 'nalogi_reply', 'ответ в чате: налоги ИП'),
  // Платный пост в Sellers.kz.
  link('sellers-nakladnye', '/tools/waybills', 'sellers_kz', 'paid_post', 'waybills_oct', 'платный пост Sellers.kz про склейку'),
  link('sellers-marzha', '/tools/margin', 'sellers_kz', 'paid_post', 'margin_oct', 'платный пост Sellers.kz про маржу'),
  // Органика в Instagram.
  link('ig-nakladnye', '/tools/waybills', 'ig', 'organic_social', 'waybills_oct', 'Instagram (органика): склейка'),
  link('ig-marzha', '/tools/margin', 'ig', 'organic_social', 'margin_oct', 'Instagram (органика): маржа'),
  // Платные ролики Reels.
  link('reels-nakladnye', '/tools/waybills', 'meta', 'paid_reels', 'waybills_oct', 'платные Reels: склейка'),
  link('reels-marzha', '/tools/margin', 'meta', 'paid_reels', 'margin_oct', 'платные Reels: маржа'),
  // Личные сообщения продавцам (Instagram, 2ГИС, WhatsApp).
  link('dm', '/tools/waybills', 'dm', 'outreach', 'waybills_oct', 'личные сообщения продавцам Kaspi'),
  // Instagram (недели 3–4 плана 23.10.2026): шапка профиля и ссылка-стикер в Stories.
  link('ig-schet', '/tools/schet', 'ig', 'organic_social', 'schet_oct', 'Instagram (органика): счёт на оплату'),
  link('ig-nalogi', '/tools/nalogi', 'ig', 'organic_social', 'nalogi_oct', 'Instagram (органика): налоги ИП'),
  // Личные сообщения: ответ на кодовое слово из ролика (БИН, НАЛОГИ, КОМИССИЯ, ПЕНЯ).
  link('dm-marzha', '/tools/margin', 'dm', 'outreach', 'margin_oct', 'личные сообщения: ответ на слово МАРЖА'),
  link('dm-kontragent', '/tools/kontragent', 'dm', 'outreach', 'kontragent_oct', 'личные сообщения: ответ на слово БИН'),
  link('dm-nalogi', '/tools/nalogi', 'dm', 'outreach', 'nalogi_oct', 'личные сообщения: ответ на слово НАЛОГИ'),
  link('dm-gid-komissiya', '/guides/komissiya-kaspi', 'dm', 'outreach', 'komissiya_oct', 'личные сообщения: ответ на слово КОМИССИЯ'),
  link('dm-gid-penya', '/guides/penya-za-prosrochku', 'dm', 'outreach', 'penya_oct', 'личные сообщения: ответ на слово ПЕНЯ'),
]

export const GO_PREFIX = '/go'
// Куда уходит неизвестный код: главная без метки (метка «неизвестная ссылка»
// испортила бы разбивку заходов на лендинг).
export const GO_FALLBACK = '/'

const CODE_RE = /^[a-z0-9-]+$/

/** Адрес назначения с UTM: /tools/waybills?utm_source=…&utm_medium=…&utm_campaign=… */
export function goDestination(l: GoLink): string {
  const q = new URLSearchParams({ utm_source: l.utm.source, utm_medium: l.utm.medium, utm_campaign: l.utm.campaign })
  return `${l.path}?${q.toString()}`
}

/** Код (регистр не важен) → ссылка из таблицы, иначе null. */
export function findGoLink(code: string): GoLink | null {
  const c = code.trim().toLowerCase()
  if (!CODE_RE.test(c)) return null
  return GO_LINKS.find(l => l.code === c) ?? null
}

/** Куда ведёт /go/<code>: адрес с UTM, а для неизвестного кода — главная. */
export function resolveGo(code: string): string {
  const l = findGoLink(code)
  return l ? goDestination(l) : GO_FALLBACK
}

type Redirect = { source: string; destination: string; permanent: false }

/** Для redirects() в next.config.ts: по строке на код + общая строка для остальных. */
export function goRedirects(): Redirect[] {
  return [
    ...GO_LINKS.map(l => ({ source: `${GO_PREFIX}/${l.code}`, destination: goDestination(l), permanent: false as const })),
    // Неизвестный код (и сам /go) — на главную; ставится после точных, порядок важен.
    { source: `${GO_PREFIX}/:code*`, destination: GO_FALLBACK, permanent: false as const },
  ]
}
