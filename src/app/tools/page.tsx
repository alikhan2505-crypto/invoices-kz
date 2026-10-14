import type { Metadata } from 'next'
import ToolsIndexView from '@/lib/tools-i18n/ToolsIndexView'
import { toolsIndexMetadata } from '@/lib/tools-i18n/toolsIndex'

// Страница-указатель бесплатных инструментов (ru). На сами инструменты
// ссылаются напрямую, но адрес /tools набирают и руками — раньше здесь был 404.
// Языковые версии: /tools/kk, /tools/en — та же ToolsIndexView.
export const metadata: Metadata = toolsIndexMetadata('ru')

export default function ToolsIndex() {
  return <ToolsIndexView lang="ru" />
}
