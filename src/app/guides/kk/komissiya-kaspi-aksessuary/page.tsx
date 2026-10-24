// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_ACCESSORIES, KASPI_TIERS, formatPercent, type KaspiTierId } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-aksessuary')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'kaspi аксессуарлар комиссиясы, kaspi сөмке комиссия, kaspi рюкзак комиссия, kaspi сағат комиссия, kaspi көзілдірік комиссия, kaspi қолшатыр комиссия, kaspi белбеу комиссия',
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
    <GuideShell guide={guide} lang="kk">
      <h2>Бірыңғай мөлшерлеме жоқ</h2>
      <p>
        Kaspi.kz-тегі Магазин тарифінде «Аксессуары» санатының {KASPI_ACCESSORIES.length} жолы бар, мөлшерлеме жолға
        байланысты: {highCount} жол <strong>ҚҚС-пен {HIGH}</strong> (ҚҚС-сыз {HIGH_NV}), {baseCount} жол{' '}
        <strong>ҚҚС-пен {BASE}</strong> (ҚҚС-сыз {BASE_NV}) бойынша. Kaspi-де «аксессуарлар: осынша пайыз» деген жауап
        жоқ, сондықтан орташа санды алуға болмайды: дәл өз жолыңыздың мөлшерлемесі керек.
      </p>

      <h2>{HIGH} тұратыны</h2>
      <p>{highCount} жол, Kaspi кестесіндегідей ішкі санаттар бойынша топтастырылған:</p>
      <DataTable head={['Ішкі санат', 'Тариф жолдары']} rows={groupedRows('high')} />

      <h2>{BASE} тұратыны</h2>
      <p>{baseCount} жол:</p>
      <DataTable head={['Ішкі санат', 'Тариф жолдары']} rows={groupedRows('base')} />

      <h2>Бұл кестелерді қалай оқу керек</h2>
      <ul>
        <li>
          <strong>Ішкі санат екіге бөлінуі мүмкін.</strong> «Сумки, чемоданы, кошельки» ішінде «Сумки», «Рюкзаки», «Кошельки и
          визитницы» және «Обложки для документов» {HIGH} тұр, ал «Дорожные сумки», «Чемоданы», «Чехлы для чемоданов» және
          «Дорожные аксессуары» {BASE} тұр.
        </li>
        <li>
          <strong>Сағаттар да бөлінеді.</strong> «Часы наручные», «Карманные часы» және «Ремешки и браслеты для часов»{' '}
          {BASE} тұр, ал «Ювелирные часы» {HIGH} тұр.
        </li>
        <li>
          <strong>Көзілдіріктер {BASE} бойынша.</strong> «Солнцезащитные очки», «Футляры для очков», «Уход за очками» және
          «Держатели для очков» {BASE} тұр.
        </li>
      </ul>

      <ExampleBlock lang="kk" tiers={['base', 'high']} />
      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-ukrasheniya', 'komissiya-kaspi-aksessuary-dlya-telefonov', 'komissiya-kaspi-s-nds-i-bez-nds']}
      />
      <SourceBlock lang="kk" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
