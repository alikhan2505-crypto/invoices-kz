import Link from 'next/link'
import { bikBankPath, bikHubPath, getBikBySlug, type BikLang } from '@/lib/bikRegistry'
import BikShell, { Paragraph } from './BikShell'
import CopyBik from './CopyBik'
import { CHROME, bankText, otherBankLinks } from './bikContent'
import { bankJsonLd } from './bikJsonLd'

// /bik/<slug> and /bik/kk/<slug>: one bank whose БИК is confirmed both by the
// National Bank directory and by the bank's own requisites page.
export default function BikBankPage({ slug, lang }: { slug: string; lang: BikLang }) {
  const row = getBikBySlug(slug)
  if (!row) throw new Error(`No БИК page for slug ${slug}`)
  const t = bankText(row, lang)
  const chrome = CHROME[lang]
  const otherLang: BikLang = lang === 'kk' ? 'ru' : 'kk'
  const others = otherBankLinks(slug, lang)

  return (
    <BikShell
      lang={lang}
      title={t.title}
      summary={t.summary}
      switchHref={bikBankPath(slug, otherLang)}
      faq={t.faq}
      jsonLd={bankJsonLd(row, lang)}
      campaign={`bik-${slug}`}
    >
      <h2>{t.detailsH2}</h2>
      <div className="guide-table-wrap">
        <table>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={r.label}>
                <th scope="row" style={{ textTransform: 'none', whiteSpace: 'normal', letterSpacing: 0 }}>{r.label}</th>
                <td
                  className={r.mono ? 'tabular-nums' : undefined}
                  style={r.mono ? { fontFamily: 'var(--font-geist-mono), monospace' } : undefined}
                >
                  <strong>{r.value}</strong>
                  {i === 0 && <CopyBik value={row.bik} label={chrome.copy} doneLabel={chrome.copied} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">{t.detailsNote}</p>

      <h2>{t.howToH2}</h2>
      {t.howTo.map((p, i) => (
        <Paragraph key={i} para={p} />
      ))}

      {t.extras && (
        <>
          <h2>{t.extras.h2}</h2>
          {t.extras.paras.map((p, i) => (
            <Paragraph key={i} para={p} />
          ))}
        </>
      )}

      <h2>{t.sourceH2}</h2>
      {t.sources.map((p, i) => (
        <Paragraph key={i} para={p} />
      ))}
      <p className="note">{t.sourceAdvice}</p>

      <h2>{chrome.otherBanks}</h2>
      <ul>
        <li>
          <Link href={bikHubPath(lang)}>{chrome.hubLink}</Link>
        </li>
        {others.map(o => (
          <li key={o.href}>
            <Link href={o.href}>{o.text}</Link>
          </li>
        ))}
      </ul>
    </BikShell>
  )
}
