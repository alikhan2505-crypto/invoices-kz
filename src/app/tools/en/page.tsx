import type { Metadata } from 'next'
import ToolsIndexView from '@/lib/tools-i18n/ToolsIndexView'
import { toolsIndexMetadata } from '@/lib/tools-i18n/toolsIndex'

// Индекс бесплатных инструментов (en). Схема — docs/tools-i18n-pattern.md.
export const metadata: Metadata = toolsIndexMetadata('en')

export default function ToolsIndexEn() {
  return <ToolsIndexView lang="en" />
}
