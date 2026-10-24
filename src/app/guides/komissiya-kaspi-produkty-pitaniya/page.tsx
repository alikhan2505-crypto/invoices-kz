import type { Metadata } from 'next'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_FOOD, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata } from '../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-produkty-pitaniya')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'комиссия kaspi продукты питания, комиссия каспи магазин продукты, комиссия kaspi алкоголь, комиссия каспи кофе чай, комиссия kaspi детское питание',
)

const LOW = formatPercent(KASPI_TIERS.low.withVat)
const LOW_NV = formatPercent(KASPI_TIERS.low.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const quote = (names: string[]) => names.map(n => `«${n}»`).join(', ')

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>Ставка</h2>
      <p>
        В тарифе Магазина на Kaspi.kz вся категория «Продукты питания» стоит одинаково: <strong>{LOW} с НДС</strong>{' '}
        ({LOW_NV} без НДС). В категории {KASPI_FOOD.totalRows} строки тарифа (самый нижний уровень списка, у каждой своя
        строка в таблице Kaspi), и во всех {KASPI_FOOD.totalRows} ставка одна. Исключений внутри категории нет.
      </p>

      <h2>Что входит в категорию</h2>
      <p>
        В категории {KASPI_FOOD.subcategories.length} подкатегорий. В таблице у каждой указано число строк тарифа, все они
        по {LOW}.
      </p>
      <DataTable
        head={['Подкатегория', 'Строк в тарифе']}
        rows={KASPI_FOOD.subcategories.map(s => [s.name, String(s.rows)])}
      />

      <h2>Алкоголь тоже {LOW}</h2>
      <p>
        Подкатегория «Алкоголь» целиком стоит по этой же ставке: {KASPI_FOOD.alcoholRows.length} строк, {quote(KASPI_FOOD.alcoholRows)}.
      </p>
      <p className="note">
        Эта страница только про комиссию. Условия, на которых Kaspi допускает товар к продаже, смотрите в правилах Kaspi.
      </p>

      <h2>Что не входит в {LOW}</h2>
      <p>Два случая, где легко ошибиться: товар про еду, но в тарифе лежит в другой категории.</p>
      <ul>
        <li>
          <strong>Детское питание.</strong> Категория «Детские товары», подкатегория «Детское питание»,{' '}
          {KASPI_FOOD.babyFoodRows.length} строк: {quote(KASPI_FOOD.babyFoodRows)}. Все по {BASE} с НДС.
        </li>
        <li>
          <strong>Спортивное питание.</strong> Категория «Спорт, туризм», подкатегория «Спортивное питание»,{' '}
          {KASPI_FOOD.sportNutritionRows.length} строк: {quote(KASPI_FOOD.sportNutritionRows)}. Все по {BASE} с НДС.
        </li>
      </ul>

      <ExampleBlock lang="ru" tiers={['low']} />
      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'tarify-dostavki-kaspi-magazin', 'komissiya-kaspi-apteka-lekarstva']}
      />
      <SourceBlock lang="ru" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
