import BrandLoader from '@/components/BrandLoader'

// Загрузка ТОЛЬКО рабочей зоны (под меню). Корневой app/loading.tsx -- это
// полноэкранная тёмная заставка; без своего loading.tsx в сегменте она
// перекрывала бы и меню, и каркас при каждом переходе. Этот компонент
// кладётся в segment-level loading.tsx внутри каркасов: меню и карточка
// остаются на месте, меняется только содержимое.
//
// Лоадер проявляется с задержкой 400 мс: быстрый переход (страница уже в
// кэше или отвечает мгновенно) не мигает вообще, а долгий -- показывает
// фирменный индикатор вместо пустоты. Стили инлайн: новый класс в globals.css
// рискует залипнуть на edge-кэше ("новый HTML, старые стили").
export default function ContentLoading() {
  return (
    <div
      className="content-loading"
      aria-busy="true"
      style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'content-loading-in 200ms ease 400ms both' }}
    >
      <style>{'@keyframes content-loading-in{from{opacity:0}to{opacity:1}}.content-loading .brand-loader-wrap{min-height:0}@media (prefers-reduced-motion:reduce){.content-loading{animation-duration:1ms!important}}'}</style>
      <BrandLoader />
    </div>
  )
}
