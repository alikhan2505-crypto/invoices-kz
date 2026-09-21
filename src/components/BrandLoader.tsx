// Loading state: the wordmark on a navy plate, letters lighting up in a wave.
// White INVOICES, the ".KZ" tail in the accent tint (founder, 21.09.2026).
const HEAD = 'INVOICES'.split('')
const TAIL = '.KZ'.split('')

export default function BrandLoader() {
  return (
    <div className="brand-loader-wrap" role="status" aria-label="Загрузка">
      <div className="brand-loader" aria-hidden="true">
        {HEAD.map((ch, i) => (
          <span key={`h${i}`} className="brand-loader-ch" style={{ animationDelay: `${i * 90}ms` }}>{ch}</span>
        ))}
        {TAIL.map((ch, i) => (
          <span key={`t${i}`} className="brand-loader-ch brand-loader-tail" style={{ animationDelay: `${(HEAD.length + i) * 90}ms` }}>{ch}</span>
        ))}
      </div>
    </div>
  )
}
