import type { Metadata } from 'next'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_ACCESSORIES, KASPI_TIERS, formatPercent, type KaspiTierId } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-aksessuary')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'комиссия kaspi аксессуары, комиссия каспи сумки, комиссия каспи рюкзаки, комиссия kaspi часы, комиссия каспи очки, комиссия kaspi зонты, комиссия kaspi ремни',
)

const HIGH = formatPercent(KASPI_TIERS.high.withVat)
const HIGH_NV = formatPercent(KASPI_TIERS.high.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const BASE_NV = formatPercent(KASPI_TIERS.base.withoutVat)

function groupedRows(tier: KaspiTierId): string[][] {
  const groups = new Map<string, string[]>()
  for (const r of KASPI_ACCESSORIES.filter(x => x.tier === tier)) {
    groups.set(r.group, [...(groups.get(r.group) ?? []), r.name])
  }
  return [...groups.entries()].map(([group, names]) => [group, quoteList(names)])
}

const highCount = KASPI_ACCESSORIES.filter(r => r.tier === 'high').length
const baseCount = KASPI_ACCESSORIES.filter(r => r.tier === 'base').length

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>Единой ставки нет</h2>
      <p>
        У категории «Аксессуары» в тарифе Магазина на Kaspi.kz {KASPI_ACCESSORIES.length} строк, и ставка зависит от
        строки: {highCount} строк идут по <strong>{HIGH} с НДС</strong> ({HIGH_NV} без НДС), {baseCount} строк по{' '}
        <strong>{BASE} с НДС</strong> ({BASE_NV} без НДС). Ответа вида «аксессуары: столько-то процентов» у Kaspi нет,
        поэтому усреднённую цифру брать нельзя: нужна ставка именно вашей строки.
      </p>

      <h2>Что стоит {HIGH}</h2>
      <p>{highCount} строк, сгруппированных по подкатегориям, как в таблице Kaspi:</p>
      <DataTable head={['Подкатегория', 'Строки тарифа']} rows={groupedRows('high')} />

      <h2>Что стоит {BASE}</h2>
      <p>{baseCount} строк:</p>
      <DataTable head={['Подкатегория', 'Строки тарифа']} rows={groupedRows('base')} />

      <h2>Как читать эти таблицы</h2>
      <ul>
        <li>
          <strong>Подкатегория может делиться пополам.</strong> В «Сумки, чемоданы, кошельки» «Сумки», «Рюкзаки», «Кошельки и
          визитницы» и «Обложки для документов» стоят {HIGH}, а «Дорожные сумки», «Чемоданы», «Чехлы для чемоданов» и
          «Дорожные аксессуары» {BASE}.
        </li>
        <li>
          <strong>Часы тоже делятся.</strong> «Часы наручные», «Карманные часы» и «Ремешки и браслеты для часов» стоят{' '}
          {BASE}, а «Ювелирные часы» {HIGH}.
        </li>
        <li>
          <strong>Очки по {BASE}.</strong> «Солнцезащитные очки», «Футляры для очков», «Уход за очками» и «Держатели для
          очков» стоят {BASE}.
        </li>
      </ul>

      <ExampleBlock lang="ru" tiers={['base', 'high']} />
      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-ukrasheniya', 'komissiya-kaspi-aksessuary-dlya-telefonov', 'komissiya-kaspi-s-nds-i-bez-nds']}
      />
      <SourceBlock lang="ru" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
