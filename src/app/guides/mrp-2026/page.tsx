import type { Metadata } from 'next'
import Link from 'next/link'
import GuideShell from '../GuideShell'
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
import { formatRuDate } from '@/lib/seoLaunch'

const guide = getGuide('mrp-2026')!

export const metadata: Metadata = {
  title: guideMetaTitle(guide.ru.title),
  description: guide.ru.description,
  keywords:
    'мрп 2026, мрп 2026 в тенге, мрп 2026 в казахстане, сколько мрп в 2026 году, 100 мрп в тенге, 1 мрп 2026, лимит упрощенки 600000 мрп, порог ндс 10000 мрп',
  alternates: {
    canonical: `https://invoices.kz/guides/${guide.slug}`,
    languages: guideAlternates(guide.slug),
  },
  openGraph: {
    type: 'article',
    locale: 'ru_KZ',
    url: `https://invoices.kz/guides/${guide.slug}`,
    siteName: 'INVOICES.KZ',
    title: guide.ru.title,
    description: guide.ru.description,
    images: [{ url: 'https://invoices.kz/og-image.png', width: 1200, height: 630, alt: guide.ru.title }],
  },
}

export default function Page() {
  const rows = mrpConversionRows()
  const checked = formatRuDate(MRP_CHECKED)
  return (
    <GuideShell guide={guide} lang="ru">
      <p className="lead">
        Короткий ответ: МРП на 2026 год равен <strong>{formatTenge(MRP_2026)}</strong>. Размер установлен статьёй 7
        Закона РК от 8 декабря 2025 года № 239-VIII «О республиканском бюджете на 2026-2028 годы» и действует с
        1 января 2026 года. Данные проверены {checked}.
      </p>
      <p>
        Налоги ИП и лимиты упрощёнки с этим числом можно сразу посчитать в бесплатном{' '}
        <Link href="/tools/nalogi">калькуляторе налогов ИП</Link>, а режим целиком разобран в статье{' '}
        <Link href="/guides/nalogi-ip-uproshchenka-2026">налоги ИП на упрощёнке в 2026</Link>.
      </p>

      <h2>Сколько тенге в МРП: таблица пересчёта</h2>
      <p>Чтобы перевести МРП в тенге, умножьте число МРП на {formatNumber(MRP_2026)}.</p>
      <div className="guide-formula">Сумма в тенге = число МРП × {formatNumber(MRP_2026)}</div>

      <div className="guide-table-wrap">
        <table>
          <thead>
            <tr>
              <th>МРП</th>
              <th>Тенге при МРП {formatNumber(MRP_2026)} ₸</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.mrp}>
                <td className="tabular-nums">{formatNumber(r.mrp)} МРП</td>
                <td className="tabular-nums">{formatTenge(r.tenge)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note">
        Таблица посчитана по МРП 2026 года. В другие годы МРП был другим, поэтому для сумм прошлых лет брать эти
        цифры нельзя.
      </p>

      <h2>Откуда берётся МРП и как его устанавливают</h2>
      <ul>
        <li>
          <strong>Размер задаёт закон о бюджете.</strong> Налоговый кодекс сам сумму не называет: по подпункту 1
          статьи 21 МРП это показатель, установленный законом о республиканском бюджете на соответствующий
          финансовый год. Поэтому новый размер появляется каждый год вместе с бюджетом.
        </li>
        <li>
          <strong>Для 2026 года это статья 7 Закона № 239-VIII.</strong> В ней же стоит минимальная заработная
          плата: {formatTenge(MZP_2026)} (подпункт 1), а МРП указан в подпункте 4.
        </li>
        <li>
          <strong>Для лимитов берётся МРП на 1 января.</strong> Кодекс считает пороги по МРП, действующему на
          1 января соответствующего финансового года (статья 723, пункт 1, подпункт 1; статья 99, пункт 4,
          подпункт 2). Значит, лимиты 2026 года считаются по {formatTenge(MRP_2026)} весь год.
        </li>
        <li>
          <strong>Размеры на следующие годы</strong> будут в законах о бюджете на эти годы. Пока они не приняты,
          цифры из таблицы выше на другой год переносить нельзя.
        </li>
      </ul>

      <h2>Какие пороги в МРП важны ИП на упрощёнке</h2>
      <p>
        ИП на упрощённой декларации в первую очередь важны два порога в МРП. Оба проверены по тексту Налогового
        кодекса (Кодекс от 18 июля 2025 года № 214-VIII, действует с 1 января 2026 года).
      </p>

      <div className="guide-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Порог</th>
              <th>В МРП</th>
              <th>В тенге</th>
              <th>Норма НК РК</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Предельный доход за год для упрощённой декларации</td>
              <td className="tabular-nums">{formatNumber(SIMPLIFIED_INCOME_LIMIT_MRP)}</td>
              <td className="tabular-nums">{formatTenge(SIMPLIFIED_INCOME_LIMIT_TENGE)}</td>
              <td>ст. 723, п. 1, пп. 1</td>
            </tr>
            <tr>
              <td>Порог оборота для постановки на учёт по НДС (общеустановленный порядок)</td>
              <td className="tabular-nums">{formatNumber(VAT_REGISTRATION_THRESHOLD_MRP)}</td>
              <td className="tabular-nums">{formatTenge(VAT_REGISTRATION_THRESHOLD_TENGE)}</td>
              <td>ст. 99, п. 4, пп. 2</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul>
        <li>
          <strong>Лимит дохода: {formatNumber(SIMPLIFIED_INCOME_LIMIT_MRP)} МРП в год.</strong> Применять упрощённую
          декларацию вправе ИП и юридические лица-резиденты, у которых предельный доход за календарный год не
          превышает {formatNumber(SIMPLIFIED_INCOME_LIMIT_MRP)}-кратный МРП на 1 января. При МРП{' '}
          {formatTenge(MRP_2026)} это {formatTenge(SIMPLIFIED_INCOME_LIMIT_TENGE)}. Для лимита учитывается объект
          налогообложения, который определяет статья 724. Сама ставка налога от МРП не зависит: она 4%
          (статья 726), маслихат может изменить её не более чем на 50%, то есть в пределах 2-6%.
        </li>
        <li>
          <strong>НДС: на упрощёнке вставать на учёт не нужно.</strong> Налогоплательщик на упрощённой декларации не
          является плательщиком НДС (статья 722, пункт 4, подпункт 2) и на учёт по НДС не ставится (статья 99,
          пункт 3, подпункт 4). Исключение: НДС на импортируемые товары и НДС за нерезидента платятся и на
          упрощёнке. Порог {formatNumber(VAT_REGISTRATION_THRESHOLD_MRP)} МРП, то есть{' '}
          {formatTenge(VAT_REGISTRATION_THRESHOLD_TENGE)}, касается тех, кто на общеустановленном порядке: при
          его превышении заявление подаётся не позднее пяти рабочих дней (статья 101, пункт 3), а у перешедшего со
          спецрежима оборот считается с даты перехода (статья 101, пункт 2, подпункт 3).
        </li>
        <li>
          <strong>МЗП это другая величина.</strong> Минимальная заработная плата в 2026 году равна{' '}
          {formatTenge(MZP_2026)} (статья 7 того же закона о бюджете). Не путайте её с МРП: это разные числа для
          разных расчётов. Взносы ИП за себя разобраны в статье о налогах.
        </li>
      </ul>

      <p className="note">
        Штрафы, пособия и пошлины в законах тоже выражены в МРП, но кратность у каждой нормы своя. Мы их здесь не
        приводим, чтобы не дать неверную цифру: возьмите кратность из нужной статьи и переведите в тенге по таблице
        выше.
      </p>

      <h2>Как это применить в работе</h2>
      <p>
        Если сумма в договоре, требовании или пороге указана в МРП, переведите её в тенге по таблице и впишите в
        счёт уже в тенге: счёт на оплату можно сделать за минуту в бесплатном{' '}
        <Link href="/tools/schet">генераторе счетов</Link>. Чтобы понять, укладываетесь ли вы в лимит дохода и
        сколько платите налогов и взносов, откройте <Link href="/tools/nalogi">калькулятор налогов ИП</Link>. Если
        вы ещё не открыли ИП, начните со статьи{' '}
        <Link href="/guides/kak-otkryt-ip-2026">как открыть ИП в 2026 году</Link>.
      </p>

      <p className="note">
        Источники, проверено {checked}: размер МРП и МЗП: статья 7{' '}
        <a href="https://adilet.zan.kz/rus/docs/Z2500000239" rel="noopener noreferrer">
          Закона РК от 8 декабря 2025 года № 239-VIII «О республиканском бюджете на 2026-2028 годы»
        </a>
        , вводится в действие с {formatRuDate('2026-01-01')} (статья 34). Лимиты и пороги: статьи 21, 99, 101, 722,
        723, 726 и 848{' '}
        <a href="https://adilet.zan.kz/rus/docs/K2500000214" rel="noopener noreferrer">
          Налогового кодекса РК от 18 июля 2025 года № 214-VIII
        </a>
        .
      </p>
    </GuideShell>
  )
}
