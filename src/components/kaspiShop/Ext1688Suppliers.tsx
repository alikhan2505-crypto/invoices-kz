'use client'
import SupplierPhoto from './SupplierPhoto'
import { useExt1688 } from './useExt1688'
import { cnyToKzt, extErrorText, type ExtOffer } from '@/lib/kaspiShop/ext1688'
import type { AppliedSupplier } from './MicSuppliers'

// Товары на 1688 внутри «Найти на 1688» (01.11.2026): поиск идёт в браузере самого пользователя
// через расширение Chrome (1688 отдаёт серверу капчу). Расширение открывает вкладку 1688, человек
// при необходимости проходит проверку, результаты показываются здесь. Данные остаются в браузере и
// на сервер не отправляются.

const money = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kzt = (n: number) => n.toLocaleString('ru-KZ')

function Card({ offer, rate, onApply }: { offer: ExtOffer; rate: number | null; onApply?: (p: AppliedSupplier) => void }) {
  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const
  const k = cnyToKzt(offer.priceCny, rate)
  const link = 'inline-flex items-center min-h-11 text-[13px] font-semibold underline-offset-2 hover:underline'
  return (
    <li className="rounded-xl p-2 flex flex-col min-w-0" style={{ border: '1px solid var(--nav-border)' }}>
      <SupplierPhoto src={offer.imageUrl || null} />
      <span className="block text-[12px] font-medium line-clamp-3 break-words" style={{ color: 'var(--nav-text-primary)' }} title={offer.title}>{offer.title}</span>
      <span className="block text-[13px] font-mono tabular-nums font-semibold mt-1" style={{ color: 'var(--nav-text-primary)' }}>¥{money(offer.priceCny)}</span>
      {k !== null && <span className="block text-[12px] font-mono tabular-nums" style={secondary}>≈ {kzt(k)} ₸</span>}
      {offer.priceNote && <span className="block text-[11px] break-words" style={secondary}>{offer.priceNote}</span>}
      {offer.sales && <span className="block text-[11px] break-words" style={muted}>{offer.sales}</span>}
      {offer.shop && <span className="block text-[11px] truncate" style={muted} title={offer.shop}>{offer.shop}</span>}
      <a href={offer.url} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--nav-accent)' }}>Открыть на 1688 ↗</a>
      {onApply && k !== null && (
        <button type="button" onClick={() => onApply({ source: '1688', priceKzt: k, url: offer.url, moq: null })}
          className="inline-flex items-center min-h-11 text-left text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
          В калькулятор: {kzt(k)} ₸
        </button>
      )}
    </li>
  )
}

export default function Ext1688Suppliers({ queries, cnyKzt, onApply }: {
  queries: { zh: string; ru: string }[]
  cnyKzt: number | null | undefined
  /** Подставить цену и ссылку в калькулятор; есть только в калькуляторе. */
  onApply?: (p: AppliedSupplier) => void
}) {
  const { phase, search, cancel } = useExt1688()
  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const
  const btn = 'rounded-xl px-4 py-2 min-h-11 text-sm font-semibold disabled:opacity-50 text-left'
  const busy = phase.kind === 'searching' || phase.kind === 'captcha' || phase.kind === 'attention'
  const rate = cnyKzt ?? null
  const note = (bg: string) => ({ background: `color-mix(in srgb, ${bg} 12%, transparent)`, color: 'var(--nav-text-secondary)' })

  return (
    <section className="mb-4" aria-labelledby="ext1688-title">
      <h3 id="ext1688-title" className="text-[12px] font-bold uppercase tracking-wider mb-1" style={muted}>Товары на 1688</h3>

      {phase.kind === 'checking' && <p className="text-[12px]" style={muted}>Проверяю расширение Chrome…</p>}

      {phase.kind === 'absent' && (
        <div className="text-[12px]" style={secondary}>
          <p>
            Чтобы увидеть товары 1688 прямо здесь (фото, цены в ¥ и ₸), нужно расширение Chrome на компьютере: оно открывает 1688
            в вашем браузере, а проверку «ползунок» проходите вы. Результаты остаются у вас и на наш сервер не отправляются.
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer min-h-11 inline-flex items-center font-semibold" style={{ color: 'var(--nav-accent)' }}>▸ Как установить (один раз)</summary>
            <ol className="list-decimal pl-5 space-y-1 mb-2">
              <li>В Chrome в адресной строке введите <code>chrome://extensions</code> и нажмите Enter.</li>
              <li>Справа вверху включите «Режим разработчика».</li>
              <li>Нажмите «Загрузить распакованное расширение» и выберите папку <code>extension\invoices-1688</code> внутри папки проекта invoices-kz.</li>
              <li>Вернитесь сюда и обновите страницу (F5). Калькулятор сбросится: снова выберите товар и нажмите «Найти на 1688», блок появится с кнопкой поиска.</li>
            </ol>
          </details>
        </div>
      )}

      {phase.kind !== 'checking' && phase.kind !== 'absent' && (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            {queries.map((q, i) => (
              <button key={q.zh} type="button" disabled={busy} onClick={() => search(q.zh)} className={btn}
                style={i === 0 ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}>
                {i === 0 ? 'Найти товары на 1688: ' : 'Найти: '}<span lang="zh-Hans">{q.zh}</span>{q.ru ? ` (${q.ru})` : ''}
              </button>
            ))}
            {busy && (
              <button type="button" onClick={cancel} className={btn} style={{ border: '1px solid var(--nav-border)', color: 'var(--nav-text-muted)' }}>Отменить</button>
            )}
          </div>

          {phase.kind === 'searching' && <p className="text-[12px]" style={secondary} role="status">Открыл 1688 в соседней вкладке и читаю результаты «<span lang="zh-Hans">{phase.query}</span>»…</p>}
          {phase.kind === 'captcha' && (
            <p className="text-[12px] rounded-lg px-3 py-2" role="status" style={note('var(--nav-warning)')}>
              1688 просит пройти проверку: передвиньте ползунок в открывшейся вкладке 1688. Результаты появятся здесь сами.
            </p>
          )}
          {phase.kind === 'attention' && (
            <p className="text-[12px] rounded-lg px-3 py-2" role="status" style={note('var(--nav-warning)')}>
              1688 долго не показывает результаты. Посмотрите открывшуюся вкладку 1688: возможно, нужно войти или пройти проверку. Если ничего не меняется, нажмите «Отменить» и повторите поиск.
            </p>
          )}
          {phase.kind === 'error' && <p className="text-[12px]" style={{ color: 'var(--nav-critical)' }} role="alert">{extErrorText(phase.reason)}</p>}
          {phase.kind === 'done' && phase.items.length === 0 && (
            <p className="text-[12px]" style={secondary} role="status">По запросу «<span lang="zh-Hans">{phase.query}</span>» на 1688 ничего не нашлось. Попробуйте другой запрос.</p>
          )}

          {phase.kind === 'done' && phase.items.length > 0 && (
            <>
              <p className="text-[12px] mb-2" style={secondary}>
                Результаты 1688 по запросу «<span lang="zh-Hans">{phase.query}</span>» (первые {phase.items.length}, порядок как на сайте, среди них бывает реклама).
                Это цена с карточки поиска: обычно за 1 штуку, но у многих товаров она зависит от количества или временная. Реальную цену и
                минимальную партию смотрите на странице товара. В цене нет доставки в Казахстан, пошлины и НДС 16%. Названия переведены
                автоматически самим сайтом 1688 и могут быть неточными.
              </p>
              <ul className="grid grid-cols-2 gap-2">
                {phase.items.map(o => <Card key={o.id} offer={o} rate={rate} onApply={onApply} />)}
              </ul>
              <p className="text-[11px] mt-2" style={muted}>
                {rate !== null
                  ? `Пересчёт по официальному курсу Нацбанка: 1 ¥ = ${rate.toLocaleString('ru-KZ', { maximumFractionDigits: 2 })} ₸, в обменнике курс выше.`
                  : 'Курс Нацбанка сейчас недоступен, цены только в юанях.'}{' '}
                Данные прочитаны вашим браузером с 1688 и показаны только вам.
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
