'use client'
import type { Lang } from '@/components/LanguageProvider'
import ProductArt from '@/components/products/ProductArt'
import { useSceneStep } from '@/components/products/useSceneStep'
import './kaspi-scene.css'
import './agent-scene.css'
import './cfo-scene.css'

// «Живой CFO» на лендинге CFO-кабинета — по эталону Kaspi Bot (13.10.2026).
// Сюжет: 1) показатели и план/факт; 2) платёжный календарь рисует прогноз
// остатка и находит кассовый разрыв 24 октября — предлагает перенести
// платёж, жмём «Перенести», линия выправляется; 3) переключатель
// «Бизнес → Семья» — тот же кабинет говорит языком семейного бюджета
// (правка основателя 13.10: «можно пользоваться и для семейного бюджета»).
// В конце выезжает отчёт. Данные выдуманные.

type Mode = { cal: string; ok: string; next: string; pays: [string, string, string][]; kpis: [string, string, string][]; plan: string; rows: [string, number][]; doc: string; docRows: [string, string][] }
type Copy = { app: string; biz: string; fam: string; gap: string; suggest: string; move: string; moved: string; movedF: string; days: [string, string, string]; b: Mode; f: Mode }
const T: Record<Lang, Copy> = {
  ru: {
    app: 'CFO · Обзор', biz: 'Бизнес', fam: 'Семья', gap: 'Кассовый разрыв · 24 окт · −380 000 ₸',
    suggest: 'Перенести оплату поставщику на 28 окт', moved: 'Платёж поставщику перенесён на 28 окт', movedF: 'Крупная покупка перенесена на 28 окт', move: 'Перенести', days: ['1 окт', '15', '31'],
    b: {
      cal: 'Платёжный календарь', ok: 'Разрыва нет — запас 47 дней',
      next: 'Ближайшие платежи', pays: [['25 окт', 'Аренда', '−450 000 ₸'], ['28 окт', 'Поставщик', '−1 200 000 ₸'], ['31 окт', 'Зарплата', '−1 600 000 ₸']],
      kpis: [['Выручка', '4,2 млн ₸', '+12%'], ['Маржа', '31%', '+3 п.'], ['Запас денег', '47 дней', '']],
      plan: 'План / факт · октябрь', rows: [['Аренда', 96], ['Зарплата', 100], ['Реклама', 128]],
      doc: 'Отчёт о прибылях · октябрь', docRows: [['Выручка', '4 200 000'], ['Себестоимость', '−2 310 000'], ['Расходы', '−590 000'], ['Чистая прибыль', '1 300 000']],
    },
    f: {
      cal: 'Платежи семьи', ok: 'Денег хватает до конца месяца',
      next: 'Ближайшие платежи', pays: [['25 окт', 'Ипотека', '−240 000 ₸'], ['28 окт', 'Кружки детей', '−60 000 ₸'], ['31 окт', 'Коммуналка', '−45 000 ₸']],
      kpis: [['Доходы семьи', '820 000 ₸', '+5%'], ['Отложено', '18%', '+2 п.'], ['Подушка', '3,5 мес', '']],
      plan: 'Бюджет · октябрь', rows: [['Продукты', 92], ['Кружки детей', 100], ['Кафе и такси', 131]],
      doc: 'Семейный бюджет · октябрь', docRows: [['Доходы', '820 000'], ['Обязательные', '−410 000'], ['Жизнь', '−270 000'], ['Отложено', '140 000']],
    },
  },
  kk: {
    app: 'CFO · Шолу', biz: 'Бизнес', fam: 'Отбасы', gap: 'Кассалық үзіліс · 24 қаз · −380 000 ₸',
    suggest: 'Жеткізушіге төлемді 28 қазанға ауыстыру', moved: 'Жеткізушіге төлем 28 қазанға ауыстырылды', movedF: 'Ірі сатып алу 28 қазанға ауыстырылды', move: 'Ауыстыру', days: ['1 қаз', '15', '31'],
    b: {
      cal: 'Төлем күнтізбесі', ok: 'Үзіліс жоқ — қор 47 күн',
      next: 'Жақын төлемдер', pays: [['25 қаз', 'Жалдау', '−450 000 ₸'], ['28 қаз', 'Жеткізуші', '−1 200 000 ₸'], ['31 қаз', 'Жалақы', '−1 600 000 ₸']],
      kpis: [['Түсім', '4,2 млн ₸', '+12%'], ['Маржа', '31%', '+3 т.'], ['Ақша қоры', '47 күн', '']],
      plan: 'Жоспар / факт · қазан', rows: [['Жалдау', 96], ['Жалақы', 100], ['Жарнама', 128]],
      doc: 'Пайда туралы есеп · қазан', docRows: [['Түсім', '4 200 000'], ['Өзіндік құн', '−2 310 000'], ['Шығыстар', '−590 000'], ['Таза пайда', '1 300 000']],
    },
    f: {
      cal: 'Отбасы төлемдері', ok: 'Ай соңына дейін ақша жетеді',
      next: 'Жақын төлемдер', pays: [['25 қаз', 'Ипотека', '−240 000 ₸'], ['28 қаз', 'Үйірмелер', '−60 000 ₸'], ['31 қаз', 'Коммуналдық', '−45 000 ₸']],
      kpis: [['Отбасы табысы', '820 000 ₸', '+5%'], ['Жинақ', '18%', '+2 т.'], ['Қор', '3,5 ай', '']],
      plan: 'Бюджет · қазан', rows: [['Азық-түлік', 92], ['Балалар үйірмесі', 100], ['Кафе мен такси', 131]],
      doc: 'Отбасы бюджеті · қазан', docRows: [['Табыс', '820 000'], ['Міндетті', '−410 000'], ['Тұрмыс', '−270 000'], ['Жинақ', '140 000']],
    },
  },
  en: {
    app: 'CFO · Overview', biz: 'Business', fam: 'Family', gap: 'Cash gap · Oct 24 · −380,000 ₸',
    suggest: 'Move the supplier payment to Oct 28', moved: 'Supplier payment moved to Oct 28', movedF: 'Big purchase moved to Oct 28', move: 'Move', days: ['Oct 1', '15', '31'],
    b: {
      cal: 'Payment calendar', ok: 'No gap — 47 days of runway',
      next: 'Upcoming payments', pays: [['Oct 25', 'Rent', '−450,000 ₸'], ['Oct 28', 'Supplier', '−1,200,000 ₸'], ['Oct 31', 'Salaries', '−1,600,000 ₸']],
      kpis: [['Revenue', '4.2M ₸', '+12%'], ['Margin', '31%', '+3 pt'], ['Runway', '47 days', '']],
      plan: 'Plan vs actual · Oct', rows: [['Rent', 96], ['Salaries', 100], ['Ads', 128]],
      doc: 'Profit & loss · October', docRows: [['Revenue', '4,200,000'], ['Cost of sales', '−2,310,000'], ['Expenses', '−590,000'], ['Net profit', '1,300,000']],
    },
    f: {
      cal: 'Family payments', ok: 'Money lasts to month end',
      next: 'Upcoming payments', pays: [['Oct 25', 'Mortgage', '−240,000 ₸'], ['Oct 28', 'Kids’ clubs', '−60,000 ₸'], ['Oct 31', 'Utilities', '−45,000 ₸']],
      kpis: [['Family income', '820,000 ₸', '+5%'], ['Saved', '18%', '+2 pt'], ['Cushion', '3.5 mo', '']],
      plan: 'Budget · Oct', rows: [['Groceries', 92], ['Kids’ clubs', 100], ['Cafés & taxis', 131]],
      doc: 'Family budget · October', docRows: [['Income', '820,000'], ['Fixed bills', '−410,000'], ['Living', '−270,000'], ['Saved', '140,000']],
    },
  },
}

// Раскадровка (шаг = 1 с): 1 рисуется прогноз и показатели · 2 найден разрыв
// · 3 подсказка · 4–5 курсор и «Перенести» · 6 линия выправилась · 7 выезжает
// отчёт · 9 переключатель на «Семья» · 10–14 пауза · 15 гаснет.
const STEPS = 16
const FINAL = 12

const LINE_GAP = 'M0 44 C30 40 60 58 95 52 S145 82 172 108 S215 70 245 48 S285 30 300 28'
const LINE_OK = 'M0 44 C30 40 60 58 95 52 S145 70 172 78 S215 62 245 48 S285 30 300 28'

export default function CfoLiveScene({ lang }: { lang: Lang }) {
  const t = T[lang]
  const { step, ref } = useSceneStep(STEPS, FINAL)
  const family = step >= 9
  const m = family ? t.f : t.b
  const drawn = step >= 1
  const gap = step >= 2 && step < 6
  const fixed = step >= 6
  const fading = step === STEPS - 1

  return (
    <div ref={ref} className="ks-wrap" data-theme="cfo" aria-hidden="true">
      <div className="ks-win" data-fading={fading} data-reset={step === 0}>
        <div className="ks-bar">
          <i /><i /><i />
          <b>{t.app}</b>
          <span className="cf-toggle" data-family={family}>
            <span>{t.biz}</span><span>{t.fam}</span><em />
          </span>
        </div>

        <div className="ks-body">
          <section className="ks-card cf-cal">
            <div className="ks-head">
              <span className="ks-title cf-swap" key={`c${family}`}>{m.cal}</span>
              <span className="cf-flag" data-state={gap ? 'gap' : fixed ? 'ok' : 'off'}>{gap ? t.gap : fixed ? m.ok : ''}</span>
            </div>
            <div className="cf-chart" data-drawn={drawn}>
              <svg viewBox="0 0 300 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="cf-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2DC48D" stopOpacity=".28" /><stop offset="1" stopColor="#2DC48D" stopOpacity="0" /></linearGradient>
                </defs>
                <line x1="0" y1="92" x2="300" y2="92" className="cf-zero" />
                <rect x="150" y="92" width="46" height="28" className="cf-red" data-on={gap} />
                <path d={`${LINE_OK} L300 120 L0 120 Z`} fill="url(#cf-area)" className="cf-fill" />
                <path d={LINE_GAP} className="cf-line cf-line-gap" data-on={!fixed} pathLength={1} />
                <path d={LINE_OK} className="cf-line cf-line-ok" data-on={fixed} pathLength={1} />
                <circle cx="172" cy="108" r="4" className="cf-dot" data-on={gap} />
              </svg>
              <div className="cf-days"><span>{t.days[0]}</span><span>{t.days[1]}</span><span>{t.days[2]}</span></div>
            </div>
            <div className="cf-suggest" data-in={step >= 3} data-done={fixed}>
              <span key={`m${family}`} className={family ? 'cf-swap' : undefined}>{fixed ? <>✓ {family ? t.movedF : t.moved}</> : t.suggest}</span>
              {!fixed && <span className="ks-btnwrap">
                <span className="ks-btn" data-press={step === 5}>{t.move}</span>
                <span className="ks-cursor" data-at={step === 4 ? 'near' : step === 5 ? 'btn' : 'off'}>
                  <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 1.6L10.5 19z" fill="#0E3B35" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                </span>
              </span>}
            </div>
          </section>

          <section className="ks-card cf-side">
            <div className="cf-kpis">
              {m.kpis.map(([label, value, delta], i) => (
                <span key={`${family}${i}`} className="cf-kpi" data-on={drawn} style={{ animationDelay: `${i * 90}ms` }}>
                  <em>{label}</em><b>{value}</b>{delta && <i>{delta}</i>}
                </span>
              ))}
            </div>
            <div className="ks-head"><span className="ks-title cf-swap" key={`p${family}`}>{m.plan}</span></div>
            <div className="cf-rows">
              {m.rows.map(([label, pct], i) => (
                <span key={`${family}${i}`} className="cf-row">
                  <em>{label}</em>
                  <span className="cf-bar"><i style={{ width: `${Math.min(pct, 100) * 0.78}%`, transform: `scaleX(${drawn ? 1 : 0})` }} data-over={pct > 100} /></span>
                  <b data-over={pct > 100}>{drawn ? `${pct}%` : ''}</b>
                </span>
              ))}
            </div>
            <div className="ks-head"><span className="ks-title cf-swap" key={`n${family}`}>{m.next}</span></div>
            <div className="cf-pays">
              {m.pays.map(([d, what, sum], i) => (
                <span key={`${family}${i}`} className="cf-pay" data-on={drawn} data-hl={i === 1 && step >= 6 && !family}><i>{d}</i><em>{what}</em><b>{sum}</b></span>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Картинка CFO с плитки хаба (столбцы и тренд, «+12 %») — у угла окна. */}
      <span className="ks-box cf-art" data-shake={step === 6}><ProductArt product="cfo" /></span>

      <div className="ks-label cf-label" data-in={step >= 7 && !fading}>
        <div className="ks-a6 cf-doc">
          <b className="cf-doc-title" key={`d${family}`}>{m.doc}</b>
          <span className="cf-doc-sub">invoices.kz · CFO</span>
          <div className="cf-doc-rows">
            {m.docRows.map(([k, v], i) => <span key={`${family}${i}`} data-total={i === m.docRows.length - 1}><i>{k}</i><b>{v}</b></span>)}
          </div>
          <div className="cf-doc-bars">{[38, 52, 46, 64, 58, 76].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
        </div>
      </div>
    </div>
  )
}
