// Единое место для чисел и списков страниц про комиссии и доставку Kaspi Магазина
// (раздел /guides, страницы K1-K8). Все значения взяты ТОЛЬКО из проверенных
// источников и несут дату сверки. Менять числа можно лишь после новой сверки с
// первичным источником (см. KASPI_SOURCES), иначе страницы начнут врать.
//
// Что подтверждено (сверено 23.10.2026):
//   - в таблице тарифов Магазина всего три уровня ставки: 7,3% (6,4% без НДС),
//     12,5% (10,9%) и 15,5% (13,5%);
//   - списки строк ниже скопированы из PDF Kaspi дословно (названия строк как в
//     таблице), число строк сверено с таблицей;
//   - тарифы доставки: страница Kaspi q2288, действуют с 01.01.2026.
// Ничего сверх этого сюда не добавлять (красная цена, расходы на упаковку,
// налоги ИП и т.п. НЕ сверялись).

import { KASPI_TARIFF_CHECKED, KASPI_TARIFF_EFFECTIVE } from './seoLaunch'

// Даты живут в seoLaunch.ts (общий источник для всех SEO-страниц), здесь только
// их печатный вид "дд.мм.гггг".
export { KASPI_TARIFF_CHECKED, KASPI_TARIFF_EFFECTIVE }

function dottedDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Дата сверки с Kaspi в том виде, в каком её печатаем на страницах: 23.10.2026. */
export const KASPI_TARIFF_CHECKED_TEXT = dottedDate(KASPI_TARIFF_CHECKED)
/** С какой даты действует таблица (название документа Kaspi и страница q4471): 05.01.2026. */
export const KASPI_TARIFF_EFFECTIVE_TEXT = dottedDate(KASPI_TARIFF_EFFECTIVE)

export type KaspiTierId = 'low' | 'base' | 'high'

export type KaspiTier = {
  id: KaspiTierId
  /** Комиссия с НДС, %: именно её удерживают от цены продажи. */
  withVat: number
  /** Комиссия без НДС, %: так Kaspi показывает ставку с 05.01.2026. */
  withoutVat: number
}

export const KASPI_TIERS: Record<KaspiTierId, KaspiTier> = {
  low: { id: 'low', withVat: 7.3, withoutVat: 6.4 },
  base: { id: 'base', withVat: 12.5, withoutVat: 10.9 },
  high: { id: 'high', withVat: 15.5, withoutVat: 13.5 },
}

export const KASPI_TIER_ORDER: KaspiTierId[] = ['low', 'base', 'high']

export type KaspiSourceId =
  | 'pdf'
  | 'q1344'
  | 'q2288'
  | 'q3733'
  | 'q3734'
  | 'q4467'
  | 'q4471'
  | 'q4495'
  | 'q4521'
  | 'q1347'
  | 'q4586'

export type KaspiSource = {
  id: KaspiSourceId
  /** Адрес русской версии. */
  url: string
  /** Адрес казахской версии страницы Kaspi (для PDF совпадает: файл один, на русском). */
  urlKk: string
  /** Дата, которую страница Kaspi показывает у себя ("Обновлен ..."), если есть. */
  pageUpdated: string | null
  ru: string
  kk: string
}

const GUIDE_RU = 'https://guide.kaspi.kz/partner/ru/'
const GUIDE_KK = 'https://guide.kaspi.kz/partner/kz/'
const PDF_URL =
  'https://guide.kaspi.kz/cdn/content/pay/product/documents/Magazin/Tarify_Magazina_na_Kaspi_kz_2026.pdf'

function page(id: KaspiSourceId, path: string, pageUpdated: string, ru: string, kk: string): KaspiSource {
  return { id, url: GUIDE_RU + path, urlKk: GUIDE_KK + path, pageUpdated, ru, kk }
}

export const KASPI_SOURCES: Record<KaspiSourceId, KaspiSource> = {
  pdf: {
    id: 'pdf',
    url: PDF_URL,
    urlKk: PDF_URL,
    pageUpdated: null,
    ru: 'Тарифы Магазина на Kaspi.kz с 5 января 2026 года (PDF)',
    kk: 'Тарифы Магазина на Kaspi.kz с 5 января 2026 года (PDF, файл орыс тілінде)',
  },
  q1344: page(
    'q1344',
    'shop/conditions/q1344',
    '06.01.2026',
    'Комиссии за продажи по всем категориям товаров в Магазине на Kaspi.kz',
    'Kaspi.kz-тегі Магазинде барлық тауар санаты бойынша сату үшін комиссия',
  ),
  q2288: page('q2288', 'shop/delivery/shipping/q2288', '16.06.2026', 'Сколько стоит Kaspi Доставка?', 'Kaspi Жеткізу қанша тұрады?'),
  q3733: page(
    'q3733',
    'shop/conditions/q3733',
    '06.01.2026',
    'В Магазине на Kaspi.kz поменялась комиссия за продажи. Это увеличит мои затраты?',
    'Kaspi.kz-тегі Магазинде сатқаны үшін комиссия өзгереді. Бұл шығынымды көбейте ме?',
  ),
  q3734: page(
    'q3734',
    'shop/conditions/q3734',
    '06.01.2026',
    'Почему в Магазине на Kaspi.kz поменялась комиссия за продажи?',
    'Kaspi.kz-тегі Магазинде сатқаны үшін комиссия неге өзгереді?',
  ),
  q4467: page(
    'q4467',
    'shop/conditions/q4467',
    '02.02.2026',
    'Что поменялось в расчете комиссии за продажу в Магазине на Kaspi.kz с 5 января 2026 года?',
    '2026 жылдың 5 қаңтарынан бастап Kaspi.kz-тегі Магазиндегі комиссия қалай өзгереді?',
  ),
  q4471: page(
    'q4471',
    'shop/conditions/q4471',
    '02.02.2026',
    'Когда изменится комиссия за продажи в Магазине на Kaspi.kz?',
    'Kaspi.kz-тегі Магазиннің сату комиссиясы қашан өзгереді?',
  ),
  q4495: page(
    'q4495',
    'shop/conditions/q4495',
    '02.02.2026',
    'В Казахстане изменилась ставка НДС. Я стану платить больше?',
    'Қазақстанда ҚҚС мөлшері өзгеріп жатыр. Мен көбірек төлеймін бе?',
  ),
  q4521: page(
    'q4521',
    'shop/conditions/q4521',
    '02.02.2026',
    'Я не стою на учете по НДС. Моя комиссия будет меньше?',
    'Мен ҚҚС төлеуші ретінде тіркелмегенмін. Менің комиссиям азаяды ма?',
  ),
  q1347: page(
    'q1347',
    'shop/returns/q1347',
    '17.01.2025',
    'Вернет ли Магазин на Kaspi.kz комиссию за продажу, если покупатель оформил возврат?',
    'Сатып алушы тауарды қайтаруды ресімдеді. Kaspi.kz-тегі Магазин сатқаны үшін комиссияны қайтара ма?',
  ),
  q4586: page(
    'q4586',
    'red/conditions/q4586',
    '04.05.2026',
    'Сколько стоит прием оплаты с Kaspi Red+?',
    'Kaspi Red+-пен төлем қабылдау қанша тұрады?',
  ),
}

/** Slug-и всех страниц K1-K8 (каталоги src/app/guides/<slug> и src/app/guides/kk/<slug>). */
export const KASPI_PAGE_SLUGS = [
  'komissiya-kaspi-produkty-pitaniya',
  'komissiya-kaspi-apteka-lekarstva',
  'komissiya-kaspi-tovary-dlya-zhivotnykh',
  'komissiya-kaspi-ukrasheniya',
  'komissiya-kaspi-aksessuary',
  'komissiya-kaspi-aksessuary-dlya-telefonov',
  'tarify-dostavki-kaspi-magazin',
  'komissiya-kaspi-s-nds-i-bez-nds',
] as const

export type KaspiPageSlug = (typeof KASPI_PAGE_SLUGS)[number]

// ---------------------------------------------------------------------------
// Списки строк таблицы Kaspi (дословно из PDF, число строк сверено).
// ---------------------------------------------------------------------------

export const KASPI_FOOD = {
  totalRows: 152,
  subcategories: [
    { name: 'Алкоголь', rows: 20 },
    { name: 'Все для выпечки', rows: 4 },
    { name: 'Готовая еда', rows: 12 },
    { name: 'Замороженные продукты, мороженое', rows: 7 },
    { name: 'Колбасы, сосиски, деликатесы', rows: 3 },
    { name: 'Консервация', rows: 11 },
    { name: 'Крупы, хлопья, макароны', rows: 5 },
    { name: 'Масла, соусы', rows: 7 },
    { name: 'Молочные продукты, яйца', rows: 14 },
    { name: 'Мясо и птица', rows: 6 },
    { name: 'Овощи, фрукты, ягоды, грибы', rows: 5 },
    { name: 'Рыба, морепродукты', rows: 5 },
    { name: 'Сахар и заменители, соль, специи', rows: 6 },
    { name: 'Сладости и выпечка', rows: 17 },
    { name: 'Соевые и растительные продукты', rows: 1 },
    { name: 'Соки, вода, напитки', rows: 8 },
    { name: 'Сублимированная туристическая еда', rows: 2 },
    { name: 'Хлебные изделия', rows: 2 },
    { name: 'Чай, кофе, какао', rows: 6 },
    { name: 'Чипсы, орехи, снэки', rows: 11 },
  ] as { name: string; rows: number }[],
  alcoholRows: [
    'Ингредиенты для приготовления алкоголя',
    'Чача',
    'Игристые вина, шампанское',
    'Вино',
    'Джин',
    'Вермут',
    'Сидр, коктейли',
    'Ром',
    'Виски',
    'Коньяк, бренди',
    'Портвейн',
    'Водка',
    'Ликер',
    'Подарочные наборы алкоголя',
    'Текила',
    'Кальвадос',
    'Абсент, Самбука',
    'Бренди',
    'Настойки и бальзамы',
    'Пиво',
  ] as string[],
  babyFoodRows: [
    'Молочные смеси',
    'Детские соки, компоты, чаи',
    'Детская вода',
    'Детские каши',
    'Детское печенье, батончики, сухарики',
    'Детское пюре',
  ] as string[],
  sportNutritionRows: [
    'Изотоники и энергетические гели',
    'Бутылки для спортсменов',
    'Гейнеры',
    'Контейнеры для спортсменов',
    'Аминокислоты',
    'Тестостероновые бустеры',
    'Креатин',
    'Предтренировочные комплексы для спортсменов',
    'BCAA',
    'Посттренировочные комплексы для спортсменов',
    'Шейкеры для спортсменов',
    'Препараты для укрепления связок и суставов',
    'Детокс комплексы',
    'Протеин',
  ] as string[],
}

export const KASPI_PHARMACY = {
  medicineRows: [
    'Противомикробные препараты',
    'Простуда, насморк, боль в горле',
    'При аллергии',
    'Нервная система',
    'Сердечно-сосудистые',
    'Здоровье глаз',
    'Витаминные препараты',
    'Дезинфицирующие средства',
    'Боль и воспаления',
    'Желудок, кишечник, печень',
    'Лечебные кремы, мази и масла',
    'Эндокринная система, диабет',
    'Кожа, волосы, ногти',
    'Мышцы, кости и суставы',
    'Гинекология и урология',
  ] as string[],
  otherGroups: [
    { name: 'Витамины и БАД', rows: 2 },
    { name: 'Диагностические тесты', rows: 3 },
    { name: 'Лечебное питание и травы', rows: 3 },
    { name: 'Личная гигиена', rows: 10 },
    { name: 'Маски, бинты, шприцы', rows: 15 },
    { name: 'Медицинские приборы', rows: 31 },
    { name: 'Оптика', rows: 6 },
    { name: 'Ортопедия', rows: 10 },
    { name: 'Реабилитация', rows: 14 },
    { name: 'Специальное оборудование', rows: 48 },
    { name: 'Уход за больными', rows: 7 },
  ] as { name: string; rows: number }[],
  otherTotalRows: 149,
}

export const KASPI_PETS = {
  foodRows: [
    { group: 'Гигиена и уход за животными', name: 'Наполнители туалета для животных' },
    { group: 'Для грызунов', name: 'Корма для грызунов' },
    { group: 'Для грызунов', name: 'Лакомства для грызунов' },
    { group: 'Для кошек', name: 'Влажные корма для кошек' },
    { group: 'Для кошек', name: 'Лакомства для кошек' },
    { group: 'Для кошек', name: 'Сухие корма для кошек' },
    { group: 'Для птиц', name: 'Корма для птиц' },
    { group: 'Для птиц', name: 'Лакомства для птиц' },
    { group: 'Для рыб и рептилий', name: 'Корма для рыб и рептилий' },
    { group: 'Для сельскохозяйственных животных', name: 'Комбикорма для сельскохозяйственных животных' },
    { group: 'Для собак', name: 'Влажные корма для собак' },
    { group: 'Для собак', name: 'Лакомства для собак' },
    { group: 'Для собак', name: 'Сухие корма для собак' },
  ] as { group: string; name: string }[],
  otherGroups: [
    { name: 'Аксессуары для животных', rows: 16 },
    { name: 'Ветаптека', rows: 9 },
    { name: 'Гигиена и уход за животными', rows: 10 },
    { name: 'Груминг', rows: 6 },
    { name: 'Для грызунов', rows: 2, names: ['Игрушки для грызунов', 'Клетки и домики для грызунов'] },
    { name: 'Для кошек', rows: 2, names: ['Когтеточки для кошек', 'Игрушки для кошек'] },
    { name: 'Для птиц', rows: 4, names: ['Брудеры для птиц', 'Игрушки для птиц', 'Аксессуары для клеток', 'Клетки и домики для птиц'] },
    { name: 'Для рыб и рептилий', rows: 20 },
    { name: 'Для сельскохозяйственных животных', rows: 24 },
    { name: 'Для собак', rows: 2, names: ['Вольеры и будки', 'Игрушки для собак'] },
  ] as { name: string; rows: number; names?: string[] }[],
  otherTotalRows: 95,
}

export const KASPI_JEWELRY = {
  totalRows: 33,
  groups: [
    { name: 'Браслеты', rows: ['Браслеты', 'Браслеты бижутерные'] },
    { name: 'Броши', rows: ['Броши', 'Броши бижутерные'] },
    { name: 'Запонки и зажимы', rows: ['Запонки и зажимы', 'Запонки и зажимы бижутерные'] },
    { name: 'Колье', rows: ['Колье', 'Колье бижутерные'] },
    { name: 'Кольца', rows: ['Кольца', 'Кольца бижутерные'] },
    { name: 'Комплекты украшений', rows: ['Комплекты бижутерии', 'Комплекты ювелирных украшений'] },
    { name: 'Пирсинг', rows: ['Пирсинг', 'Пирсинг бижутерный'] },
    { name: 'Подвески и шармы', rows: ['Подвески', 'Подвески и шармы бижутерные', 'Шармы'] },
    { name: 'Посуда и сувениры из драгоценных металлов', rows: ['Посуда и сувениры из драгоценных металлов'] },
    { name: 'Серьги', rows: ['Серьги', 'Серьги бижутерные'] },
    { name: 'Украшения', rows: ['Украшения'] },
    { name: 'Украшения на тело', rows: ['Украшения на тело'] },
    { name: 'Цепи', rows: ['Цепи', 'Цепи и бусы бижутерные'] },
    { name: 'Четки', rows: ['Четки', 'Ювелирные четки'] },
    { name: 'Ювелирное оборудование, подставки и фурнитура', rows: ['Подставки и держатели для украшений', 'Средства для чистки ювелирных изделий', 'Фурнитура для украшений', 'Ювелирное оборудование и расходные материалы', 'Ювелирные весы'] },
    { name: 'Ювелирные изделия для волос', rows: ['Ювелирные изделия для волос'] },
    { name: 'Ювелирные ремешки и браслеты для часов', rows: ['Ювелирные ремешки и браслеты для часов'] },
  ] as { name: string; rows: string[] }[],
}

export const KASPI_ACCESSORIES: { group: string; name: string; tier: KaspiTierId }[] = [
  { group: 'Аксессуары для одежды и обуви', name: 'Аксессуары для одежды', tier: 'high' },
  { group: 'Аксессуары для одежды и обуви', name: 'Галстуки и бабочки', tier: 'high' },
  { group: 'Аксессуары для одежды и обуви', name: 'Джиббитсы', tier: 'high' },
  { group: 'Аксессуары для одежды и обуви', name: 'Подтяжки', tier: 'high' },
  { group: 'Аксессуары для одежды и обуви', name: 'Ремни', tier: 'high' },
  { group: 'Зонты, брелоки и портсигары', name: 'Брелоки и ключницы', tier: 'high' },
  { group: 'Зонты, брелоки и портсигары', name: 'Зонты', tier: 'high' },
  { group: 'Зонты, брелоки и портсигары', name: 'Портсигары и аксессуары для зажигалок', tier: 'high' },
  { group: 'Свадебные аксессуары', name: 'Свадебные аксессуары', tier: 'high' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Кошельки и визитницы', tier: 'high' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Обложки для документов', tier: 'high' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Рюкзаки', tier: 'high' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Сумки', tier: 'high' },
  { group: 'Часы', name: 'Ювелирные часы', tier: 'high' },
  { group: 'Шапки, шарфы, перчатки', name: 'Головные уборы', tier: 'high' },
  { group: 'Шапки, шарфы, перчатки', name: 'Перчатки и варежки', tier: 'high' },
  { group: 'Шапки, шарфы, перчатки', name: 'Шарфы и платки', tier: 'high' },
  { group: 'Маски для сна', name: 'Маски для сна', tier: 'base' },
  { group: 'Очки и аксессуары', name: 'Держатели для очков', tier: 'base' },
  { group: 'Очки и аксессуары', name: 'Солнцезащитные очки', tier: 'base' },
  { group: 'Очки и аксессуары', name: 'Уход за очками', tier: 'base' },
  { group: 'Очки и аксессуары', name: 'Футляры для очков', tier: 'base' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Дорожные аксессуары', tier: 'base' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Дорожные сумки', tier: 'base' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Чемоданы', tier: 'base' },
  { group: 'Сумки, чемоданы, кошельки', name: 'Чехлы для чемоданов', tier: 'base' },
  { group: 'Часы', name: 'Карманные часы', tier: 'base' },
  { group: 'Часы', name: 'Ремешки и браслеты для часов', tier: 'base' },
  { group: 'Часы', name: 'Часы наручные', tier: 'base' },
]

export const KASPI_PHONE_ACCESSORIES: { name: string; tier: KaspiTierId }[] = [
  { name: 'Аккумуляторы для телефонов', tier: 'high' },
  { name: 'Вакуумные сепараторы', tier: 'high' },
  { name: 'Держатели для телефонов', tier: 'high' },
  { name: 'Дисплеи для смартфонов', tier: 'high' },
  { name: 'Дополнительное оборудование для смартфонов', tier: 'high' },
  { name: 'Защитные пленки и стекла для смартфонов', tier: 'high' },
  { name: 'Инструменты для обслуживания смартфонов', tier: 'high' },
  { name: 'Кабели и переходники для смартфонов', tier: 'high' },
  { name: 'Наклейки для телефонов', tier: 'high' },
  { name: 'Системы охлаждения для смартфонов', tier: 'high' },
  { name: 'Смарт-линзы для смартфонов', tier: 'high' },
  { name: 'Увеличительные экраны для смартфонов', tier: 'high' },
  { name: 'Чехлы для зарядных устройств и кабелей', tier: 'high' },
  { name: 'Чехлы для смартфонов', tier: 'high' },
  { name: 'Внешние аккумуляторы', tier: 'base' },
  { name: 'Зарядные устройства', tier: 'base' },
]

// Остальные строки категории «Телефоны и гаджеты» (вне «Аксессуаров для телефонов»), все 12,5%.
export const KASPI_GADGET_ROWS_BASE: string[] = [
  'Bluetooth-трекеры',
  'Аккумуляторы для смарт-часов',
  'Аксессуары для раций и радиостанций',
  'Аксессуары для систем нагревания',
  'Дисплеи для смарт-часов и фитнесс браслетов',
  'Зарядные устройства для смарт-часов и фитнес-браслетов',
  'Защитные пленки и стекла для смарт-часов, фитнес-браслетов',
  'Мобильные телефоны',
  'Проводные телефоны',
  'Радиотелефоны',
  'Рации и радиостанции',
  'Ремешки для смарт-часов и фитнес-браслетов',
  'Системы нагревания',
  'Смарт-кольца',
  'Смарт-часы',
  'Смартфоны',
  'Спутниковые телефоны и коммуникаторы',
  'Фитнес-браслеты',
  'Чехлы для смарт-часов и фитнес-браслетов',
  'Чехлы для электронных книг',
  'Электронные книги',
  'Электронные переводчики',
]

export const KASPI_TV_AUDIO = {
  totalRows: 120,
  highRows: ['Чехлы для наушников'],
  baseRows: 119,
}

// ---------------------------------------------------------------------------
// Доставка: страница Kaspi q2288, "Тарифы доставки с 1 января 2026 года (без НДС)",
// колонки Город / Казахстан / Express. Значения в тенге.
// ---------------------------------------------------------------------------

export type KaspiDeliveryRow = {
  id: string
  ru: string
  kk: string
  city: number
  kazakhstan: number
  express: number
}

export const KASPI_DELIVERY_COLUMNS = {
  city: { ru: 'Город', kk: 'Қала' },
  kazakhstan: { ru: 'Казахстан', kk: 'Қазақстан' },
  express: { ru: 'Express', kk: 'Express' },
} as const

export const KASPI_DELIVERY = {
  effectiveText: '01.01.2026',
  /** Граница между двумя блоками таблицы, тенге. */
  thresholdTenge: 10000,
  /** Блок "Сумма заказа до 10 000 ₸": цена зависит от суммы заказа. */
  underThreshold: [
    { id: 'lt1000', ru: 'до 1 000 ₸', kk: '1 000 ₸ дейін', city: 49, kazakhstan: 49, express: 49 },
    { id: '1000-3000', ru: 'от 1 000 до 3 000 ₸', kk: '1 000 теңгеден 3 000 ₸ дейін', city: 149, kazakhstan: 149, express: 149 },
    { id: '3000-5000', ru: 'от 3 000 до 5 000 ₸', kk: '3 000 теңгеден 5 000 ₸ дейін', city: 199, kazakhstan: 199, express: 199 },
    { id: '5000-10000', ru: 'от 5 000 до 10 000 ₸', kk: '5 000 теңгеден 10 000 ₸ дейін', city: 699, kazakhstan: 799, express: 799 },
  ] as KaspiDeliveryRow[],
  /** Блок "Сумма заказа 10 000 ₸ и более": цена зависит от веса. */
  fromThreshold: [
    { id: 'w-to5', ru: 'до 5 кг', kk: '5 кг-ға дейін', city: 1099, kazakhstan: 1299, express: 1699 },
    { id: 'w-5-15', ru: '5-15 кг', kk: '5-15 кг', city: 1349, kazakhstan: 1699, express: 1849 },
    { id: 'w-15-30', ru: '15-30 кг', kk: '15-30 кг', city: 2299, kazakhstan: 3599, express: 3149 },
    { id: 'w-30-60', ru: '30-60 кг', kk: '30-60 кг', city: 2899, kazakhstan: 5649, express: 3599 },
    { id: 'w-60-100', ru: '60-100 кг', kk: '60-100 кг', city: 4149, kazakhstan: 8549, express: 5599 },
    { id: 'w-over100', ru: 'свыше 100 кг', kk: '100 кг-дан астам', city: 6449, kazakhstan: 11999, express: 8449 },
  ] as KaspiDeliveryRow[],
  /** Шины идут отдельными строками внутри того же блока "10 000 ₸ и более". */
  tires: [
    {
      id: 'tire-car',
      ru: 'Легковые шины (до 25 кг за 1 колесо)',
      kk: 'Жеңіл машина шиналары (1 дөңгелек үшін 25 кг-ға дейін)',
      city: 1049,
      kazakhstan: 1649,
      express: 1349,
    },
    {
      id: 'tire-truck',
      ru: 'Грузовые шины (свыше 25 кг за 1 колесо)',
      kk: 'Жүк машинасының шиналары (1 дөңгелек үшін 25 кг-дан астам)',
      city: 4199,
      kazakhstan: 6049,
      express: 5749,
    },
  ] as KaspiDeliveryRow[],
}

export function deliveryRowById(id: string): KaspiDeliveryRow {
  const all = [...KASPI_DELIVERY.underThreshold, ...KASPI_DELIVERY.fromThreshold, ...KASPI_DELIVERY.tires]
  const row = all.find(r => r.id === id)
  if (!row) throw new Error(`Unknown Kaspi delivery row: ${id}`)
  return row
}

// ---------------------------------------------------------------------------
// Форматирование и арифметика. Целые проценты считаем в промилле (7,3% = 73),
// чтобы 10 000 * 7,3% дало ровно 730, а не 730.0000000000001.
// ---------------------------------------------------------------------------

const NBSP = ' '

/** 7.3 -> "7,3%"; 12.5 -> "12,5%". */
export function formatPercent(n: number): string {
  return `${String(n).replace('.', ',')}%`
}

/** 10000 -> "10 000 ₸" (неразрывные пробелы, без дробной части). */
export function formatTenge(n: number): string {
  const sign = n < 0 ? '-' : ''
  const digits = String(Math.abs(Math.round(n)))
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return `${sign}${grouped}${NBSP}₸`
}

/** Число тенге без знака валюты: 1099 -> "1 099". */
export function formatNumber(n: number): string {
  return formatTenge(n).replace(`${NBSP}₸`, '')
}

function permille(ratePercent: number): number {
  return Math.round(ratePercent * 10)
}

/** Комиссия с НДС от суммы продажи, тенге (опубликованная ставка с НДС). */
export function commissionTenge(amountTenge: number, tier: KaspiTierId): number {
  return (amountTenge * permille(KASPI_TIERS[tier].withVat)) / 1000
}

/** Сколько остаётся после комиссии: до доставки, налога и себестоимости. */
export function sellerReceivesTenge(amountTenge: number, tier: KaspiTierId): number {
  return amountTenge - commissionTenge(amountTenge, tier)
}

/**
 * Минимальная цена, при которой после комиссии остаётся netTenge:
 * net / (1 - r), округление вверх до тенге. Без доставки и налога.
 */
export function priceToReceiveTenge(netTenge: number, tier: KaspiTierId): number {
  const keep = 1000 - permille(KASPI_TIERS[tier].withVat)
  return Math.ceil((netTenge * 1000) / keep)
}

export type KaspiExample = {
  tier: KaspiTierId
  amount: number
  ratePercent: number
  commission: number
  receives: number
  /** Целевая сумма на руках и цена, нужная для неё. */
  targetNet: number
  priceForTarget: number
}

export const KASPI_EXAMPLE_AMOUNT = 10000
export const KASPI_EXAMPLE_TARGET_NET = 5000

export function kaspiExample(tier: KaspiTierId, amount = KASPI_EXAMPLE_AMOUNT): KaspiExample {
  return {
    tier,
    amount,
    ratePercent: KASPI_TIERS[tier].withVat,
    commission: commissionTenge(amount, tier),
    receives: sellerReceivesTenge(amount, tier),
    targetNet: KASPI_EXAMPLE_TARGET_NET,
    priceForTarget: priceToReceiveTenge(KASPI_EXAMPLE_TARGET_NET, tier),
  }
}

/**
 * Пример K7: продажа на 10 000 ₸ (блок таблицы "10 000 ₸ и более"), доставка Kaspi
 * по выбранной строке и колонке. Доставка берётся из тарифа БЕЗ НДС: Kaspi
 * списывает её с учётом НДС, но ставку для пересчёта на странице q2288 не
 * называет, поэтому НДС на доставку здесь не пересчитываем.
 */
export function kaspiDeliveryExample(
  tier: KaspiTierId,
  rowId: string,
  column: 'city' | 'kazakhstan' | 'express',
  amount = KASPI_EXAMPLE_AMOUNT,
) {
  const commission = commissionTenge(amount, tier)
  const delivery = deliveryRowById(rowId)[column]
  return { amount, commission, delivery, left: amount - commission - delivery }
}

/** Пара "без НДС" x 1,16, округлённая до сотых: показывает, что пары тарифа не пересчитываются умножением. */
export function withoutVatTimes116(tier: KaspiTierId): number {
  return Math.round(KASPI_TIERS[tier].withoutVat * 1.16 * 100) / 100
}

/** Адрес источника для нужного языка страницы. */
export function kaspiSourceUrl(id: KaspiSourceId, lang: 'ru' | 'kk'): string {
  const s = KASPI_SOURCES[id]
  return lang === 'kk' ? s.urlKk : s.url
}
