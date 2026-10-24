import Link from 'next/link'
import {
  BIK_BANKS,
  BIK_NON_BANKS,
  bikBankPath,
  bikHubPath,
  type BikLang,
} from '@/lib/bikRegistry'
import BikShell, { Paragraph } from './BikShell'
import { bankLinkName, hubText } from './bikContent'
import { hubJsonLd } from './bikJsonLd'

const MONO = { fontFamily: 'var(--font-geist-mono), monospace' } as const

// /bik (ru) and /bik/kk (kk): the full table of the National Bank's БИК directory.
export default function BikHubPage({ lang }: { lang: BikLang }) {
  const t = hubText(lang)
  const otherLang: BikLang = lang === 'kk' ? 'ru' : 'kk'

  return (
    <BikShell
      lang={lang}
      title={t.title}
      summary={t.summary}
      switchHref={bikHubPath(otherLang)}
      faq={t.faq}
      jsonLd={hubJsonLd(lang)}
      campaign="bik-hub"
    >
      <h2>{t.whatIs.h2}</h2>
      {t.whatIs.paras.map((p, i) => (
        <Paragraph key={i} para={p} />
      ))}

      <h2>{t.banks.h2}</h2>
      <p>{t.banks.intro}</p>
      <div className="guide-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t.banks.head.bik}</th>
              <th>{t.banks.head.code}</th>
              <th>{t.banks.head.name}</th>
              <th>{t.banks.head.confirm}</th>
              <th>{t.banks.head.page}</th>
            </tr>
          </thead>
          <tbody>
            {BIK_BANKS.map(r => (
              <tr key={r.bik}>
                <td className="tabular-nums" style={MONO}>{r.bik}</td>
                <td className="tabular-nums">{r.code}</td>
                <td>{r.displayName}</td>
                <td>{r.confirmedOnBankSite ? t.banks.confirmBoth : t.banks.confirmNbk}</td>
                <td>
                  {r.confirmedOnBankSite && r.slug ? (
                    <Link href={bikBankPath(r.slug, lang)}>{t.banks.pageLink(bankLinkName(r, lang))}</Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t.others.h2}</h2>
      <p>{t.others.intro}</p>
      <div className="guide-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t.others.head.bik}</th>
              <th>{t.others.head.code}</th>
              <th>{t.others.head.name}</th>
            </tr>
          </thead>
          <tbody>
            {BIK_NON_BANKS.map(r => (
              <tr key={r.bik}>
                <td className="tabular-nums" style={MONO}>{r.bik}</td>
                <td className="tabular-nums">{r.code}</td>
                <td>{r.displayName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t.renames.h2}</h2>
      {t.renames.paras.map((p, i) => (
        <Paragraph key={i} para={p} />
      ))}

      <h2>{t.check.h2}</h2>
      {t.check.paras.map((p, i) => (
        <Paragraph key={i} para={p} />
      ))}

      <h2>{t.source.h2}</h2>
      {t.source.paras.map((p, i) => (
        <Paragraph key={i} para={p} />
      ))}
    </BikShell>
  )
}
