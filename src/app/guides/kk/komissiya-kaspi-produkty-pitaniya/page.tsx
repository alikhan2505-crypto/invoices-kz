// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_FOOD, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata } from '../../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-produkty-pitaniya')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'kaspi азық-түлік комиссиясы, kaspi магазин продукты питания комиссия, kaspi алкоголь комиссиясы, kaspi шай кофе комиссия, kaspi балалар тағамы комиссия',
)

const LOW = formatPercent(KASPI_TIERS.low.withVat)
const LOW_NV = formatPercent(KASPI_TIERS.low.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const quote = (names: string[]) => names.map(n => `«${n}»`).join(', ')

export default function Page() {
  return (
    <GuideShell guide={guide} lang="kk">
      <h2>Мөлшерлеме</h2>
      <p>
        Kaspi.kz-тегі Магазин тарифінде «Продукты питания» санатының бәрі бірдей: <strong>ҚҚС-пен {LOW}</strong> (ҚҚС-сыз{' '}
        {LOW_NV}). Санатта тарифтің {KASPI_FOOD.totalRows} жолы бар (Kaspi кестесіндегі тізімнің ең төменгі деңгейі, әр
        жолдың кестеде өз орны бар), және барлық {KASPI_FOOD.totalRows} жолда мөлшерлеме бір. Санат ішінде ерекшеліктер жоқ.
      </p>

      <h2>Санатқа не кіреді</h2>
      <p>
        Санатта {KASPI_FOOD.subcategories.length} ішкі санат бар. Кестеде әр ішкі санаттағы тариф жолдарының саны
        көрсетілген, олардың барлығы {LOW} тұр. Ішкі санат атаулары Kaspi кестесіндегідей орыс тілінде берілген.
      </p>
      <DataTable
        head={['Ішкі санат', 'Тарифтегі жолдар']}
        rows={KASPI_FOOD.subcategories.map(s => [s.name, String(s.rows)])}
      />

      <h2>Алкоголь де {LOW}</h2>
      <p>
        «Алкоголь» ішкі санаты түгелдей осы мөлшерлеме бойынша: {KASPI_FOOD.alcoholRows.length} жол, {quote(KASPI_FOOD.alcoholRows)}.
      </p>
      <p className="note">
        Бұл бет тек комиссия туралы. Kaspi тауарды сатуға қандай шарттармен жіберетінін Kaspi ережелерінен қараңыз.
      </p>

      <h2>{LOW} мөлшерлемеге не кірмейді</h2>
      <p>Қателесу оңай екі жағдай: тауар тамақ туралы, бірақ тарифте басқа санатта тұр.</p>
      <ul>
        <li>
          <strong>Балалар тағамы.</strong> «Детские товары» санаты, «Детское питание» ішкі санаты,{' '}
          {KASPI_FOOD.babyFoodRows.length} жол: {quote(KASPI_FOOD.babyFoodRows)}. Барлығы ҚҚС-пен {BASE}.
        </li>
        <li>
          <strong>Спорттық тамақ.</strong> «Спорт, туризм» санаты, «Спортивное питание» ішкі санаты,{' '}
          {KASPI_FOOD.sportNutritionRows.length} жол: {quote(KASPI_FOOD.sportNutritionRows)}. Барлығы ҚҚС-пен {BASE}.
        </li>
      </ul>

      <ExampleBlock lang="kk" tiers={['low']} />
      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'tarify-dostavki-kaspi-magazin', 'komissiya-kaspi-apteka-lekarstva']}
      />
      <SourceBlock lang="kk" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
