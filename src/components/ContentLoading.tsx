import BrandLoader from '@/components/BrandLoader'

// Загрузка ТОЛЬКО рабочей зоны (под меню). Корневой app/loading.tsx -- это
// полноэкранная тёмная заставка; без своего loading.tsx в сегменте она
// перекрывала бы и меню, и каркас при каждом переходе. Этот компонент
// кладётся в segment-level loading.tsx внутри каркасов: меню и карточка
// остаются на месте, меняется только содержимое.
//
// Лоадер проявляется с задержкой 400 мс: быстрый переход (страница уже в
// кэше или отвечает мгновенно) не мигает вообще, а долгий -- показывает
// фирменный индикатор вместо пустоты.
//
// ПОЗИЦИЮ плашки задаёт только .brand-loader-wrap (brand-loader.css): он сам
// занимает высоту рабочей области и центрирует плашку. Здесь НЕТ своей
// высоты/центровки (раньше было minHeight 60vh): плашка стояла выше центра, а
// когда страница подменяла её своей загрузкой, «падала» в центр (25.10.2026).
// Анимация -- инлайн-стили (новый класс в globals.css мог залипнуть на edge).
export default function ContentLoading() {
  return (
    <div
      className="content-loading"
      aria-busy="true"
      style={{ animation: 'content-loading-in 200ms ease 400ms both' }}
    >
      <style>{'@keyframes content-loading-in{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.content-loading{animation-duration:1ms!important}}'}</style>
      <BrandLoader />
    </div>
  )
}
