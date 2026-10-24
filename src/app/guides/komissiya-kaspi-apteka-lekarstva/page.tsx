import type { Metadata } from 'next'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_PHARMACY, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata } from '../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-apteka-lekarstva')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'комиссия kaspi аптека, комиссия каспи лекарства, комиссия kaspi бад витамины, комиссия каспи медтехника, комиссия kaspi оптика',
)

const LOW = formatPercent(KASPI_TIERS.low.withVat)
const LOW_NV = formatPercent(KASPI_TIERS.low.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const BASE_NV = formatPercent(KASPI_TIERS.base.withoutVat)
const MED = KASPI_PHARMACY.medicineRows.length
const OTHER = KASPI_PHARMACY.otherTotalRows

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>Ставки</h2>
      <p>
        В категории «Аптека» {MED + OTHER} строк тарифа, и ставка зависит от подкатегории. {MED} строк подкатегории
        «Лекарства» идут по <strong>{LOW} с НДС</strong> ({LOW_NV} без НДС). Остальные {OTHER} строк категории идут по{' '}
        <strong>{BASE} с НДС</strong> ({BASE_NV} без НДС).
      </p>

      <h2>Что стоит {LOW}: подкатегория «Лекарства»</h2>
      <p>Все {MED} строк подкатегории «Лекарства» названы в таблице Kaspi так:</p>
      <DataTable head={['Строка тарифа', 'Комиссия с НДС']} rows={KASPI_PHARMACY.medicineRows.map(n => [n, LOW])} />

      <h2>Что стоит {BASE}: всё остальное в «Аптеке»</h2>
      <p>
        Остальные {OTHER} строк категории входят в {KASPI_PHARMACY.otherGroups.length} подкатегорий. Число строк тарифа в
        каждой:
      </p>
      <DataTable
        head={['Подкатегория', 'Строк в тарифе']}
        rows={KASPI_PHARMACY.otherGroups.map(g => [g.name, String(g.rows)])}
      />

      <h2>Где легко ошибиться</h2>
      <ul>
        <li>
          <strong>Витамины.</strong> Строка «Витаминные препараты» лежит в подкатегории «Лекарства» и стоит {LOW}, а
          подкатегория «Витамины и БАД» ({KASPI_PHARMACY.otherGroups.find(g => g.name === 'Витамины и БАД')?.rows} строки) стоит {BASE}. Название у них похожее, а ставка разная.
        </li>
        <li>
          <strong>Не вся «Аптека» дешёвая.</strong> Ставка {LOW} относится только к строкам подкатегории «Лекарства». Медицинские
          приборы, оптика, ортопедия и остальные подкатегории идут по {BASE}.
        </li>
      </ul>
      <p className="note">
        Эта страница только про комиссию. Условия, на которых Kaspi допускает лекарства и медицинские товары к продаже,
        здесь не разбираются: смотрите правила Kaspi.
      </p>

      <ExampleBlock lang="ru" tiers={['low', 'base']} />
      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'komissiya-kaspi-produkty-pitaniya', 'komissiya-kaspi-tovary-dlya-zhivotnykh']}
      />
      <SourceBlock lang="ru" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
