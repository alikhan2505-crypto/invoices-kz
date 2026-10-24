// Содержимое /llms.txt (отдаётся маршрутом src/app/llms.txt/route.ts).
// Раньше это был статический public/llms.txt. Файл стал кодом, чтобы разделы про
// страницы комиссий Kaspi и БИК появлялись только при SEO_TARIFF_BIK_LIVE = true
// (src/lib/seoLaunch.ts). При выключенном флаге вывод совпадает с прежним файлом
// посимвольно (это проверяет llmsTxt.test.ts).

import { BIK_BANK_PAGES, NBK_BIK_RETRIEVED, bikBankPath, bikHubPath } from './bikRegistry'
import { KASPI_GUIDES } from './kaspiGuides'
import { guidePath } from './guides'
import { SEO_TARIFF_BIK_LIVE, formatRuDate } from './seoLaunch'

// Всё до раздела "Optional", без завершающего перевода строки.
const HEAD = `# invoices.kz

> invoices.kz — казахстанская онлайн-платформа для ИП и ТОО: счета на оплату, АВР, накладные и коммерческие предложения в PDF с подписью и печатью, оплата через Kaspi Pay прямо в счёте, подписание ЭЦП. Кроме того: Kaspi Bot для продавцов Kaspi Магазина (демпинг цен и заказы) и AI-агент для ответов клиентам в WhatsApp, Instagram и на сайте. Оператор: ИП «First Project», БИН 890525350143, г. Астана, Казахстан. Контакт: mail@invoices.kz. Языки: русский, казахский, английский. Валюта: тенге (₸).

Ключевые факты (актуальные цены и лимиты — на странице тарифов; октябрь 2026):
- Тарифы: Бесплатно — 0 ₸, 3 счёта в месяц; Базовый — 2 990 ₸/мес или 29 900 ₸/год, 30 счетов в месяц; Про — 5 990 ₸/мес или 59 900 ₸/год, безлимитные счета, КП, АВР и накладные, ЭЦП и договоры, Kaspi Bot, AI-агент. Новому аккаунту — пробная неделя тарифа Базовый (до 10 счетов).
- Оплата Kaspi Pay по ссылке в счёте и Kaspi Cashier API: 2% от оплаченной суммы, работает на любом тарифе, списывается с кошелька.
- Бесплатные инструменты работают без регистрации с лимитами по IP: счёт, АВР и накладная — по 3 документа в квартал на каждый инструмент, КП — 3 в квартал, печать накладных Kaspi — 5 склеек в месяц.

## Тарифы и продукты
- [Тарифы и цены](https://docs.invoices.kz/#pricing): Бесплатно, Базовый, Про; оплата за месяц или за год
- [Счета, АВР и КП](https://docs.invoices.kz/): главная страница продукта
- [Kaspi Bot](https://kaspi.invoices.kz/): демпинг цен и заказы Kaspi Магазина, входит в тариф Про
- [AI-агент](https://agent.invoices.kz/): ответы клиентам в WhatsApp, Instagram и на сайте, входит в тариф Про
- [Kaspi Cashier API](https://api.invoices.kz/): приём оплат Kaspi Pay на своём сайте через API
- [Салон](https://salon.invoices.kz/): записи клиентов, мастера, сайт салона

## Бесплатные инструменты
- [Счёт на оплату онлайн](https://invoices.kz/tools/schet)
- [АВР онлайн](https://invoices.kz/tools/avr)
- [Накладная онлайн](https://invoices.kz/tools/nakladnaya)
- [Коммерческое предложение](https://invoices.kz/tools/kp)
- [Калькулятор налогов ИП 2026](https://invoices.kz/tools/nalogi): упрощёнка 4% и взносы за себя
- [Проверка контрагента по БИН](https://invoices.kz/tools/kontragent): реестры КГД и ГБД ЮЛ
- [Калькулятор маржи Kaspi](https://invoices.kz/tools/margin): комиссия Kaspi Магазина по категориям
- [Печать накладных Kaspi одним PDF](https://invoices.kz/tools/waybills)

## Гайды (русский; казахские версии — /guides/kk/<название>)
- [Комиссия Kaspi Магазина по категориям](https://invoices.kz/guides/komissiya-kaspi)
- [Накладные Kaspi одним PDF: печать 4 на А4 или А6](https://invoices.kz/guides/nakladnye-kaspi-odnim-pdf)
- [Налоги ИП на упрощёнке в 2026 году](https://invoices.kz/guides/nalogi-ip-uproshchenka-2026)
- [МРП 2026 в тенге: размер, таблица, лимиты ИП](https://invoices.kz/guides/mrp-2026)
- [ЭСФ в 2026 году: кто обязан выписывать](https://invoices.kz/guides/esf-kazakhstan-2026)
- [Как выставить счёт на оплату для ИП и ТОО](https://invoices.kz/guides/kak-vystavit-schet-ip)
- [Счёт, АВР, накладная и КП: чем отличаются](https://invoices.kz/guides/dokumenty-ip-kazakhstan)
- [Как проверить контрагента по БИН](https://invoices.kz/guides/proverka-kontragenta)
- [Пеня за просрочку оплаты](https://invoices.kz/guides/penya-za-prosrochku)
- [Как открыть ИП в 2026 году](https://invoices.kz/guides/kak-otkryt-ip-2026)`

// Раздел "Optional" до конца файла.
const OPTIONAL = `## Optional
- [Тарифы в Markdown](https://invoices.kz/pricing.md)
- [Политика конфиденциальности](https://invoices.kz/privacy)
- [Условия сервиса](https://invoices.kz/terms)
- [Удаление аккаунта и данных](https://invoices.kz/data-deletion)
- [Карта сайта](https://invoices.kz/sitemap.xml)
`

function kaspiLines(): string[] {
  return KASPI_GUIDES.map(g => `- [${g.ru.title}](https://invoices.kz${guidePath(g.slug, 'ru')})`)
}

function bikSection(): string {
  const bankLines = BIK_BANK_PAGES.map(
    r =>
      `- [БИК ${r.label}: ${r.bik}](https://invoices.kz${bikBankPath(r.slug!, 'ru')}); казахская версия: https://invoices.kz${bikBankPath(r.slug!, 'kk')}`,
  )
  return [
    '## БИК банков РК',
    `- [Справочник БИК банков Казахстана](https://invoices.kz${bikHubPath('ru')}): 33 строки справочника Национального Банка, получено ${formatRuDate(NBK_BIK_RETRIEVED)}; казахская версия: https://invoices.kz${bikHubPath('kk')}`,
    ...bankLines,
  ].join('\n')
}

/** Текст /llms.txt. `live` по умолчанию берётся из флага запуска; параметр нужен тестам. */
export function buildLlmsTxt(live: boolean = SEO_TARIFF_BIK_LIVE): string {
  if (!live) return `${HEAD}\n\n${OPTIONAL}`
  return [`${HEAD}\n${kaspiLines().join('\n')}`, bikSection(), OPTIONAL].join('\n\n')
}
