// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import { KASPI_JEWELRY, KASPI_TIERS, formatPercent } from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-ukrasheniya')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'kaspi әшекей бұйымдары комиссиясы, kaspi сақина сырға комиссия, kaspi зергерлік бұйымдар комиссия, kaspi бижутерия комиссия, kaspi білезік комиссия',
)

const HIGH = formatPercent(KASPI_TIERS.high.withVat)
const HIGH_NV = formatPercent(KASPI_TIERS.high.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const N = KASPI_JEWELRY.totalRows

export default function Page() {
  return (
    <GuideShell guide={guide} lang="kk">
      <h2>Мөлшерлеме</h2>
      <p>
        Kaspi.kz-тегі Магазин тарифінде «Украшения» санатының бәрі бірдей: <strong>ҚҚС-пен {HIGH}</strong> (ҚҚС-сыз{' '}
        {HIGH_NV}). Бұл тарифтің үш мөлшерлемесінің ішіндегі ең жоғарысы. Санатта тарифтің {N} жолы бар, және барлық {N}{' '}
        жолда мөлшерлеме бір. Санат ішінде ерекшеліктер жоқ.
      </p>

      <h2>Санатқа не кіреді</h2>
      <p>
        Жолдар {KASPI_JEWELRY.groups.length} топқа жиналған. Төменде әр топ және оның тариф жолдары Kaspi кестесінде
        аталғандай берілген. Барлық жол {HIGH} тұр.
      </p>
      <DataTable
        head={['Топ', 'Тариф жолдары']}
        rows={KASPI_JEWELRY.groups.map(g => [g.name, quoteList(g.rows)])}
      />

      <h2>Бижутерия да {HIGH}</h2>
      <p>
        «Украшения» санатында «бижутерные» деген белгісі бар жеке жолдар бар, мысалы «Серьги бижутерные», «Кольца
        бижутерные», «Браслеты бижутерные» және «Колье бижутерные». Олар зергерлік жолдармен бірдей: {HIGH}.
      </p>

      <h2>«Украшения» мен «Аксессуары» айырмашылығы</h2>
      <p>Сағаттар мен оларға арналған баулар тарифте екі санатқа бөлінген, мөлшерлемелері әртүрлі:</p>
      <ul>
        <li>
          «Ювелирные ремешки и браслеты для часов» «Украшения» санатында және {HIGH} тұр, ал «Ремешки и браслеты для
          часов» «Аксессуары» санатында және {BASE} тұр.
        </li>
        <li>
          «Часы наручные» және «Карманные часы» «Аксессуары» санатына жатады және {BASE} тұр, «Ювелирные часы» да
          «Аксессуары» санатында, бірақ {HIGH} тұр.
        </li>
      </ul>
      <p>«Аксессуары» жолдарының әрқайсысының бағасымен толық тізімі аксессуарлар туралы бетте бар.</p>

      <ExampleBlock lang="kk" tiers={['high']} />
      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-aksessuary', 'komissiya-kaspi-aksessuary-dlya-telefonov', 'komissiya-kaspi-s-nds-i-bez-nds']}
      />
      <SourceBlock lang="kk" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
