// kk: вычитка носителем ждёт основателя
//
// Общие блоки страниц K1-K8 (комиссии и доставка Kaspi Магазина): метаданные,
// пример расчёта, блок "Данные на <дата>, источник", ссылки. Папка с подчёркиванием
// не маршрут (private folder в App Router). Все числа берутся из
// src/lib/kaspiTariff.ts, здесь их не пишем руками.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Guide, GuideLang, guidePath } from '@/lib/guides'
import { KASPI_GUIDES } from '@/lib/kaspiGuides'
import { kaspiMetadata } from './meta'
import { SEO_TARIFF_BIK_LIVE } from '@/lib/seoLaunch'
import { toolLinkPath } from '@/lib/tools-i18n'
import {
  KASPI_EXAMPLE_AMOUNT,
  KASPI_EXAMPLE_TARGET_NET,
  KASPI_SOURCES,
  KASPI_TARIFF_CHECKED_TEXT,
  KASPI_TARIFF_EFFECTIVE_TEXT,
  KASPI_TIERS,
  formatPercent,
  formatTenge,
  kaspiExample,
  kaspiSourceUrl,
  type KaspiSourceId,
  type KaspiTierId,
} from '@/lib/kaspiTariff'

export { kaspiMetadata }

/** Таблица в обёртке, которая скроллится внутри себя на телефоне. */
export function DataTable({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="guide-table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} className={j > 0 ? 'tabular-nums' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Доли в тысячных: 7,3% это 73, поэтому 1 - 0,073 печатается ровно как 0,927.
function permilleOf(tier: KaspiTierId): number {
  return Math.round(KASPI_TIERS[tier].withVat * 10)
}

function keepShare(tier: KaspiTierId): string {
  return String((1000 - permilleOf(tier)) / 1000).replace('.', ',')
}

function rateShare(tier: KaspiTierId): string {
  return String(permilleOf(tier) / 1000).replace('.', ',')
}

const EXAMPLE_COPY = {
  ru: {
    title: `Что останется с продажи на ${formatTenge(KASPI_EXAMPLE_AMOUNT)}`,
    intro: (tiers: KaspiTierId[]) =>
      tiers.length === 1
        ? `Возьмём продажу на ${formatTenge(KASPI_EXAMPLE_AMOUNT)} и опубликованную в тарифе ставку с НДС ${formatPercent(KASPI_TIERS[tiers[0]].withVat)} (${formatPercent(KASPI_TIERS[tiers[0]].withoutVat)} без НДС).`
        : `Возьмём продажу на ${formatTenge(KASPI_EXAMPLE_AMOUNT)} и три опубликованные в тарифе ставки с НДС.`,
    rows: ['Цена продажи', 'Комиссия Kaspi', 'Остаётся после комиссии'],
    head: 'Показатель',
    note: `Это арифметика по опубликованной ставке с НДС, а не выписка из кабинета. Kaspi показывает комиссию без НДС, а налог начисляет отдельно по своим правилам (источник q4467, ниже), поэтому итоговые суммы в вашем отчёте определяют правила Kaspi: сверьтесь с кабинетом. Из этой суммы ещё не вычтены доставка Kaspi, налог ИП и себестоимость.`,
    target: (tier: KaspiTierId, price: string) =>
      `Чтобы после комиссии осталось ${formatTenge(KASPI_EXAMPLE_TARGET_NET)}, при ставке ${formatPercent(KASPI_TIERS[tier].withVat)} цена должна быть не ниже ${formatTenge(KASPI_EXAMPLE_TARGET_NET)} / (1 - ${rateShare(tier)}) = ${price} (округление вверх, без доставки и налога).`,
    targetMany: `Чтобы после комиссии осталось ${formatTenge(KASPI_EXAMPLE_TARGET_NET)}, цена должна быть не ниже ${formatTenge(KASPI_EXAMPLE_TARGET_NET)} / (1 - r), где r это ставка в долях (округление вверх, без доставки и налога):`,
    mainGuide: 'Общую формулу минимальной цены с налогом и доставкой мы разобрали в статье',
    mainGuideName: 'комиссия Kaspi Магазина по категориям',
  },
  kk: {
    title: `${formatTenge(KASPI_EXAMPLE_AMOUNT)} сатылымнан не қалады`,
    intro: (tiers: KaspiTierId[]) =>
      tiers.length === 1
        ? `${formatTenge(KASPI_EXAMPLE_AMOUNT)} сатылымды және тарифте жарияланған ҚҚС-пен ${formatPercent(KASPI_TIERS[tiers[0]].withVat)} мөлшерлемені (ҚҚС-сыз ${formatPercent(KASPI_TIERS[tiers[0]].withoutVat)}) алайық.`
        : `${formatTenge(KASPI_EXAMPLE_AMOUNT)} сатылымды және тарифте жарияланған ҚҚС-пен үш мөлшерлемені алайық.`,
    rows: ['Сатылым бағасы', 'Kaspi комиссиясы', 'Комиссиядан кейін қалатыны'],
    head: 'Көрсеткіш',
    note: `Бұл жарияланған ҚҚС-пен мөлшерлеме бойынша арифметика, кабинеттен үзінді емес. Kaspi комиссияны ҚҚС-сыз көрсетеді, ал салықты өз ережелері бойынша бөлек есептейді (дереккөз q4467, төменде), сондықтан есептегі түпкілікті сомаларды Kaspi ережелері анықтайды: кабинетпен салыстырыңыз. Бұл сомадан Kaspi жеткізуі, ЖК салығы және өзіндік құн әлі шығарылмаған.`,
    target: (tier: KaspiTierId, price: string) =>
      `Комиссиядан кейін ${formatTenge(KASPI_EXAMPLE_TARGET_NET)} қалу үшін, ${formatPercent(KASPI_TIERS[tier].withVat)} мөлшерлемеде баға ${formatTenge(KASPI_EXAMPLE_TARGET_NET)} / (1 - ${rateShare(tier)}) = ${price} кем болмауы керек (жоғары қарай дөңгелектеу, жеткізусіз және салықсыз).`,
    targetMany: `Комиссиядан кейін ${formatTenge(KASPI_EXAMPLE_TARGET_NET)} қалу үшін баға ${formatTenge(KASPI_EXAMPLE_TARGET_NET)} / (1 - r) кем болмауы керек, мұндағы r мөлшерлеме үлесі (жоғары қарай дөңгелектеу, жеткізусіз және салықсыз):`,
    mainGuide: 'Салық пен жеткізуді ескеретін ең төмен бағаның жалпы формуласы мына мақалада талданған:',
    mainGuideName: 'Kaspi Магазин комиссиясы санаттар бойынша',
  },
} as const

/** Пример на 10 000 ₸ по опубликованной ставке с НДС (одна ставка или все три). */
export function ExampleBlock({ lang, tiers }: { lang: GuideLang; tiers: KaspiTierId[] }) {
  const c = EXAMPLE_COPY[lang]
  const examples = tiers.map(t => kaspiExample(t))
  const single = tiers.length === 1
  const mainGuideHref = guidePath('komissiya-kaspi', lang)
  return (
    <>
      <h2>{c.title}</h2>
      <p>{c.intro(tiers)}</p>
      {single ? (
        <DataTable
          head={[c.head, lang === 'kk' ? 'Сома' : 'Сумма']}
          rows={[
            [c.rows[0], formatTenge(examples[0].amount)],
            [`${c.rows[1]} ${formatPercent(examples[0].ratePercent)}`, formatTenge(examples[0].commission)],
            [c.rows[2], formatTenge(examples[0].receives)],
          ]}
        />
      ) : (
        <DataTable
          head={[c.head, ...examples.map(e => formatPercent(e.ratePercent))]}
          rows={[
            [c.rows[0], ...examples.map(e => formatTenge(e.amount))],
            [c.rows[1], ...examples.map(e => formatTenge(e.commission))],
            [c.rows[2], ...examples.map(e => formatTenge(e.receives))],
          ]}
        />
      )}
      <p className="note">{c.note}</p>
      {single ? (
        <p>{c.target(tiers[0], formatTenge(examples[0].priceForTarget))}</p>
      ) : (
        <>
          <p>{c.targetMany}</p>
          <ul>
            {examples.map(e => (
              <li key={e.tier}>
                {formatPercent(e.ratePercent)}: (1 - {rateShare(e.tier)}) = {keepShare(e.tier)}, {formatTenge(e.priceForTarget)}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        {c.mainGuide} <Link href={mainGuideHref}>{c.mainGuideName}</Link>.
      </p>
    </>
  )
}

const SOURCE_COPY = {
  ru: {
    title: `Данные на ${KASPI_TARIFF_CHECKED_TEXT}, источник`,
    commissionIntro: `Ставки и названия строк взяты из таблицы Kaspi «Тарифы Магазина на Kaspi.kz с 5 января 2026 года» (PDF): она действует с ${KASPI_TARIFF_EFFECTIVE_TEXT}. Названия строк даны так, как они написаны в таблице. Источники открыты и сверены ${KASPI_TARIFF_CHECKED_TEXT}. Kaspi может менять тарифы, поэтому перед решением по цене проверьте свой кабинет.`,
    sources: 'Источники:',
    pageUpdated: 'страница Kaspi обновлена',
    pdfNote: `таблица действует с ${KASPI_TARIFF_EFFECTIVE_TEXT}`,
  },
  kk: {
    title: `Деректер ${KASPI_TARIFF_CHECKED_TEXT} күніне, дереккөз`,
    commissionIntro: `Мөлшерлемелер мен жол атаулары Kaspi кестесінен алынған: «Тарифы Магазина на Kaspi.kz с 5 января 2026 года» (PDF, орыс тілінде), ол ${KASPI_TARIFF_EFFECTIVE_TEXT} бастап қолданылады. Жол атаулары кестеде жазылғандай берілген. Дереккөздер ${KASPI_TARIFF_CHECKED_TEXT} күні ашылып, салыстырылған. Kaspi тарифтерді өзгертуі мүмкін, сондықтан баға туралы шешім алдында өз кабинетіңізді тексеріңіз.`,
    sources: 'Дереккөздер:',
    pageUpdated: 'Kaspi-дегі бет жаңартылған',
    pdfNote: `кесте ${KASPI_TARIFF_EFFECTIVE_TEXT} бастап қолданылады`,
  },
} as const

/**
 * Блок "Данные на <дата сверки>, источник" с точными адресами. intro можно
 * заменить (страница доставки, страница про НДС).
 */
export function SourceBlock({
  lang,
  ids,
  intro,
}: {
  lang: GuideLang
  ids: KaspiSourceId[]
  intro?: ReactNode
}) {
  const c = SOURCE_COPY[lang]
  return (
    <>
      <h2>{c.title}</h2>
      <p>{intro ?? c.commissionIntro}</p>
      <p>{c.sources}</p>
      <ul>
        {ids.map(id => {
          const s = KASPI_SOURCES[id]
          const href = kaspiSourceUrl(id, lang)
          return (
            <li key={id}>
              <a href={href} rel="noopener noreferrer">
                {s[lang]}
              </a>
              {', '}
              {s.pageUpdated ? `${c.pageUpdated} ${s.pageUpdated}` : c.pdfNote}
              {'. '}
              <span className="break-all">{href}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const LINKS_COPY = {
  ru: {
    title: 'Посчитать свою прибыль',
    lead: 'Ставку из этой страницы можно подставить в бесплатный',
    calc: 'калькулятор маржи Kaspi',
    leadTail: ': категорию там выбирают вручную. Общий разбор комиссий, доставки и минимальной цены:',
    main: 'комиссия Kaspi Магазина по категориям',
    siblings: 'Другие страницы про комиссии и тарифы Kaspi:',
  },
  kk: {
    title: 'Өз пайдаңызды есептеу',
    lead: 'Осы беттегі мөлшерлемені тегін',
    calc: 'Kaspi маржа калькуляторына',
    leadTail: ' қоюға болады: санатты онда қолмен таңдайды. Комиссиялар, жеткізу және ең төмен баға туралы жалпы талдау:',
    main: 'Kaspi Магазин комиссиясы санаттар бойынша',
    siblings: 'Kaspi комиссиялары мен тарифтері туралы басқа беттер:',
  },
} as const

/** Ссылки на калькулятор, главный гайд и соседние страницы K1-K8. */
export function LinksBlock({ lang, siblings }: { lang: GuideLang; siblings: string[] }) {
  const c = LINKS_COPY[lang]
  const sib = siblings
    .map(slug => KASPI_GUIDES.find(g => g.slug === slug))
    .filter((g): g is Guide => g !== undefined)
  return (
    <>
      <h2>{c.title}</h2>
      <p>
        {c.lead} <Link href={toolLinkPath('margin', lang)}>{c.calc}</Link>
        {c.leadTail} <Link href={guidePath('komissiya-kaspi', lang)}>{c.main}</Link>.
      </p>
      {sib.length > 0 && (
        <>
          <p>{c.siblings}</p>
          <ul>
            {sib.map(g => (
              <li key={g.slug}>
                <Link href={guidePath(g.slug, lang)}>{g[lang].title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

const HUB_COPY = {
  ru: {
    title: 'Комиссии по отдельным категориям и тарифы доставки',
    lead: 'Разборы с полным списком подкатегорий и ставками из тарифа (сверено',
  },
  kk: {
    title: 'Жеке санаттар бойынша комиссиялар және жеткізу тарифтері',
    lead: 'Ішкі санаттардың толық тізімі және тарифтегі мөлшерлемелері бар талдаулар (салыстырылған',
  },
} as const

/**
 * Блок ссылок на K1-K8 для главного гайда /guides/komissiya-kaspi (ru и kk).
 * Пока SEO_TARIFF_BIK_LIVE = false не рисуется: целевые страницы закрыты от
 * индексации, и ссылаться на них из публичной статьи рано.
 */
export function HubLinksBlock({ lang }: { lang: GuideLang }) {
  if (!SEO_TARIFF_BIK_LIVE) return null
  const c = HUB_COPY[lang]
  return (
    <>
      <h2>{c.title}</h2>
      <p>
        {c.lead} {KASPI_TARIFF_CHECKED_TEXT}):
      </p>
      <ul>
        {KASPI_GUIDES.map(g => (
          <li key={g.slug}>
            <Link href={guidePath(g.slug, lang)}>{g[lang].title}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}

/** ["Вино", "Пиво"] -> "«Вино», «Пиво»": названия строк тарифа в кавычках. */
export function quoteList(names: string[]): string {
  return names.map(n => `«${n}»`).join(', ')
}
