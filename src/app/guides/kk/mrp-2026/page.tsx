// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import Link from 'next/link'
import GuideShell from '../../GuideShell'
import { getGuide, guideAlternates, guideMetaTitle } from '@/lib/guides'
import {
  MRP_2026,
  MRP_CHECKED,
  MZP_2026,
  SIMPLIFIED_INCOME_LIMIT_MRP,
  SIMPLIFIED_INCOME_LIMIT_TENGE,
  VAT_REGISTRATION_THRESHOLD_MRP,
  VAT_REGISTRATION_THRESHOLD_TENGE,
  formatNumber,
  formatTenge,
  mrpConversionRows,
} from '@/lib/mrp'
import { formatKkDate } from '@/lib/seoLaunch'

const guide = getGuide('mrp-2026')!

export const metadata: Metadata = {
  title: guideMetaTitle(guide.kk.title),
  description: guide.kk.description,
  keywords:
    'аек 2026, 2026 жылғы аек теңгемен, мрп 2026 қазақстанда, 2026 жылы аек қанша, 100 аек теңгемен, оңайлатылған декларация шегі 600000 аек, ҚҚС табалдырығы 10000 аек',
  alternates: {
    canonical: `https://invoices.kz/guides/kk/${guide.slug}`,
    languages: guideAlternates(guide.slug),
  },
  openGraph: {
    type: 'article',
    locale: 'kk_KZ',
    url: `https://invoices.kz/guides/kk/${guide.slug}`,
    siteName: 'INVOICES.KZ',
    title: guide.kk.title,
    description: guide.kk.description,
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: guide.kk.title }],
  },
}

export default function Page() {
  const rows = mrpConversionRows()
  const checked = formatKkDate(MRP_CHECKED)
  return (
    <GuideShell guide={guide} lang="kk">
      <p className="lead">
        Қысқаша жауап: 2026 жылға айлық есептік көрсеткіш (АЕК, орысша МРП) <strong>{formatTenge(MRP_2026)}</strong>.
        Мөлшерін 2025 жылғы 8 желтоқсандағы № 239-VIII «2026-2028 жылдарға арналған республикалық бюджет туралы» ҚР
        Заңының 7-бабы белгілеген, ол 2026 жылғы 1 қаңтардан бастап қолданылады. Деректер {checked} күні тексерілді.
      </p>
      <p>
        ЖК салықтары мен оңайлатылған режимнің шектерін осы санмен тегін{' '}
        <Link href="/tools/kk/nalogi">ЖК салық калькуляторында</Link> бірден есептеуге болады, ал режим толық{' '}
        <Link href="/guides/kk/nalogi-ip-uproshchenka-2026">2026 жылғы ЖК салықтары</Link> туралы мақалада
        талданған.
      </p>

      <h2>АЕК теңгемен қанша: аудару кестесі</h2>
      <p>АЕК-ті теңгеге аудару үшін АЕК санын {formatNumber(MRP_2026)} санына көбейтіңіз.</p>
      <div className="guide-formula">Теңгемен сома = АЕК саны × {formatNumber(MRP_2026)}</div>

      <div className="guide-table-wrap">
        <table>
          <thead>
            <tr>
              <th>АЕК</th>
              <th>АЕК {formatNumber(MRP_2026)} ₸ болғанда теңге</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.mrp}>
                <td className="tabular-nums">{formatNumber(r.mrp)} АЕК</td>
                <td className="tabular-nums">{formatTenge(r.tenge)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note">
        Кесте 2026 жылғы АЕК бойынша есептелген. Басқа жылдары АЕК өзгеше болған, сондықтан өткен жылдардың сомалары
        үшін бұл сандарды қолдануға болмайды.
      </p>

      <h2>АЕК қайдан алынады және оны қалай белгілейді</h2>
      <ul>
        <li>
          <strong>Мөлшерін бюджет туралы заң белгілейді.</strong> Салық кодексі соманың өзін атамайды: 21-баптың 1)
          тармақшасы бойынша АЕК деп тиісті қаржы жылына республикалық бюджет туралы заңмен белгіленген көрсеткішті айтады.
          Сондықтан жаңа мөлшер жыл сайын бюджетпен бірге шығады.
        </li>
        <li>
          <strong>2026 жылға бұл № 239-VIII Заңның 7-бабы.</strong> Сол бапта ең төмен жалақы (ЕТЖ) да бар:{' '}
          {formatTenge(MZP_2026)} (1) тармақша), ал АЕК 4) тармақшада көрсетілген.
        </li>
        <li>
          <strong>Шектер үшін 1 қаңтардағы АЕК алынады.</strong> Кодекс шектер мен табалдырықтарды тиісті қаржы
          жылының 1 қаңтарында қолданылатын АЕК бойынша есептейді (723-баптың 1-тармағының 1) тармақшасы; 99-баптың
          4-тармағының 2) тармақшасы). Яғни 2026 жылғы шектер жыл бойы {formatTenge(MRP_2026)} бойынша есептеледі.
        </li>
        <li>
          <strong>Келесі жылдардың мөлшері</strong> сол жылдарға арналған бюджет заңдарында болады. Олар
          қабылданғанға дейін жоғарыдағы кестені басқа жылға көшіруге болмайды.
        </li>
      </ul>

      <h2>Оңайлатылған режимдегі ЖК үшін АЕК-пен берілген қандай шектер маңызды</h2>
      <p>
        Оңайлатылған декларациядағы ЖК үшін ең алдымен АЕК-пен берілген екі шек маңызды. Екеуі де Салық кодексінің
        мәтіні бойынша тексерілген (2025 жылғы 18 шілдедегі № 214-VIII Кодекс, 2026 жылғы 1 қаңтардан қолданылады).
      </p>

      <div className="guide-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Шек</th>
              <th>АЕК</th>
              <th>Теңге</th>
              <th>ҚР СК нормасы</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Оңайлатылған декларация үшін жылдық шектік табыс</td>
              <td className="tabular-nums">{formatNumber(SIMPLIFIED_INCOME_LIMIT_MRP)}</td>
              <td className="tabular-nums">{formatTenge(SIMPLIFIED_INCOME_LIMIT_TENGE)}</td>
              <td>723-бап, 1-тармақ, 1) тармақша</td>
            </tr>
            <tr>
              <td>ҚҚС бойынша есепке қою үшін айналым табалдырығы (жалпыбелгіленген тәртіп)</td>
              <td className="tabular-nums">{formatNumber(VAT_REGISTRATION_THRESHOLD_MRP)}</td>
              <td className="tabular-nums">{formatTenge(VAT_REGISTRATION_THRESHOLD_TENGE)}</td>
              <td>99-бап, 4-тармақ, 2) тармақша</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul>
        <li>
          <strong>Табыс шегі: жылына {formatNumber(SIMPLIFIED_INCOME_LIMIT_MRP)} АЕК.</strong> Оңайлатылған
          декларация режимін күнтізбелік жылдағы шектік табысы 1 қаңтардағы АЕК-тің{' '}
          {formatNumber(SIMPLIFIED_INCOME_LIMIT_MRP)} еселенген мөлшерінен аспайтын ЖК мен резидент заңды тұлғалар
          қолдана алады. АЕК {formatTenge(MRP_2026)} болғанда бұл {formatTenge(SIMPLIFIED_INCOME_LIMIT_TENGE)}.
          Шекке есептелетін салық салу объектісін 724-бап анықтайды. Салық мөлшерлемесі АЕК-ке байланысты емес: ол
          4% (726-бап), мәслихат оны 50%-дан аспайтындай өзгерте алады, яғни 2-6% аралығында.
        </li>
        <li>
          <strong>ҚҚС: оңайлатылған режимде есепке тұрудың қажеті жоқ.</strong> Оңайлатылған декларациядағы салық
          төлеуші ҚҚС төлеушісі болып табылмайды (722-баптың 4-тармағының 2) тармақшасы) және ҚҚС бойынша есепке
          қойылмайды (99-баптың 3-тармағының 4) тармақшасы). Ерекшелік: импортталатын тауарларға ҚҚС пен бейрезидент
          үшін ҚҚС оңайлатылған режимде де төленеді. {formatNumber(VAT_REGISTRATION_THRESHOLD_MRP)} АЕК, яғни{' '}
          {formatTenge(VAT_REGISTRATION_THRESHOLD_TENGE)} табалдырығы жалпыбелгіленген тәртіптегілерге қатысты: ол
          асып кетсе, салықтық өтінішті бес жұмыс күнінен кешіктірмей беру керек (101-баптың 3-тармағы), ал арнайы
          салық режимін қолданған салық төлеушіде айналым жалпыбелгіленген тәртіпке өткен күннен бастап есептеледі
          (101-баптың 2-тармағының 3) тармақшасы).
        </li>
        <li>
          <strong>ЕТЖ басқа шама.</strong> 2026 жылы ең төмен жалақы {formatTenge(MZP_2026)} (бюджет туралы заңның
          сол 7-бабы). Оны АЕК-пен шатастырмаңыз: бұл әртүрлі есептерге арналған әртүрлі сандар. ЖК-нің өзі үшін
          жарналары салықтар туралы мақалада талданған.
        </li>
      </ul>

      <p className="note">
        Айыппұлдар, жәрдемақылар мен баж салықтары да заңдарда АЕК-пен берілген, бірақ әр норманың еселігі өзінше.
        Қате сан бермеу үшін оларды мұнда келтірмейміз: қажетті баптан еселікті алып, жоғарыдағы кесте бойынша
        теңгеге аударыңыз.
      </p>

      <h2>Мұны жұмыста қалай қолдану керек</h2>
      <p>
        Шартта, талапта немесе шекте сома АЕК-пен көрсетілсе, оны кесте бойынша теңгеге аударып, шотқа теңгемен
        жазыңыз: төлемге шотты тегін <Link href="/tools/kk/schet">шот генераторында</Link> бір минутта жасауға
        болады. Табыс шегіне сыйып тұрғаныңызды және салықтар мен жарналарды қанша төлейтініңізді білу үшін{' '}
        <Link href="/tools/kk/nalogi">ЖК салық калькуляторын</Link> ашыңыз. ЖК-ні әлі ашпаған болсаңыз,{' '}
        <Link href="/guides/kk/kak-otkryt-ip-2026">2026 жылы ЖК қалай ашу керек</Link> мақаласынан бастаңыз.
      </p>

      <p className="note">
        Дереккөздер, {checked} күні тексерілді: АЕК пен ЕТЖ мөлшері:{' '}
        <a href="https://adilet.zan.kz/rus/docs/Z2500000239" rel="noopener noreferrer">
          2025 жылғы 8 желтоқсандағы № 239-VIII «2026-2028 жылдарға арналған республикалық бюджет туралы» ҚР Заңының
        </a>{' '}
        7-бабы, ол 2026 жылғы 1 қаңтардан енгізіледі (34-бап). Шектер мен табалдырықтар: 21, 99, 101, 722, 723, 726
        және 848-баптар,{' '}
        <a href="https://adilet.zan.kz/rus/docs/K2500000214" rel="noopener noreferrer">
          2025 жылғы 18 шілдедегі № 214-VIII ҚР Салық кодексі
        </a>
        .
      </p>
    </GuideShell>
  )
}
