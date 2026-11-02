import type { ToolFunnel } from '@/lib/toolEvents/funnel'

// Утренняя сводка основателю «воронка за вчера» (cron/funnel-daily, 09:00 по Алматы).
// Чистый построитель текста: числа приходят готовыми, чтобы формат проверялся без базы.
// Простой текст без разметки (sendFounderTelegram шлёт без parse_mode).

export interface DailyFunnelInput {
  label: string // «01.11 (вс)» — день, за который сводка
  funnel: ToolFunnel
  signups: number | null
  signupsPrev: number | null
  invoices: number | null
  binWatch: number | null
  igPosts: { kind: string; at: string }[] | null
}

const n = (v: number | null) => (v === null ? 'н/д' : String(v))

export function buildDailyFunnelText(d: DailyFunnelInput): string {
  const f = d.funnel
  const t = f.totals
  const lines: string[] = []
  lines.push(`Сводка за ${d.label}`)
  lines.push('')
  lines.push(`Регистрации: ${n(d.signups)} (днём раньше ${n(d.signupsPrev)})`)
  lines.push(`Новых счетов у клиентов: ${n(d.invoices)}`)
  lines.push(`Слежений за БИН добавлено: ${n(d.binWatch)}`)
  lines.push('')

  if (t.visitors === 0 && t.docs === 0) {
    lines.push('Бесплатные инструменты: посетителей не было.')
  } else {
    lines.push(`Бесплатные инструменты: ${t.visitors} посетителей, документов ${t.docs}, нажали «зарегистрироваться» ${t.cta}.`)
    const active = f.tools.filter(x => x.visitors > 0 || x.docs > 0)
    for (const x of active) lines.push(`  ${x.tool}: ${x.visitors} пос., ${x.docs} док.`)
    const srcs = f.sources.filter(x => x.source).slice(0, 4)
    if (srcs.length) lines.push(`Откуда: ${srcs.map(s => `${s.source}${s.medium ? '/' + s.medium : ''} ${s.visitors}`).join(', ')}`)
  }
  lines.push('')

  const step = (e: string) => f.login.steps.find(s => s.event === e)?.visitors ?? 0
  const open = step('login_open')
  const repeat = f.login.repeat
  if (open === 0 && repeat.browsers === 0) {
    lines.push('Страница входа: никто не открывал.')
  } else {
    lines.push(`Страница входа: открыли ${open}, «получить ссылку» ${step('login_email_press')}, письмо ушло ${step('login_link_sent')}, Google ${step('login_google')}, Facebook ${step('login_facebook')}.`)
    if (repeat.browsers > 0) lines.push(`Не посчитано как людей: ${repeat.browsers} браузеров с 3+ открытиями за день (похоже на автоматику).`)
  }
  lines.push('')

  if (d.igPosts === null) lines.push('Instagram: н/д')
  else if (d.igPosts.length === 0) lines.push('Instagram: публикаций не было.')
  else lines.push(`Instagram: опубликовано: ${d.igPosts.map(p => `${p.kind} в ${p.at}`).join(', ')}.`)

  return lines.join('\n')
}
