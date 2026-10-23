import ToolSample from '@/components/tools/ToolSample'
import type { ToolLang } from '@/lib/tools-i18n'
import { schetDict } from './dict'
import { buildSchetSampleDoc, schetGuidePath, schetSampleCopy } from './sample'

// Серверная обёртка блока «Образец» для /tools/schet на трёх языках. Не
// клиентский компонент: страница передаёт его в SchetTool как children, так что
// образец попадает в серверный HTML и не утяжеляет браузерный бандл.
export default function SchetSample({ lang }: { lang: ToolLang }) {
  return (
    <ToolSample
      idPrefix="sc-sample"
      copy={schetSampleCopy[lang]}
      doc={buildSchetSampleDoc()}
      guide={{ href: schetGuidePath(lang), label: schetDict[lang].guideLink }}
    />
  )
}
