import type { Metadata } from 'next'
import ToolsIndexView from '@/lib/tools-i18n/ToolsIndexView'
import { toolsIndexMetadata } from '@/lib/tools-i18n/toolsIndex'

// Индекс бесплатных инструментов (kk). Схема — docs/tools-i18n-pattern.md.
export const metadata: Metadata = toolsIndexMetadata('kk')

export default function ToolsIndexKk() {
  return <ToolsIndexView lang="kk" />
}
