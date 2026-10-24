// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_PETS, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-tovary-dlya-zhivotnykh')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'kaspi жануарларға арналған жем комиссиясы, kaspi зоотауарлар комиссиясы, kaspi ит жемі комиссия, kaspi мысық жемі комиссия, kaspi дәретхана толтырғышы комиссия',
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
    <GuideShell guide={guide} lang="kk">
      <h2>Мөлшерлемелер</h2>
      <p>
        «Товары для животных» санатында тарифтің {FOOD + OTHER} жолы бар. Соның дәл {FOOD}-і <strong>ҚҚС-пен {LOW}</strong>{' '}
        (ҚҚС-сыз {LOW_NV}) бойынша: жем, «лакомства», құрама жем және дәретхана толтырғыштары. Қалған {OTHER} жол{' '}
        <strong>ҚҚС-пен {BASE}</strong> (ҚҚС-сыз {BASE_NV}) бойынша.
      </p>

      <h2>{LOW} тұратыны</h2>
      <p>Kaspi кестесінде аталғандай, {FOOD} жолдың толық тізімі:</p>
      <DataTable
        head={['Ішкі санат', 'Тариф жолы', 'ҚҚС-пен комиссия']}
        rows={KASPI_PETS.foodRows.map(r => [r.group, r.name, LOW])}
      />

      <h2>{BASE} тұратыны</h2>
      <p>
        Санаттағы қалғанының бәрі: {KASPI_PETS.otherGroups.length} ішкі санаттағы {OTHER} жол. Әрқайсысындағы тариф
        жолдарының саны және жолдар аз болған жерде олардың атаулары:
      </p>
      <DataTable
        head={['Ішкі санат', 'Тарифтегі жолдар', 'Қайсысы']}
        rows={KASPI_PETS.otherGroups.map(g => [g.name, String(g.rows), g.names ? quoteList(g.names) : ''])}
      />

      <h2>Қайда қателесу оңай</h2>
      <ul>
        <li>
          <strong>«Для собак» және «Для кошек» тауарларының бәрі {LOW} емес.</strong> Жем мен «лакомства» {LOW} бойынша,
          ал «Игрушки для собак», «Вольеры и будки», «Игрушки для кошек» және «Когтеточки для кошек» {BASE} бойынша.
        </li>
        <li>
          <strong>Бүкіл «ауыл шаруашылығы» арзан емес.</strong> «Для сельскохозяйственных животных» ішкі санатында {LOW}{' '}
          тек бір жол тұр, ол «Комбикорма для сельскохозяйственных животных». Қалған {rowsOf('Для сельскохозяйственных животных')}{' '}
          жол, мысалы «Доильные аппараты» және «Инкубаторы для яиц», {BASE} бойынша.
        </li>
        <li>
          <strong>«Ветаптека» және «Груминг».</strong> «Ветаптека» ({rowsOf('Ветаптека')} жол) және «Груминг» (
          {rowsOf('Груминг')} жол) {BASE} бойынша.
        </li>
      </ul>

      <ExampleBlock lang="kk" tiers={['low', 'base']} />
      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'komissiya-kaspi-produkty-pitaniya', 'komissiya-kaspi-apteka-lekarstva']}
      />
      <SourceBlock lang="kk" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
