// Раскладка публичной витрины продавца (/shop/<slug>, оптовый каталог, страница
// модели). Раньше страницы стояли узкими колонками (max-w-6xl / max-w-2xl) и на
// мониторе 1920 px по бокам оставалось 400-600 px пустоты, а у товаров без фото
// была пустая квадратная заглушка. Политика та же, что у PageContainer (variant
// wide): до lg ничего не меняется, с lg содержимое занимает всю ширину окна, а на
// экранах от 2000 px упирается в потолок 1800 px и стоит по центру.
// Классы лежат литералами целиком: Tailwind собирает только их.

export const STOREFRONT_WRAP = 'mx-auto w-full p-4 lg:p-6 2xl:px-8 min-[2000px]:max-w-[1800px]'

// Липкая корзина внизу. На десктопе это узкая плашка по центру (max-w-3xl), а не
// во всю ширину окна: во всю ширину цена и «Оформить» уезжали в правый угол, где
// стоит плавающий пузырь ИИ-агента (public/widget.js: fixed, bottom/right 20px,
// 56x56 px), а кнопка с текстом по краям читалась плохо.
export const STOREFRONT_BAR_OUTER = 'fixed bottom-4 inset-x-0 z-40 pointer-events-none'
export const STOREFRONT_BAR_INNER = 'mx-auto w-full px-4 lg:px-6 lg:max-w-3xl'
// Страница с виджетом: на телефоне плашка занимает всю ширину и пузырь встал бы
// поверх цены, поэтому справа оставляем место под пузырь (20 + 56 px + зазор).
// С lg плашка и так по центру и до пузыря не доходит.
export const STOREFRONT_BAR_WIDGET_PAD = 'pr-[5.5rem] lg:pr-6'

// Сетка всего каталога. До lg разделы идут друг под другом, у каждого своя сетка
// (как было). С lg разделы «растворяются» (contents): все плитки лежат в одной
// сетке, а название раздела это первая плитка раздела. Так после раздела из одной
// карточки не остаётся пустой правой половины экрана.
export const STOREFRONT_GRID = 'space-y-8 lg:space-y-0 lg:grid lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 lg:gap-4 lg:items-stretch'
export const STOREFRONT_SECTION = 'lg:contents'
export const STOREFRONT_GROUP_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:contents'

// Первая буква названия для заглушки фото: буква или цифра, заглавная.
// Для пустого названия или одних символов - точка по центру.
export function placeholderInitial(name: string): string {
  const m = (name || '').match(/[\p{L}\p{N}]/u)
  return m ? m[0].toLocaleUpperCase() : '•'
}
