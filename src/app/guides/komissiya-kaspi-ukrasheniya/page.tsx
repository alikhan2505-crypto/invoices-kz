import type { Metadata } from 'next'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_JEWELRY, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-ukrasheniya')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'комиссия kaspi украшения, комиссия каспи кольца серьги, комиссия kaspi ювелирные изделия, комиссия kaspi бижутерия, комиссия каспи браслеты',
)

const HIGH = formatPercent(KASPI_TIERS.high.withVat)
const HIGH_NV = formatPercent(KASPI_TIERS.high.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const N = KASPI_JEWELRY.totalRows

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>Ставка</h2>
      <p>
        Вся категория «Украшения» в тарифе Магазина на Kaspi.kz стоит одинаково: <strong>{HIGH} с НДС</strong> ({HIGH_NV}{' '}
        без НДС). Это самая высокая из трёх ставок тарифа. В категории {N} строки тарифа, и во всех {N} ставка одна.
        Исключений внутри категории нет.
      </p>

      <h2>Что входит в категорию</h2>
      <p>
        Строки собраны в {KASPI_JEWELRY.groups.length} групп. Ниже каждая группа и её строки тарифа так, как они названы в
        таблице Kaspi. Все строки стоят {HIGH}.
      </p>
      <DataTable
        head={['Группа', 'Строки тарифа']}
        rows={KASPI_JEWELRY.groups.map(g => [g.name, quoteList(g.rows)])}
      />

      <h2>Бижутерия тоже {HIGH}</h2>
      <p>
        В категории «Украшения» есть отдельные строки с пометкой «бижутерные», например «Серьги бижутерные», «Кольца
        бижутерные», «Браслеты бижутерные» и «Колье бижутерные». Они стоят так же, как ювелирные: {HIGH}.
      </p>

      <h2>Чем «Украшения» отличаются от «Аксессуаров»</h2>
      <p>Часы и ремешки к ним в тарифе разнесены по двум категориям, и ставки разные:</p>
      <ul>
        <li>
          «Ювелирные ремешки и браслеты для часов» лежат в «Украшениях» и стоят {HIGH}, а «Ремешки и браслеты для часов»
          лежат в «Аксессуарах» и стоят {BASE}.
        </li>
        <li>
          «Часы наручные» и «Карманные часы» относятся к «Аксессуарам» и стоят {BASE}, «Ювелирные часы» тоже в
          «Аксессуарах», но стоят {HIGH}.
        </li>
      </ul>
      <p>Полный список строк «Аксессуаров» с ценой каждой есть на странице про аксессуары.</p>

      <ExampleBlock lang="ru" tiers={['high']} />
      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-aksessuary', 'komissiya-kaspi-aksessuary-dlya-telefonov', 'komissiya-kaspi-s-nds-i-bez-nds']}
      />
      <SourceBlock lang="ru" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
