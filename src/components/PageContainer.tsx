// ЕДИНЫЙ контейнер страницы кабинета (план стиля 23.10.2026, пункт 8): раньше
// каждая страница писала свой `max-w-lg lg:max-w-3xl mx-auto p-4`, и ширина
// колонки прыгала при переходе между вкладками (профиль: 2xl / 3xl / 5xl).
//
//   <PageContainer variant="narrow">  -- /profile/* и прочие формы и списки (max-w-3xl)
//   <PageContainer variant="wide">    -- дашборд, история, тарифы (max-w-5xl)
//   <PageContainer variant="full">    -- рабочие экраны на всю ширину, например /create (max-w-7xl)
//
// Отступы везде одинаковые: p-4, на десктопе p-6. На телефоне колонка, как и
// раньше, не шире max-w-lg. Выравнивание такое же, как у страниц кабинета
// сейчас (mx-auto внутри окна кабинета); align="start" прижимает колонку влево
// -- для продуктовых разделов с боковым меню (Kaspi Bot, AI-агент), где
// заголовок не должен прыгать по x. Заголовок страницы кладите ВНУТРЬ
// контейнера (PageHeader первым ребёнком), тогда он стоит на одной линии
// с содержимым.
//
// Зазор под PageHeader одинаковый на всех страницах (20px = mb-5 шапки):
// шапка помечена data-page-header, а верхний отступ следующего за ней блока
// здесь обнуляется (иначе на контейнерах с space-y-* и блоках со своим mt-*
// отступы складываются или перебивают друг друга). Остальной ритм не трогаем.

export type PageContainerVariant = 'narrow' | 'wide' | 'full'

// Классы -- только литералами, иначе Tailwind их не увидит при сборке.
const HEADER_GAP_CLS = '[&>[data-page-header]]:mb-5 [&>[data-page-header]+*]:mt-0'

const WIDTH_CLS: Record<PageContainerVariant, string> = {
  narrow: 'max-w-lg lg:max-w-3xl',
  wide: 'max-w-lg lg:max-w-5xl',
  full: 'max-w-lg lg:max-w-7xl',
}

export type PageContainerProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  variant?: PageContainerVariant
  align?: 'center' | 'start'
  children?: React.ReactNode
}

export default function PageContainer({
  variant = 'narrow', align = 'center', className, children, ...rest
}: PageContainerProps) {
  const cls = `${WIDTH_CLS[variant]} ${align === 'center' ? 'mx-auto' : ''} p-4 lg:p-6 ${HEADER_GAP_CLS} ${className ?? ''}`
  return (
    <div {...rest} className={cls.replace(/\s+/g, ' ').trim()}>
      {children}
    </div>
  )
}
