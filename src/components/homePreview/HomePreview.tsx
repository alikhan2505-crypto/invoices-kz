'use client'

import Link from 'next/link'
import { useRef, type CSSProperties } from 'react'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { useTheme } from '@/components/ThemeProvider'
import { BrandWordmarkSvg } from '@/components/BrandWordmark'
import { PseudoQr } from '@/components/marketing/invoicesLanding/PseudoQr'
import { PRODUCTS } from '@/lib/products'
import { HUB_COPY, FREE_TOOLS, FREE_TOOLS_COPY } from '@/lib/i18n/productsHub'
import { toolLinkPath, toolsIndexPath } from '@/lib/tools-i18n'
import { HP_COPY } from './copy'
import { BOUNDS, anchorFraction, swap, swapOut, win } from './timeline'
import { useScrub } from './useScrub'
import './home-preview.css'

// Превью новой главной: «липкая» сцена, где счёт заполняется по мере
// прокрутки (строки, НДС, Kaspi QR, штамп), потом камера отъезжает и видны
// остальные продукты. Живёт отдельно на /home-preview, ничего существующего
// не меняет. Без JS и при reduced-motion та же разметка идёт столбиком:
// счёт в готовом виде, пять глав текстом, плитки (см. home-preview.css).

const LANGS: { key: Lang; label: string }[] = [
  { key: 'ru', label: 'Рус' },
  { key: 'kk', label: 'Қаз' },
  { key: 'en', label: 'Eng' },
]

const TILE_WINDOWS: [number, number][] = [[0.84, 0.90], [0.875, 0.935], [0.91, 0.97]]
const SEG_END = 0.96

// Окна строк карточки. Окно стоит на ТЕХ элементах, что читают --t/--e (серая
// заглушка и текст строки отдельно): переменные окна не наследуются
// (@property inherits: false), потомков при каждом кадре никто не пересчитывает.
const W_CLIENT = win(0.045, 0.1)
const W_SERVICE = win(0.1, 0.19)
const W_VAT = win(0.26, 0.34)

const money = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`
const SERVICE = 150000
const VAT = 24000
const TOTAL = SERVICE + VAT

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

function TileIcon({ k }: { k: 'kaspiShop' | 'aiAgent' | 'cfo' }) {
  if (k === 'kaspiShop') {
    return (
      <svg {...ICON}>
        <path d="M4.5 9 5.7 4.5h12.6L19.5 9" />
        <path d="M4.5 9a2 2 0 0 0 4 .1 2 2 0 0 0 4-.1 2 2 0 0 0 4 .1 2 2 0 0 0 4-.1" />
        <path d="M5.5 9.3V20h13V9.3" />
        <path d="M10 20v-5.5h4V20" />
      </svg>
    )
  }
  if (k === 'aiAgent') {
    return (
      <svg {...ICON}>
        <rect x="4" y="5" width="16" height="11" rx="3.5" />
        <path d="M9 20.5 11.2 16h1.6L15 20.5" />
        <circle cx="9.2" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.8" cy="10.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg {...ICON}>
      <path d="M4 4v16h16" />
      <path d="M7.5 15l3.5-4 3 2.5L19 8" />
    </svg>
  )
}

function ThemeIcon({ dark }: { dark: boolean }) {
  // dark = сейчас тёмная тема: рисуем солнце (куда переключим), иначе луну
  return dark ? (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  ) : (
    <svg {...ICON}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
    </svg>
  )
}

export default function HomePreview({ fontClass }: { fontClass: string }) {
  const { lang, setLang } = useLanguage()
  const { theme, toggle } = useTheme()
  const t = HP_COPY[lang]
  const hub = HUB_COPY[lang]
  const free = FREE_TOOLS_COPY[lang]
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  useScrub(sectionRef, stageRef)

  const themeLabel = theme === 'dark' ? t.themeToLight : t.themeToDark
  const kickers = [t.kickerIntro, ...t.rail.map((r, i) => `${i + 1} / 5 · ${r}`)]
  const tileProduct = (key: string) => PRODUCTS.find((p) => p.key === key)

  const themeButton = (cls: string) => (
    <button type="button" className={`hp-iconbtn ${cls}`} onClick={toggle} aria-label={themeLabel} title={themeLabel}>
      <ThemeIcon dark={theme === 'dark'} />
    </button>
  )

  return (
    <div className={`hp-root ${fontClass}`} data-lang={lang}>
      <header className="hp-top">
        <Link href="/" className="hp-logo" aria-label="invoices.kz"><BrandWordmarkSvg height={13} /></Link>
        <span className="hp-spacer" />
        <div className="hp-lang" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.key} type="button" data-on={lang === l.key} aria-pressed={lang === l.key} onClick={() => setLang(l.key)}>{l.label}</button>
          ))}
        </div>
        {themeButton('hp-theme-top')}
        <Link href="/login" className="hp-login">{hub.signIn}</Link>
      </header>

      <main>
        <section className="hp-story" ref={sectionRef} aria-labelledby="hp-h1">
          <h1 id="hp-h1" className="hp-sr">{t.h1}</h1>
          <div className="hp-stage" ref={stageRef} data-ch="0">
            <div className="hp-bg" aria-hidden="true">
              <i className="hp-dots" />
              <i className="hp-blob hp-b1" />
              <i className="hp-blob hp-b2" />
              <i className="hp-blob hp-b3" />
            </div>

            <div className="hp-inner">
              {/* ---------------------------------------------- текст */}
              <div className="hp-copy">
                <div className="hp-kick" aria-hidden="true">
                  {kickers.map((k, j) => (
                    <span key={j} className="hp-wk" data-i={j} style={swap(j)}>{k}</span>
                  ))}
                </div>

                <div className="hp-h" aria-hidden="true">
                  <div className="hp-hmain">
                    <span className="hp-ha hp-sw" style={swapOut(-1, -0.97, 0.78 - 0.022, 0.78 - 0.002)}>{t.headA}</span>
                    <span className="hp-hw">
                      {t.words.map((w, j) => (
                        <span key={j} className="hp-wk hp-wd" data-i={j} style={swap(j)}>{w}</span>
                      ))}
                    </span>
                  </div>
                  <div className="hp-hend hp-wk" data-i={5} style={swap(5)}>
                    <span>{t.headEnd[0]}</span>
                    <span>{t.headEnd[1]}</span>
                  </div>
                </div>

                <div className="hp-subs">
                  <div className="hp-s hp-wk" data-i={0} style={swap(0)}>
                    <p className="hp-p">{t.intro}</p>
                    <div className="hp-cta">
                      <Link href="/login" className="hp-btn">{t.ctaPrimary}</Link>
                      <Link href={toolsIndexPath(lang)} className="hp-link">{t.ctaTools}</Link>
                    </div>
                  </div>
                  {t.chapters.map((c, i) => (
                    <div key={i} className="hp-s hp-wk" data-i={i + 1} style={swap(i + 1)} aria-hidden="true">
                      <p className="hp-p">{c}</p>
                      {i === 2 && <p className="hp-note">{t.qrNote}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* ------------------------------------------- объект */}
              <div className="hp-obj">
                <div className="hp-cardwrap">
                  <div className="hp-card" aria-hidden="true">
                    <i className="hp-ring hp-t" style={win(0.64, 0.76)} />
                    <div className="hp-paper">
                      <div className="hp-chrome">
                        <i className="hp-dot hp-d1" /><i className="hp-dot hp-d2" /><i className="hp-dot hp-d3" />
                        <span className="hp-url">{t.mock.url}</span>
                        <span className="hp-sample">{t.mock.sample}</span>
                      </div>
                      <div className="hp-body">
                        <div className="hp-head">
                          <div className="hp-who">
                            <div className="hp-num">{t.mock.number}</div>
                            <div className="hp-fill hp-client">
                              <span className="hp-skel hp-t" style={W_CLIENT}><i /></span>
                              <span className="hp-fillc hp-clientname hp-t" style={W_CLIENT}>{t.mock.client}</span>
                            </div>
                          </div>
                          <span className="hp-chips">
                            <span className="hp-chip hp-c0 hp-sw" style={swapOut(-1, -0.97, 0.44, 0.46)}>{t.mock.draft}</span>
                            <span className="hp-chip hp-c1 hp-sw" style={swapOut(0.44, 0.48, 0.62, 0.64)}>{t.mock.awaiting}</span>
                            <span className="hp-chip hp-c2 hp-sw" style={swapOut(0.62, 0.66, null)}>{t.mock.paid}</span>
                          </span>
                        </div>

                        <div className="hp-rows">
                          <div className="hp-row hp-fill">
                            <span className="hp-skel hp-t" style={W_SERVICE}><i /><i /></span>
                            <span className="hp-fillc hp-rowc hp-t" style={W_SERVICE}><span>{t.mock.service}</span><span className="hp-money">{money(SERVICE)}</span></span>
                          </div>
                          <div className="hp-row hp-fill">
                            <span className="hp-skel hp-t" style={W_VAT}><i /><i /></span>
                            <span className="hp-fillc hp-rowc hp-t" style={W_VAT}><span>{t.mock.vat}</span><span className="hp-money">{money(VAT)}</span></span>
                          </div>
                        </div>

                        <div className="hp-totalrow">
                          <span className="hp-tl">{t.mock.total}</span>
                          <span className="hp-total hp-t" style={win(0.33, 0.42)}>{money(TOTAL)}</span>
                        </div>

                        <div className="hp-pay">
                          <div className="hp-payin hp-t" style={win(0.44, 0.53)}>
                            <span className="hp-qr">
                              <PseudoQr className="hp-qrsvg" />
                              <i className="hp-scan hp-t" style={win(0.5, 0.6)} />
                            </span>
                            <span className="hp-paytxt">
                              <span className="hp-payq">{t.mock.payQr}</span>
                              <span className="hp-payk">Kaspi Pay · {money(TOTAL)}</span>
                            </span>
                          </div>
                          <div className="hp-stamp hp-t" style={win(0.62, 0.69)}>
                            <span className="hp-stampw">{t.mock.stamp}</span>
                            <span className="hp-stampk">Kaspi · {money(TOTAL)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <ul className="hp-tiles">
                  {t.tiles.map((tile, i) => {
                    const p = tileProduct(tile.key)
                    const [a, b] = TILE_WINDOWS[i]
                    const style = { ...win(a, b), '--bg-t': p?.bg, '--ink-t': p?.ink } as CSSProperties
                    return (
                      <li key={tile.key} className="hp-tile hp-t" style={style}>
                        <a className="hp-tilea" href={p?.landing ?? '/'}>
                          <span className="hp-tico"><TileIcon k={tile.key} /></span>
                          <span className="hp-ttxt">
                            <span className="hp-tn">{tile.name}</span>
                            <span className="hp-tp">{tile.pitch}</span>
                          </span>
                          <span className="hp-ttag">{tile.tag}</span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* --------------------- главы: столбиком без сцены; при сцене только для дикторов */}
              <ol className="hp-chapters">
                {t.chapters.map((c, i) => (
                  <li key={i} className="hp-chap">
                    <span className="hp-chapn" aria-hidden="true">{i + 1}</span>
                    <div className="hp-chapb">
                      <h2 className="hp-chapt">{t.rail[i]}</h2>
                      <p className="hp-chapp">{c}</p>
                      {i === 2 && <p className="hp-chapp hp-chapnote">{t.qrNote}</p>}
                    </div>
                  </li>
                ))}
              </ol>

              {/* --------------------------------- полоска глав */}
              <nav className="hp-rail" aria-label={t.chaptersLabel}>
                <ol>
                  {t.rail.map((label, i) => (
                    <li key={i}>
                      <a className="hp-seg" href={`#hp-ch-${i + 1}`} aria-label={label}>
                        <span className="hp-segbar"><i className="hp-t" style={win(BOUNDS[i], i < 4 ? BOUNDS[i + 1] : SEG_END)} /></span>
                        <span className="hp-seglabel">{label}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="hp-hint" aria-hidden="true">
                <span>{t.scrollHint}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v15M6 13l6 6 6-6" /></svg>
              </div>
            </div>
          </div>

          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} id={`hp-ch-${n}`} className="hp-anchor" style={{ '--f': anchorFraction(n) } as CSSProperties} />
          ))}
        </section>

        {/* ------------------------------------------------ финал */}
        <section className="hp-final" aria-labelledby="hp-final-h">
          <div className="hp-fwrap">
            <h2 id="hp-final-h" className="hp-fh">{t.final.title}</h2>
            <p className="hp-fp">{t.final.sub}</p>
            <div className="hp-fcta">
              <Link href="/login" className="hp-btn hp-btn-lg">{t.final.button}</Link>
              <span className="hp-fnote">{t.final.note}</span>
            </div>

            <div className="hp-tools">
              <h3 className="hp-toolst">{free.title}</h3>
              <p className="hp-toolsp">{free.sub}</p>
              <ul className="hp-chipsrow">
                {FREE_TOOLS.map((slug) => (
                  <li key={slug}><Link className="hp-toolchip" href={toolLinkPath(slug, lang)}>{free.tools[slug]}</Link></li>
                ))}
                <li><Link className="hp-toolchip hp-toolall" href={toolsIndexPath(lang)}>{free.all}</Link></li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="hp-footer">
        <span className="hp-fco">{t.footer.bottom}</span>
        <span className="hp-flinks">
          <Link href="/privacy">{t.footer.privacy}</Link>
          <Link href="/terms">{t.footer.terms}</Link>
          <a href="mailto:support@invoices.kz">support@invoices.kz</a>
          {themeButton('hp-theme-foot')}
        </span>
      </footer>
    </div>
  )
}
