// ЕДИНЫЙ контейнер страницы кабинета и продуктовых разделов (Kaspi Bot, AI-агент,
// Kaspi Cashier API, CFO). Раньше каждая страница писала свой `max-w-lg lg:max-w-3xl
// mx-auto p-4`, а в продуктах колонку ещё прижимали влево (align="start") при потолке
// 1024-1280px: на мониторе 1920px справа оставалось 350-650px пустоты, на 2560px --
// до 1000px. Решение основателя (25.10.2026): занимать всё свободное место; у кого
// экран меньше или включён зум, колонка просто сожмётся.
//
// ПОЛИТИКА ШИРИНЫ (всё, что шире телефона, стоит за lg:, поэтому до 1024px и на
// телефоне ничего не меняется: база max-w-lg остаётся):
//
//   narrow  -- формы и настройки (/profile/*): ТА ЖЕ ширина, что у wide (решение
//              основателя 25.10: «растянуто по размеру страницы, везде узко» -- узкие
//              колонки 960-1152px оставляли пустую правую половину на 1920px).
//              Вариант оставлен ради смысла в разметке (форма/настройки), ширина общая.
//              Поля внутри раскладывайте в сетку (FORM_GRID_CLS), плитки одной
//              высоты -- в сетку с items-stretch (см. ниже), а не в узкую колонку.
//   wide    -- дашборд, история, тарифы, карточные разделы:
//              max-w-lg  lg:max-w-none  min-[2000px]:max-w-[1800px]
//              (без потолка до экранов ~1920px; на 2560px и шире -- 1800px по центру).
//   full    -- рабочие экраны, таблицы, канбан, документация:
//              max-w-lg  lg:max-w-none  min-[2240px]:max-w-[2100px]
//              (без потолка до экранов 2240px; выше -- 2100px по центру).
//
// Потолок для сверхшироких экранов оставлен нарочно: на 2560px и 3440px строка в
// бесконечную ширину читается плохо. Он ЦЕНТРИРОВАН, так что не выглядит
// «прижатым влево». Хотите вообще без потолка -- уберите части min-[...] ниже.
//
// ВЫРАВНИВАНИЕ. По умолчанию колонка по центру окна (mx-auto). Раньше продуктовые
// разделы передавали align="start"; теперь это УСТАРЕВШИЙ ПСЕВДОНИМ центра (чтобы
// 38 существующих вызовов сразу получили новую ширину и не прижимались влево, а
// заголовок и правый край не прыгали между пунктами меню: пока потолок не достигнут,
// колонка занимает всё окно, и 'center' и 'start' выглядят одинаково). Настоящее
// прижатие влево -- align="left" (исключения; в разделах продуктов не нужно).
// Новые страницы align вообще не указывают.
//
// ОТСТУПЫ: p-4, на десктопе p-6, на 2xl боковые px-8, чтобы содержимое не липло к
// краю окна-карточки на больших экранах.
//
// РАВНАЯ ВЫСОТА. Плитки в ряду растягиваем, а не прижимаем к верху: сетка с
// items-stretch, карточка `h-full flex flex-col`, кнопки `mt-auto`. Две колонки
// РАЗНОЙ длины делайте двумя независимыми flex-колонками (`flex flex-col gap-4`),
// у последней карточки `flex-1`: нижняя граница общая, пустоты под короткой нет.
//
// ЧИТАЕМЫЙ ТЕКСТ. В широком контейнере абзац длиной в 1500px читать нельзя. Абзацы и
// подсказки оборачивайте в <Prose> или добавляйте PROSE_CLS (max-w-prose, около 65
// символов; PROSE_WIDE_CLS -- 75ch для описаний). Карточки, таблицы и поля занимают
// 100% ширины колонки; таблицы кладите в `overflow-x-auto min-w-0`.
//
// СЕТКИ (готовые литералы, чтобы страницы не придумывали свои):
//   CARD_GRID_CLS   -- список карточек: 1 / lg:2 / 2xl:3 колонки
//   PRODUCT_GRID_CLS-- плитки товаров: 1 / sm:2 / xl:3 / 2xl:4 / 2200px:5
//   FORM_GRID_CLS   -- поля формы: 1 / md:2 / xl:3; длинные поля -- FORM_FULL_CLS
//   SPLIT_GRID_CLS  -- основное + правая панель 380px (xl), правую колонку делайте
//                      `xl:sticky xl:top-4 self-start`
//   TWO_COL_CLS     -- две равные колонки с xl
//
// Заголовок страницы кладите ВНУТРЬ контейнера (PageHeader первым ребёнком), тогда он
// стоит на одной линии с содержимым.
//
// Зазор под PageHeader одинаковый на всех страницах (20px = mb-5 шапки): шапка
// помечена data-page-header, а верхний отступ следующего за ней блока здесь
// обнуляется (иначе на контейнерах с space-y-* и блоках со своим mt-* отступы
// складываются или перебивают друг друга). Остальной ритм не трогаем.

export type PageContainerVariant = 'narrow' | 'wide' | 'full'
// 'start' -- устаревший псевдоним 'center' (см. выше); 'left' -- реальное прижатие влево.
export type PageContainerAlign = 'center' | 'start' | 'left'

// Классы -- только литералами, иначе Tailwind их не увидит при сборке.
const HEADER_GAP_CLS = '[&>[data-page-header]]:mb-5 [&>[data-page-header]+*]:mt-0'

export const WIDTH_CLS: Record<PageContainerVariant, string> = {
  narrow: 'max-w-lg lg:max-w-none min-[2000px]:max-w-[1800px]',
  wide: 'max-w-lg lg:max-w-none min-[2000px]:max-w-[1800px]',
  full: 'max-w-lg lg:max-w-none min-[2240px]:max-w-[2100px]',
}

// Читаемый текст и сетки колонок (литералы целиком, см. политику выше).
export const PROSE_CLS = 'max-w-prose'
export const PROSE_WIDE_CLS = 'max-w-[75ch]'
export const CARD_GRID_CLS = 'grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3'
export const PRODUCT_GRID_CLS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5'
export const FORM_GRID_CLS = 'grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3'
export const FORM_FULL_CLS = 'col-span-full'
export const SPLIT_GRID_CLS = 'grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start'
export const TWO_COL_CLS = 'grid grid-cols-1 gap-4 xl:grid-cols-2'
// Список записей (клиенты, услуги, документы, договоры): на телефоне и планшете (до lg)
// одна стеклянная карточка со строками, как было; с lg КАЖДАЯ запись -- своя плитка
// (рамка, скругление, зазор), плитки одной высоты в ряду. Внешний div (TILE_LIST_CLS)
// на lg исчезает (contents), сетку держит внутренний (TILE_GRID_CLS). Фон и рамку
// nav-glass на lg выключить нельзя (CSS вне слоя бьёт утилиты), поэтому обёртка
// «растворяется», а плитка красится сама (TILE_ITEM_CLS: на lg фон и рамка, до lg
// разделитель строк; наведение раздельно, чтобы утилиты не спорили).
export const TILE_LIST_CLS = 'nav-glass rounded-2xl overflow-hidden lg:contents'
export const TILE_GRID_CLS = 'lg:grid lg:grid-cols-2 lg:gap-4 lg:items-stretch 2xl:grid-cols-3'
export const TILE_ITEM_CLS = 'max-lg:border-b max-lg:border-b-[color:var(--nav-border-soft)] max-lg:last:border-b-0 max-lg:hover:bg-[var(--nav-surface-glass)] lg:rounded-2xl lg:border lg:border-[color:var(--nav-border-soft)] lg:bg-[var(--nav-surface-chrome)] lg:shadow-[var(--nav-card-glow)] lg:hover:border-[color:var(--nav-border)]'

export type PageContainerProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  variant?: PageContainerVariant
  align?: PageContainerAlign
  children?: React.ReactNode
}

export default function PageContainer({
  variant = 'narrow', align = 'center', className, children, ...rest
}: PageContainerProps) {
  const cls = `${WIDTH_CLS[variant]} ${align === 'left' ? '' : 'mx-auto'} p-4 lg:p-6 2xl:px-8 ${HEADER_GAP_CLS} ${className ?? ''}`
  return (
    <div {...rest} className={cls.replace(/\s+/g, ' ').trim()}>
      {children}
    </div>
  )
}

// Абзац/подсказка внутри широкого контейнера: не длиннее ~65 символов в строке.
// wide -- 75ch для длинных описаний. Остальные атрибуты и className проходят.
export function Prose({
  wide = false, as: Tag = 'div', className, children, ...rest
}: React.HTMLAttributes<HTMLElement> & { wide?: boolean; as?: 'div' | 'p' | 'section' }) {
  const cls = `${wide ? PROSE_WIDE_CLS : PROSE_CLS} ${className ?? ''}`.trim()
  return <Tag {...(rest as React.HTMLAttributes<HTMLElement>)} className={cls}>{children}</Tag>
}
