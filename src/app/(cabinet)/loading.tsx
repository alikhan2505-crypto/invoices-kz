import ContentLoading from '@/components/ContentLoading'

// Без этого файла переход между страницами кабинета показывал бы корневую
// полноэкранную заставку поверх меню. См. ContentLoading.
export default function Loading() {
  return <ContentLoading />
}
