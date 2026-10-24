// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_PHARMACY, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata } from '../../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-apteka-lekarstva')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'kaspi дәріхана комиссиясы, kaspi дәрі-дәрмек комиссиясы, kaspi бад витаминдер комиссия, kaspi медтехника комиссия, kaspi оптика комиссия',
)

const LOW = formatPercent(KASPI_TIERS.low.withVat)
const LOW_NV = formatPercent(KASPI_TIERS.low.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const BASE_NV = formatPercent(KASPI_TIERS.base.withoutVat)
const MED = KASPI_PHARMACY.medicineRows.length
const OTHER = KASPI_PHARMACY.otherTotalRows

export default function Page() {
  return (
    <GuideShell guide={guide} lang="kk">
      <h2>Мөлшерлемелер</h2>
      <p>
        «Аптека» санатында тарифтің {MED + OTHER} жолы бар, мөлшерлеме ішкі санатқа байланысты. «Лекарства» ішкі санатының{' '}
        {MED} жолы <strong>ҚҚС-пен {LOW}</strong> (ҚҚС-сыз {LOW_NV}) бойынша. Санаттың қалған {OTHER} жолы{' '}
        <strong>ҚҚС-пен {BASE}</strong> (ҚҚС-сыз {BASE_NV}) бойынша.
      </p>

      <h2>{LOW} тұратыны: «Лекарства» ішкі санаты</h2>
      <p>«Лекарства» ішкі санатының барлық {MED} жолы Kaspi кестесінде былай аталған:</p>
      <DataTable head={['Тариф жолы', 'ҚҚС-пен комиссия']} rows={KASPI_PHARMACY.medicineRows.map(n => [n, LOW])} />

      <h2>{BASE} тұратыны: «Аптека» санатындағы қалғанының бәрі</h2>
      <p>
        Санаттың қалған {OTHER} жолы {KASPI_PHARMACY.otherGroups.length} ішкі санатқа кіреді. Әрқайсысындағы тариф
        жолдарының саны:
      </p>
      <DataTable
        head={['Ішкі санат', 'Тарифтегі жолдар']}
        rows={KASPI_PHARMACY.otherGroups.map(g => [g.name, String(g.rows)])}
      />

      <h2>Қайда қателесу оңай</h2>
      <ul>
        <li>
          <strong>Витаминдер.</strong> «Витаминные препараты» жолы «Лекарства» ішкі санатында, мөлшерлемесі {LOW}, ал
          «Витамины и БАД» ішкі санаты ({KASPI_PHARMACY.otherGroups.find(g => g.name === 'Витамины и БАД')?.rows} жол) {BASE} бойынша. Атаулары ұқсас, ал мөлшерлеме әртүрлі.
        </li>
        <li>
          <strong>Бүкіл «Аптека» арзан емес.</strong> {LOW} мөлшерлеме тек «Лекарства» жолдарына қатысты. Медициналық
          аспаптар, оптика, ортопедия және қалған ішкі санаттар {BASE} бойынша.
        </li>
      </ul>
      <p className="note">
        Бұл бет тек комиссия туралы. Kaspi дәрі-дәрмек пен медициналық тауарларды сатуға қандай шарттармен жіберетіні
        мұнда қарастырылмайды: Kaspi ережелерін қараңыз.
      </p>

      <ExampleBlock lang="kk" tiers={['low', 'base']} />
      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'komissiya-kaspi-produkty-pitaniya', 'komissiya-kaspi-tovary-dlya-zhivotnykh']}
      />
      <SourceBlock lang="kk" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
