import { BOT_USERNAME, botStartLink, type BotStartSource } from '@/lib/binBot/links'

// Приглашение в Telegram-бота «Проверка БИН» (30.10.2026, решение основателя: рекламировать везде).
// Ссылка несёт метку места (start=...): бот при /start записывает, откуда пришёл человек.
// Серверный компонент без состояния: безопасен и в клиентских, и в серверных страницах.
// kk: вычитка носителем языка ждёт основателя (список «Тексты на вычитку»). В строках нет тире и эмодзи.

const TEXTS = {
  ru: { lead: 'Или проверьте в Telegram: пришлите БИН боту', note: '3 проверки в квартал бесплатно' },
  kk: { lead: 'Немесе Telegram арқылы тексеріңіз: ботқа БСН жіберіңіз', note: 'Тоқсанына 3 тексеру тегін' },
  en: { lead: 'Or check in Telegram: send the BIN to the bot', note: '3 free checks per quarter' },
} as const

export default function TelegramBotCta({ lang, source, className }: { lang: 'ru' | 'kk' | 'en'; source: BotStartSource; className?: string }) {
  const t = TEXTS[lang]
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12px]" style={{ color: 'var(--nav-text-secondary)' }}>{t.lead}</span>
        <a
          href={botStartLink(source)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-semibold min-h-11 inline-flex items-center"
          style={{ color: 'var(--nav-accent)' }}
        >
          @{BOT_USERNAME}
        </a>
        <span className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>{t.note}</span>
      </div>
    </div>
  )
}
