import type { Metadata } from 'next'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_PETS, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-tovary-dlya-zhivotnykh')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'комиссия kaspi корм для животных, комиссия каспи зоотовары, комиссия kaspi корм для собак, комиссия kaspi корм для кошек, комиссия каспи наполнитель для туалета',
)

const LOW = formatPercent(KASPI_TIERS.low.withVat)
const LOW_NV = formatPercent(KASPI_TIERS.low.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const BASE_NV = formatPercent(KASPI_TIERS.base.withoutVat)
const FOOD = KASPI_PETS.foodRows.length
const OTHER = KASPI_PETS.otherTotalRows
const rowsOf = (name: string) => KASPI_PETS.otherGroups.find(g => g.name === name)?.rows

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>Ставки</h2>
      <p>
        В категории «Товары для животных» {FOOD + OTHER} строк тарифа. Ровно {FOOD} из них идут по{' '}
        <strong>{LOW} с НДС</strong> ({LOW_NV} без НДС): корма, лакомства, комбикорма и наполнители туалета. Остальные{' '}
        {OTHER} строк идут по <strong>{BASE} с НДС</strong> ({BASE_NV} без НДС).
      </p>

      <h2>Что стоит {LOW}</h2>
      <p>Весь список из {FOOD} строк, как он назван в таблице Kaspi:</p>
      <DataTable
        head={['Подкатегория', 'Строка тарифа', 'Комиссия с НДС']}
        rows={KASPI_PETS.foodRows.map(r => [r.group, r.name, LOW])}
      />

      <h2>Что стоит {BASE}</h2>
      <p>
        Всё остальное в категории: {OTHER} строк в {KASPI_PETS.otherGroups.length} подкатегориях. Число строк тарифа в
        каждой и, где строк немного, их названия:
      </p>
      <DataTable
        head={['Подкатегория', 'Строк в тарифе', 'Какие']}
        rows={KASPI_PETS.otherGroups.map(g => [g.name, String(g.rows), g.names ? quoteList(g.names) : ''])}
      />

      <h2>Где легко ошибиться</h2>
      <ul>
        <li>
          <strong>Не все товары «для собак» и «для кошек» стоят {LOW}.</strong> Корма и лакомства идут по {LOW}, а
          «Игрушки для собак», «Вольеры и будки», «Игрушки для кошек» и «Когтеточки для кошек» по {BASE}.
        </li>
        <li>
          <strong>Не весь «сельхоз» дешёвый.</strong> В подкатегории «Для сельскохозяйственных животных» по {LOW} стоит
          только одна строка, «Комбикорма для сельскохозяйственных животных». Остальные{' '}
          {rowsOf('Для сельскохозяйственных животных')} строк, например «Доильные аппараты» и «Инкубаторы для яиц», идут
          по {BASE}.
        </li>
        <li>
          <strong>Ветаптека и груминг.</strong> «Ветаптека» ({rowsOf('Ветаптека')} строк) и «Груминг» ({rowsOf('Груминг')}{' '}
          строк) стоят {BASE}.
        </li>
      </ul>

      <ExampleBlock lang="ru" tiers={['low', 'base']} />
      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'komissiya-kaspi-produkty-pitaniya', 'komissiya-kaspi-apteka-lekarstva']}
      />
      <SourceBlock lang="ru" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
