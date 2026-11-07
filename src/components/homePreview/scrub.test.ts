import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAM_A, CAM_K, DIM_A, DIM_K, HINT_CAP, HINT_K, JS_CLASS, TILT_K,
  cameraEase, dimAt, hintP, scrubEnabled, tiltEase, windowT,
} from './timeline'
import {
  applyFrame, cardTarget, clearFrame, dimTarget, driftTarget, hintTarget, swapTarget, winTarget,
  type StyleHost,
} from './scrubFrame'

const css = readFileSync(path.join(__dirname, 'home-preview.css'), 'utf8')

function fakeEl() {
  const props = new Map<string, string>()
  let writes = 0
  const el: StyleHost & { props: Map<string, string>; writes: () => number } = {
    props,
    writes: () => writes,
    style: {
      setProperty: (n, v) => { props.set(n, v); writes++ },
      removeProperty: (n) => { const old = props.get(n) ?? ''; props.delete(n); return old },
    },
  }
  return el
}

describe('драйвер включается только с классом сцены', () => {
  const root = (has: boolean) => ({ classList: { contains: (c: string) => has && c === JS_CLASS } })
  it('нужны и движение, и класс hp-js (клиентская навигация без серверного скрипта)', () => {
    expect(scrubEnabled(true, root(true))).toBe(true)
    expect(scrubEnabled(true, root(false))).toBe(false)
    expect(scrubEnabled(false, root(true))).toBe(false)
  })
})

describe('формулы кадра', () => {
  it('окно зажато в 0..1', () => {
    expect(windowT(0, 0.1, 10)).toBe(0)
    expect(windowT(0.15, 0.1, 10)).toBeCloseTo(0.5, 9)
    expect(windowT(0.9, 0.1, 10)).toBe(1)
  })
  it('камера, наклон и приглушение: края и торможение', () => {
    expect(cameraEase(0.5)).toBe(0)
    expect(cameraEase(1)).toBeCloseTo(1, 12)
    expect(cameraEase(CAM_A + 0.5 / CAM_K)).toBeCloseTo(1 - 0.125, 9)
    expect(tiltEase(0)).toBe(0)
    expect(tiltEase(1)).toBe(1)
    expect(tiltEase(0.5 / TILT_K)).toBeCloseTo(0.75, 9)
    expect(dimAt(DIM_A)).toBe(0)
    expect(dimAt(DIM_A + 1 / DIM_K)).toBeCloseTo(1, 9)
  })
  it('подсказка: выше порога значение не меняется, а там она уже невидима', () => {
    expect(hintP(0.01)).toBe(0.01)
    expect(hintP(0.5)).toBe(HINT_CAP)
    expect(1 - HINT_CAP * HINT_K).toBeLessThan(0)
  })
  it('числа в CSS (статичное состояние) совпадают с константами JS', () => {
    expect(css).toContain(`(var(--p) - ${DIM_A}) * ${DIM_K}`)
    expect(css).toContain(`1 - var(--p) * ${HINT_K}`)
  })
})

describe('запись кадра: только изменившееся', () => {
  function scene() {
    const a = fakeEl(), b = fakeEl(), sw = fakeEl(), card = fakeEl(), qr = fakeEl(), blob = fakeEl(), hint = fakeEl()
    const targets = [
      winTarget(a, 0.1, 10),            // окно 0.1..0.2
      winTarget(b, 0.5, 10),            // окно 0.5..0.6
      swapTarget(sw, 0.3, 33.3, 0.4, 50),
      cardTarget(card), dimTarget(qr), driftTarget(blob), hintTarget(hint),
    ]
    return { a, b, sw, card, qr, blob, hint, targets }
  }

  it('первый кадр пишет всё, повторный с тем же p не пишет ничего', () => {
    const s = scene()
    const first = applyFrame(s.targets, 0)
    expect(first).toBe(1 + 1 + 2 + 2 + 1 + 1 + 1)
    expect(applyFrame(s.targets, 0)).toBe(0)
  })

  it('внутри одного окна пишутся только его элементы (раньше пересчитывалось всё поддерево)', () => {
    const s = scene()
    applyFrame(s.targets, 0.45) // всё, что должно было закончиться, зажато: a в 1, наклон в 1, смена текста доиграна
    const before = {
      a: s.a.writes(), b: s.b.writes(), sw: s.sw.writes(), card: s.card.writes(), qr: s.qr.writes(), hint: s.hint.writes(), blob: s.blob.writes(),
    }
    applyFrame(s.targets, 0.55)
    expect(s.b.props.get('--t')).toBe('0.500')
    expect(s.b.writes()).toBe(before.b + 1)
    expect(s.blob.writes()).toBe(before.blob + 1) // пятна плывут на всём пути
    // остальное зажато в 0 или в 1 и не меняется: нечего писать, нечего пересчитывать
    expect(s.a.writes()).toBe(before.a)
    expect(s.sw.writes()).toBe(before.sw)
    expect(s.card.writes()).toBe(before.card)
    expect(s.qr.writes()).toBe(before.qr)
    expect(s.hint.writes()).toBe(before.hint)
  })

  it('после окна (зажато в 1) и до окна (зажато в 0) записей нет', () => {
    const s = scene()
    applyFrame(s.targets, 0.9)
    const w = s.a.writes()
    expect(applyFrame(s.targets.filter((t) => t.el === s.a || t.el === s.b), 0.95)).toBe(0)
    expect(s.a.writes()).toBe(w)
    expect(s.a.props.get('--t')).toBe('1.000')
  })

  it('обратная прокрутка откатывает значения', () => {
    const s = scene()
    applyFrame(s.targets, 0.9)
    applyFrame(s.targets, 0.02)
    expect(s.a.props.get('--t')).toBe('0.000')
    expect(s.b.props.get('--t')).toBe('0.000')
    expect(s.sw.props.get('--in')).toBe('0.000')
  })

  it('смена текста пишет --in и --out', () => {
    const s = scene()
    applyFrame(s.targets, 0.41)
    expect(s.sw.props.get('--in')).toBe('1.000')
    expect(s.sw.props.get('--out')).toBe('0.500')
  })

  it('clearFrame снимает записанное и сбрасывает кэш', () => {
    const s = scene()
    applyFrame(s.targets, 0.5)
    clearFrame(s.targets)
    expect(s.a.props.size + s.b.props.size + s.sw.props.size + s.card.props.size).toBe(0)
    expect(applyFrame(s.targets, 0.5)).toBeGreaterThan(0)
  })
})

describe('css: не сжимать блоки текста и не давать записи наследоваться', () => {
  it('kick, заголовок и подписи в сцене не сжимаются (flex: none)', () => {
    expect(css).toMatch(/html\.hp-js \.hp-kick, html\.hp-js \.hp-h, html\.hp-js \.hp-subs \{ flex: none; \}/)
  })
  it('переменные кадра зарегистрированы как ненаследуемые', () => {
    for (const n of ['--t', '--e', '--in', '--out', '--pbe', '--tilt', '--dim']) {
      expect(css, n).toContain(`@property ${n} { syntax: '<number>'; inherits: false; initial-value: 0; }`)
    }
  })
  it('сцена больше не задаётся одной --p на всё поддерево', () => {
    expect(css).not.toMatch(/--pbt:|--tiltt:/)
  })
  it('плитки не прячутся через visibility: hidden (остаются в дереве доступности)', () => {
    expect(css).not.toMatch(/\.hp-tilea\s*\{\s*visibility:\s*hidden/)
  })
  it('у «Войти» зона нажатия 44px, у ссылок глав есть доступное имя', () => {
    // 36px - рамка 2 x 1.5px + 2 x 5.5px = 44px (inset считается от поля отсчёта без рамки)
    expect(css).toMatch(/\.hp-login::before \{[^}]*inset: -5\.5px/)
    const tsx = readFileSync(path.join(__dirname, 'HomePreview.tsx'), 'utf8')
    expect(tsx).toMatch(/className="hp-seg"[^>]*aria-label=\{label\}/)
  })
  it('глава 5: карточка и плитки делят зону (ограничение ширины карточки, компактные плитки на 741..840px)', () => {
    // иначе у kk/en на 390x800, 360x780, 375x812, 431x800 карточка налезала на плитки на 3-33px
    expect(css).toMatch(/--card-w: max\(150px, min\(88vw, 340px, calc\(var\(--zone-h\) \* 0\.9\), calc\(\(var\(--zone-h\) - 284px\) \* 2\.1\)\)\)/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) and \(min-height: 741px\) and \(max-height: 840px\) and \(max-width: 899px\) \{[^@]*-webkit-line-clamp: 1/)
  })
  it('высота колонки текста для kk и en не меньше, чем для ru, на каждой ступени', () => {
    const vals = [...css.matchAll(/data-lang="kk"\] \.hp-stage[^{]*\{ --copy-h: (\d+)px; \}/g)].map((m) => +m[1])
    expect(vals.length).toBeGreaterThanOrEqual(4)
    const ru = [...css.matchAll(/html\.hp-js \.hp-stage \{ --copy-h: (\d+)px; \}/g)].map((m) => +m[1])
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(Math.min(...ru))
    // замер 06.11 при 320..768px: кроме самых узких, ru нужно до 267px, kk/en до 284px
    expect(Math.max(...vals)).toBeGreaterThanOrEqual(286)
    expect(Math.max(...ru)).toBeGreaterThanOrEqual(272)
  })
})
