'use client'
import { useState } from 'react'
import type { SuppliersPayload, SupplierCard } from '@/lib/kaspiShop/madeInChina'
import { isSellableUnit, moqText } from '@/lib/kaspiShop/micUnits'

// Товары у поставщиков Made-in-China.com внутри «Найти на 1688» (31.10.2026): фото, цена в долларах
// и тенге, минимальная партия, поставщик, ссылка на карточку. Цены экспортные и без доставки,
// пошлины и НДС, это сказано на экране. Пока админ-гейт: условия сайта без письменного согласия
// запрещают использовать его данные (см. madeInChina.ts).

export interface AppliedSupplier {
  priceKzt: number
  url: string
  /** «500 шт» или null, если партию не знаем. */
  moq: string | null
}

const usd = (n: number) => `$${n.toFixed(2)}`
const kzt = (n: number) => n.toLocaleString('ru-KZ')

function priceUsd(i: SupplierCard): string {
  if (!i.rangeVerified) return `до ${usd(i.highUsd)}`
  return i.lowUsd === i.highUsd ? usd(i.lowUsd) : `${usd(i.lowUsd)}–${usd(i.highUsd)}`
}

function priceKzt(i: SupplierCard): string | null {
  if (i.lowKzt === null || i.highKzt === null) return null
  if (!i.rangeVerified) return `≈ до ${kzt(i.highKzt)} ₸`
  return i.lowKzt === i.highKzt ? `≈ ${kzt(i.lowKzt)} ₸` : `≈ ${kzt(i.lowKzt)}–${kzt(i.highKzt)} ₸`
}

/** Фото с запасным блоком: CDN поставщика может не отвечать, пустой белый квадрат ничего не говорит. */
function Photo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="w-full aspect-square rounded-lg mb-2 flex items-center justify-center text-[11px]"
        style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)', border: '1px solid var(--nav-border)' }}>
        Нет фото
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
      className="w-full aspect-square object-contain rounded-lg mb-2" style={{ background: '#fff' }} />
  )
}

export default function MicSuppliers({ data, onApply }: {
  data: SuppliersPayload
  /** Подставить цену (тенге, верхняя граница) и ссылку в калькулятор; есть только в калькуляторе. */
  onApply?: (p: AppliedSupplier) => void
}) {
  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const
  const link = 'inline-flex items-center min-h-11 text-[13px] font-semibold underline-offset-2 hover:underline'

  return (
    <section className="mb-4" aria-labelledby="mic-title">
      <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
        <h3 id="mic-title" className="text-[11px] font-bold uppercase tracking-wider" style={muted}>Товары у поставщиков</h3>
        <span className="text-[11px]" style={muted}>Made-in-China.com · поиск «{data.query}»</span>
      </div>

      {data.status === 'unavailable' && (
        <p className="text-[12px]" style={secondary} role="status">
          Made-in-China сейчас не ответил. Это не значит, что товаров нет.{' '}
          <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--nav-accent)' }}>Открыть поиск вручную ↗</a>
        </p>
      )}

      {data.status === 'ok' && data.items.length === 0 && (
        <p className="text-[12px]" style={secondary} role="status">
          На Made-in-China по запросу «{data.query}» ничего не нашлось. Попробуйте другое слово прямо в их поиске.{' '}
          <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--nav-accent)' }}>Открыть поиск ↗</a>
        </p>
      )}

      {data.status === 'ok' && data.items.length > 0 && (
        <>
          <p className="text-[12px] mb-2" style={secondary}>
            Экспортные цены в долларах: без доставки, пошлины и НДС 16%. На 1688 тот же товар обычно дешевле.
            Цена действует от минимальной партии, а единицу цены проверьте в карточке товара.
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {data.items.map(i => {
              const k = priceKzt(i)
              const moq = moqText(i.moqQty, i.moqUnit)
              const sellable = isSellableUnit(i.moqUnit)
              const canApply = !!onApply && i.exact && i.highKzt !== null && sellable
              return (
                <li key={i.url + i.name} className="rounded-xl p-2 flex flex-col" style={{ border: '1px solid var(--nav-border)' }}>
                  <Photo src={i.imageUrl} />
                  <span className="block text-[12px] font-medium line-clamp-2" style={{ color: 'var(--nav-text-primary)' }} title={i.name}>{i.name}</span>
                  <span className="block text-[13px] font-mono tabular-nums font-semibold mt-1" style={{ color: 'var(--nav-text-primary)' }}>{priceUsd(i)}</span>
                  {k && <span className="block text-[12px] font-mono tabular-nums" style={secondary}>{k}</span>}
                  <span className="block text-[11px] mt-1" style={secondary}>{moq ? `Мин. партия: ${moq}` : 'Мин. партию смотрите в карточке'}</span>
                  {i.supplier && <span className="block text-[11px] truncate" style={muted} title={i.supplier}>{i.supplier}</span>}
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--nav-accent)' }}>
                    {i.exact ? 'Открыть товар ↗' : 'Открыть выдачу ↗'}
                  </a>
                  {canApply && (
                    <button type="button" onClick={() => onApply({ priceKzt: i.highKzt as number, url: i.url, moq })}
                      className="inline-flex items-center min-h-11 text-left text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
                      В калькулятор: {kzt(i.highKzt as number)} ₸
                    </button>
                  )}
                  {onApply && !canApply && i.exact && (
                    <span className="block text-[11px] mt-1" style={muted}>Цена не за штуку или единица неизвестна: в калькулятор вручную.</span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] mt-2" style={muted}>
            {data.usdKzt !== null
              ? `Пересчёт по официальному курсу Нацбанка: 1 $ = ${data.usdKzt.toLocaleString('ru-KZ', { maximumFractionDigits: 2 })} ₸, в обменнике курс выше. В калькулятор подставляется верхняя граница цены.`
              : 'Курс Нацбанка сейчас недоступен, цены только в долларах.'}{' '}
            Данные Made-in-China.com, не наши, могут отставать до 6 часов.{' '}
            <a href={data.searchUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--nav-accent)' }}>Все результаты на Made-in-China ↗</a>
          </p>
        </>
      )}
    </section>
  )
}
