import type { Lang } from '@/components/LanguageProvider'

// Публичная витрина продавца (/shop/[slug], оптовый каталог, корзина, оплата)
// на трёх языках. Названия товаров, цвета, размеры и тексты, которые продавец
// написал сам (история, доставка, разделы), приходят как есть и сюда не
// попадают — переводится только «рамка» витрины.

export interface StorefrontContent {
  // Состояния страницы
  loading: string
  unavailable: string
  unavailableHint: string
  notFound: string
  modelNotFound: string
  // Шапка / переключатель языка
  langSwitchLabel: string
  // Лендинг продавца
  landingHistory: string
  landingCapacity: string
  landingAnnualVolume: string
  goToCatalog: string
  // Розничная витрина
  delivery: string
  noProducts: string
  otherCategory: string
  addToCart: string
  decreaseQty: string
  increaseQty: string
  cartBar: (count: number) => string
  checkoutCta: string
  yourOrder: string
  close: string
  orderPaid: string
  payViaKaspi: (amount: string) => string
  waitingPayment: string
  total: string
  namePlaceholder: string
  phonePlaceholder: string
  addressPlaceholder: string
  submitting: string
  placeAndPay: string
  // Оптовый каталог
  allCategories: string
  noModels: string
  backToCatalog: string
  color: string
  size: string
  inStock: (count: number) => string
  customOrderAvailable: string
  added: string
  orderCustom: string
  customOrderTag: string
  yourRequest: string
  companyNamePlaceholder: string
  binPlaceholder: string
  emailPlaceholder: string
  phoneOptionalPlaceholder: string
  submitRequest: string
  // Ошибки, которые видит покупатель
  errors: {
    orderFailed: string
    paymentFailed: string
    network: string
    fillContacts: string
    cartEmpty: string
    tooManyOrders: string
    itemsGone: string
    productUnavailable: string
    requestFailed: string
    companyRequired: string
    binInvalid: string
    emailRequired: string
    sellerLimit: string
    storeClosed: string
  }
}

export type StorefrontErrorKey = keyof StorefrontContent['errors']

// «1 товар, 2 товара, 5 товаров, 11 товаров, 21 товар»
export function ruItemsWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'товар'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'товара'
  return 'товаров'
}

export const storefrontDict: Record<Lang, StorefrontContent> = {
  ru: {
    loading: 'Загрузка…',
    unavailable: 'Магазин временно недоступен',
    unavailableHint: 'Загляните чуть позже.',
    notFound: 'Витрина не найдена',
    modelNotFound: 'Модель не найдена',
    langSwitchLabel: 'Язык',
    landingHistory: 'История',
    landingCapacity: 'Мощности',
    landingAnnualVolume: 'Годовые объёмы',
    goToCatalog: 'Перейти в каталог →',
    delivery: 'Доставка',
    noProducts: 'Пока нет товаров в наличии',
    otherCategory: 'Другое',
    addToCart: 'В корзину',
    decreaseQty: 'Уменьшить количество',
    increaseQty: 'Увеличить количество',
    cartBar: n => `Корзина: ${n} ${ruItemsWord(n)}`,
    checkoutCta: 'Оформить →',
    yourOrder: 'Ваш заказ',
    close: 'Закрыть',
    orderPaid: 'Заказ оплачен! Продавец свяжется с вами.',
    payViaKaspi: amount => `Оплатить ${amount} через Kaspi`,
    waitingPayment: 'Ждём подтверждение оплаты…',
    total: 'Итого',
    namePlaceholder: 'Имя',
    phonePlaceholder: 'Телефон',
    addressPlaceholder: 'Адрес доставки',
    submitting: 'Оформляем…',
    placeAndPay: 'Оформить и оплатить',
    allCategories: 'Все',
    noModels: 'Пока нет моделей в каталоге',
    backToCatalog: '← В каталог',
    color: 'Цвет',
    size: 'Размер',
    inStock: n => `На складе: ${n} шт.`,
    customOrderAvailable: 'Нет в наличии — доступен пошив на заказ',
    added: 'Добавлено ✓',
    orderCustom: 'Оформить пошив на заказ',
    customOrderTag: '(пошив)',
    yourRequest: 'Ваша заявка',
    companyNamePlaceholder: 'Название компании',
    binPlaceholder: 'БИН (12 цифр)',
    emailPlaceholder: 'Email — сюда придёт счёт',
    phoneOptionalPlaceholder: 'Телефон (необязательно)',
    submitRequest: 'Оформить заявку',
    errors: {
      orderFailed: 'Не удалось оформить заказ',
      paymentFailed: 'Не удалось создать оплату. Попробуйте ещё раз чуть позже.',
      network: 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.',
      fillContacts: 'Проверьте имя, телефон и адрес. Телефон — казахстанский, например +7 701 123 45 67',
      cartEmpty: 'Корзина пуста',
      tooManyOrders: 'Слишком много заказов подряд, попробуйте позже',
      itemsGone: 'Часть товаров в корзине уже недоступна, обновите страницу',
      productUnavailable: 'Товар недоступен',
      requestFailed: 'Не удалось оформить заявку',
      companyRequired: 'Укажите название компании',
      binInvalid: 'БИН должен состоять из 12 цифр',
      emailRequired: 'Укажите email',
      sellerLimit: 'Продавец временно не может выставлять новые счета в этом месяце — свяжитесь с ним напрямую',
      storeClosed: 'Магазин временно недоступен — оформить заказ сейчас нельзя',
    },
  },
  kk: {
    loading: 'Жүктелуде…',
    unavailable: 'Дүкен уақытша қолжетімсіз',
    unavailableHint: 'Сәл кейінірек кіріп көріңіз.',
    notFound: 'Витрина табылмады',
    modelNotFound: 'Модель табылмады',
    langSwitchLabel: 'Тіл',
    landingHistory: 'Тарих',
    landingCapacity: 'Өндірістік қуат',
    landingAnnualVolume: 'Жылдық көлем',
    goToCatalog: 'Каталогқа өту →',
    delivery: 'Жеткізу',
    noProducts: 'Әзірге қолда бар тауар жоқ',
    otherCategory: 'Басқа',
    addToCart: 'Себетке қосу',
    decreaseQty: 'Санын азайту',
    increaseQty: 'Санын көбейту',
    cartBar: n => `Себет: ${n} тауар`,
    checkoutCta: 'Рәсімдеу →',
    yourOrder: 'Тапсырысыңыз',
    close: 'Жабу',
    orderPaid: 'Тапсырыс төленді! Сатушы сізбен хабарласады.',
    payViaKaspi: amount => `Kaspi арқылы ${amount} төлеу`,
    waitingPayment: 'Төлемнің расталуын күтіп отырмыз…',
    total: 'Жиыны',
    namePlaceholder: 'Атыңыз',
    phonePlaceholder: 'Телефон',
    addressPlaceholder: 'Жеткізу мекенжайы',
    submitting: 'Рәсімделуде…',
    placeAndPay: 'Рәсімдеу және төлеу',
    allCategories: 'Барлығы',
    noModels: 'Каталогта әзірге модель жоқ',
    backToCatalog: '← Каталогқа',
    color: 'Түсі',
    size: 'Өлшемі',
    inStock: n => `Қоймада: ${n} дана`,
    customOrderAvailable: 'Қолда жоқ — тапсырыс бойынша тігіп беруге болады',
    added: 'Қосылды ✓',
    orderCustom: 'Тігуге тапсырыс беру',
    customOrderTag: '(тігуге тапсырыс)',
    yourRequest: 'Өтініміңіз',
    companyNamePlaceholder: 'Компания атауы',
    binPlaceholder: 'БСН (12 цифр)',
    emailPlaceholder: 'Email — шот осы мекенжайға келеді',
    phoneOptionalPlaceholder: 'Телефон (міндетті емес)',
    submitRequest: 'Өтінімді рәсімдеу',
    errors: {
      orderFailed: 'Тапсырысты рәсімдеу мүмкін болмады',
      paymentFailed: 'Төлемді құру мүмкін болмады. Сәл кейінірек қайталап көріңіз.',
      network: 'Желі қатесі. Байланысты тексеріп, қайталап көріңіз.',
      fillContacts: 'Атыңызды, телефонды және мекенжайды тексеріңіз. Телефон қазақстандық болуы керек, мысалы +7 701 123 45 67',
      cartEmpty: 'Себет бос',
      tooManyOrders: 'Тапсырыстар тым жиі жіберілді, кейінірек қайталап көріңіз',
      itemsGone: 'Себеттегі кейбір тауарлар енді қолжетімсіз, бетті жаңартыңыз',
      productUnavailable: 'Тауар қолжетімсіз',
      requestFailed: 'Өтінімді рәсімдеу мүмкін болмады',
      companyRequired: 'Компания атауын көрсетіңіз',
      binInvalid: 'БСН 12 цифрдан тұруы керек',
      emailRequired: 'Email көрсетіңіз',
      sellerLimit: 'Сатушы осы айда жаңа шот жаза алмайды — онымен тікелей хабарласыңыз',
      storeClosed: 'Дүкен уақытша қолжетімсіз — қазір тапсырыс беру мүмкін емес',
    },
  },
  en: {
    loading: 'Loading…',
    unavailable: 'This shop is temporarily unavailable',
    unavailableHint: 'Please check back a little later.',
    notFound: 'Shop not found',
    modelNotFound: 'Item not found',
    langSwitchLabel: 'Language',
    landingHistory: 'Our story',
    landingCapacity: 'Production capacity',
    landingAnnualVolume: 'Annual volume',
    goToCatalog: 'Go to catalog →',
    delivery: 'Delivery',
    noProducts: 'No products in stock yet',
    otherCategory: 'Other',
    addToCart: 'Add to cart',
    decreaseQty: 'Decrease quantity',
    increaseQty: 'Increase quantity',
    cartBar: n => `Cart: ${n} ${n === 1 ? 'item' : 'items'}`,
    checkoutCta: 'Checkout →',
    yourOrder: 'Your order',
    close: 'Close',
    orderPaid: 'Order paid! The seller will contact you.',
    payViaKaspi: amount => `Pay ${amount} with Kaspi`,
    waitingPayment: 'Waiting for payment confirmation…',
    total: 'Total',
    namePlaceholder: 'Name',
    phonePlaceholder: 'Phone',
    addressPlaceholder: 'Delivery address',
    submitting: 'Sending…',
    placeAndPay: 'Place order and pay',
    allCategories: 'All',
    noModels: 'No items in the catalog yet',
    backToCatalog: '← Back to catalog',
    color: 'Color',
    size: 'Size',
    inStock: n => `In stock: ${n} pcs`,
    customOrderAvailable: 'Out of stock — can be made to order',
    added: 'Added ✓',
    orderCustom: 'Order custom-made',
    customOrderTag: '(made to order)',
    yourRequest: 'Your request',
    companyNamePlaceholder: 'Company name',
    binPlaceholder: 'BIN (12 digits)',
    emailPlaceholder: 'Email — the invoice will be sent here',
    phoneOptionalPlaceholder: 'Phone (optional)',
    submitRequest: 'Submit request',
    errors: {
      orderFailed: 'Could not place the order',
      paymentFailed: 'Could not create the payment. Please try again a bit later.',
      network: 'Network error. Check your connection and try again.',
      fillContacts: 'Check your name, phone and address. A Kazakhstan phone number is required, e.g. +7 701 123 45 67',
      cartEmpty: 'Your cart is empty',
      tooManyOrders: 'Too many orders in a row, please try again later',
      itemsGone: 'Some items in your cart are no longer available, please refresh the page',
      productUnavailable: 'Product unavailable',
      requestFailed: 'Could not submit the request',
      companyRequired: 'Enter the company name',
      binInvalid: 'BIN must be 12 digits',
      emailRequired: 'Enter an email',
      sellerLimit: 'The seller cannot issue new invoices this month — please contact them directly',
      storeClosed: 'This shop is temporarily unavailable — orders cannot be placed right now',
    },
  },
}

// Деньги одинаково во всех языках: «12 500 ₸» (группировка ru-KZ, как в
// остальном сервисе), чтобы цена на витрине совпадала со счётом и Kaspi.
export function formatStorefrontPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// API витрины (src/app/api/shop/**) отдаёт ошибки русским текстом или кодом.
// Покупатель видит их на своём языке: известные тексты сопоставлены с ключами
// словаря; незнакомый текст — общий «не удалось оформить» (fallback).
const API_ERROR_KEYS: Record<string, StorefrontErrorKey> = {
  not_found: 'storeClosed',
  unavailable: 'storeClosed',
  'Заполните имя, телефон и адрес': 'fillContacts',
  'Корзина пуста': 'cartEmpty',
  'Слишком много заказов подряд, попробуйте позже': 'tooManyOrders',
  'Не удалось оформить заказ': 'orderFailed',
  'Часть товаров в корзине уже недоступна, обновите страницу': 'itemsGone',
  'Часть товаров в корзине больше недоступна, обновите страницу': 'itemsGone',
  'Товар недоступен': 'productUnavailable',
  'Укажите название компании': 'companyRequired',
  'БИН должен состоять из 12 цифр': 'binInvalid',
  'Укажите email': 'emailRequired',
  'Не удалось оформить заявку': 'requestFailed',
  'Продавец временно не может выставлять новые счета в этом месяце — свяжитесь с ним напрямую': 'sellerLimit',
}

// Страницы хранят ключ, а не готовый текст: переключил язык после ошибки —
// сообщение тоже перевелось.
export function storefrontApiErrorKey(raw: unknown, fallback: StorefrontErrorKey): StorefrontErrorKey {
  const key = typeof raw === 'string' && Object.prototype.hasOwnProperty.call(API_ERROR_KEYS, raw.trim())
    ? API_ERROR_KEYS[raw.trim()]
    : undefined
  return key ?? fallback
}

export function storefrontApiError(raw: unknown, t: StorefrontContent, fallback: StorefrontErrorKey): string {
  return t.errors[storefrontApiErrorKey(raw, fallback)]
}
