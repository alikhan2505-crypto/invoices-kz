// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import Link from 'next/link'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import {
  KASPI_DELIVERY,
  KASPI_DELIVERY_COLUMNS,
  KASPI_EXAMPLE_AMOUNT,
  KASPI_TARIFF_CHECKED_TEXT,
  KASPI_TIERS,
  deliveryRowById,
  formatNumber,
  formatPercent,
  formatTenge,
  kaspiDeliveryExample,
  type KaspiDeliveryRow,
} from '@/lib/kaspiTariff'
import { toolLinkPath } from '@/lib/tools-i18n'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata } from '../../_kaspi/blocks'

const guide = getKaspiGuide('tarify-dostavki-kaspi-magazin')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'сатушыға kaspi жеткізу құны, kaspi магазин жеткізу тарифтері, kaspi жеткізу қанша тұрады, kaspi express жеткізу тарифі, kaspi жеткізу тарифтері 2026',
)

const cols = KASPI_DELIVERY_COLUMNS
const head = ['Шарт', cols.city.kk, cols.kazakhstan.kk, cols.express.kk]
const toRows = (rows: KaspiDeliveryRow[]) =>
  rows.map(r => [r.kk, formatNumber(r.city), formatNumber(r.kazakhstan), formatNumber(r.express)])

const BASE = formatPercent(KASPI_TIERS.base.withVat)
const exampleRow = deliveryRowById('w-to5')
const ex = kaspiDeliveryExample('base', 'w-to5', 'city')

export default function Page() {
  return (
    <GuideShell guide={guide} lang="kk">
      <h2>Құн неге байланысты</h2>
      <p>
        Kaspi сатушы үшін Kaspi Жеткізу құны тауарды қайда жіберу керегіне, тапсырыстың жалпы сомасына және оның
        салмағына байланысты екенін жазады. Төмендегі кесте {KASPI_DELIVERY.effectiveText} бастап қолданылады, бағалар
        теңгемен және ҚҚС-сыз. Kaspi кестесіндегі үш баған «{cols.city.kk}», «{cols.kazakhstan.kk}» және «{cols.express.kk}»
        деп аталады.
      </p>

      <h2>Тапсырыс сомасы {formatTenge(KASPI_DELIVERY.thresholdTenge)} дейін: баға тапсырыс сомасына байланысты</h2>
      <DataTable head={head} rows={toRows(KASPI_DELIVERY.underThreshold)} />

      <h2>Тапсырыс сомасы {formatTenge(KASPI_DELIVERY.thresholdTenge)} және одан жоғары: баға салмаққа байланысты</h2>
      <DataTable head={head} rows={toRows([...KASPI_DELIVERY.fromThreshold, ...KASPI_DELIVERY.tires])} />
      <p className="note">
        Шиналар туралы жолдар кестенің дәл сол бөлігінде, {formatTenge(KASPI_DELIVERY.thresholdTenge)} бастап салмақпен
        бірге тұр. Шарттардың атаулары Kaspi-де жазылғандай берілген.
      </p>

      <h2>Қашан есептен шығарылады және ҚҚС бар ма</h2>
      <ul>
        <li>
          Кестедегі тарифтер <strong>ҚҚС-сыз</strong> көрсетілген, ал жеткізу құны ҚҚС ескеріліп есептен шығарылады.
        </li>
        <li>
          Есептен шығару сатушының ағымдағы шотынан жүреді және <strong>тек сатып алушы тапсырысты алған жағдайда</strong>,
          тапсырыстың күйі «Выдан» дегенге өзгергенде. Мұны Kaspi Pay мобильді қосымшасында тексеруге болады:
          Kaspi.kz-тегі Магазин, Тапсырыстар, Мұрағат.
        </li>
        <li>
          Жеткізу комиссиядан бөлек есептен шығарылады. Сатылым комиссиясын Kaspi тауар санаты бойынша есептейді, ол
          туралы комиссиялар бетінде айтамыз.
        </li>
      </ul>

      <ExampleBlock lang="kk" tiers={['base']} />

      <h2>Сол мысал Kaspi жеткізуімен</h2>
      <p>
        {formatTenge(KASPI_EXAMPLE_AMOUNT)} сатылымға жеткізуді қосайық: {formatTenge(KASPI_EXAMPLE_AMOUNT)} және одан
        жоғары тапсырыс, салмағы «{exampleRow.kk}», «{cols.city.kk}» бағаны. {BASE} комиссия мөлшерлемесін алдық, себебі
        Магазин тарифтер кестесінде ол жолдардың басым көпшілігінде тұр.
      </p>
      <DataTable
        head={['Көрсеткіш', 'Сома']}
        rows={[
          ['Сатылым бағасы', formatTenge(ex.amount)],
          [`Kaspi комиссиясы ${BASE}`, formatTenge(ex.commission)],
          [`Kaspi жеткізуі, «${exampleRow.kk}», «${cols.city.kk}» (ҚҚС-сыз)`, formatTenge(ex.delivery)],
          ['Жеткізуге ҚҚС, салық және өзіндік құнға дейін қалатыны', formatTenge(ex.left)],
        ]}
      />
      <p className="note">
        Жеткізуге ҚҚС мұнда қайта есептелмеген: Kaspi жеткізуді ҚҚС ескеріп есептен шығаратынын жазады, бірақ қайта
        есептеу үшін мөлшерлемені бұл бетте атамайды. Нақты соманы кабинеттегі есептен шығарулардан қараңыз.
      </p>
      <p>
        Мұндай тапсырыстардың жүкқұжаттарын тегін құралда бір PDF-ке жинауға болады:{' '}
        <Link href={toolLinkPath('waybills', 'kk')}>Kaspi жүкқұжаттары бір PDF-те</Link>.
      </p>

      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'komissiya-kaspi-produkty-pitaniya']}
      />
      <SourceBlock
        lang="kk"
        ids={['q2288', 'pdf', 'q1344', 'q4467']}
        intro={`Жеткізу тарифтері Kaspi-дің «Kaspi Жеткізу қанша тұрады?» бетінен алынған, кестесі «2026 жылғы 1 қаңтардан бастап жеткізу тарифтері (ҚҚС-сыз)». Kaspi бетін ${KASPI_TARIFF_CHECKED_TEXT} күні ашып, салыстырдық. Мысалдағы комиссия мөлшерлемесі Магазин тарифтер кестесінен (PDF) алынған. Kaspi тарифтерді өзгертуі мүмкін, сондықтан баға туралы шешім алдында өз кабинетіңізді тексеріңіз.`}
      />
    </GuideShell>
  )
}
