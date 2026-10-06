# Витрина именных 3D-брелков — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Публичная страница `/print`, где гость настраивает именной 3D-брелок (текст, шрифт, два цвета, размер) с живым 3D-предпросмотром, оплачивает через Kaspi Pay, а founder получает в Telegram уведомление с двумя готовыми STL-файлами на печать.

**Architecture:** Личный, не-мультитенантный магазин founder'а поверх уже существующей инфраструктуры Kaspi Pay (`src/lib/kaspiPay/`) и Telegram-уведомлений (`src/lib/telegramNotify.ts`). Геометрия брелка — контур вокруг текста (через `opentype.js` для контуров букв + `clipper-lib` для offset/скругления), собирается в `three.js`-геометрию один раз в общем чистом модуле, используемом и клиентом (живой WebGL-предпросмотр через `@react-three/fiber`) и сервером (детерминированная пересборка + экспорт STL после оплаты — клиентской геометрии не доверяем).

**Tech Stack:** Next.js (App Router, существующие конвенции проекта), `three` + `@react-three/fiber` + `@react-three/drei`, `opentype.js`, `clipper-lib`, Supabase (Postgres + Storage), существующий Kaspi Pay Cashier, Vitest.

## Global Constraints

- Публичные роуты без входа — весь поток `/print` доступен анонимно, как `/view/[token]` и `/shop/[slug]`.
- RLS-без-политик на новой таблице (та же поза, что у `salon_sites`/`planner_sessions`) — доступ только через service-role внутри роутов.
- `print_orders` не привязана к `profiles`/`invoices` — это не мультитенантная фича.
- Платёж — Kaspi Pay, тот же механизм, что уже settlePayment.ts использует для invoice/shop-order (2% комиссия с кошелька founder'а автоматически, менять ничего в wallet.ts не нужно).
- Цвета филамента ровно 7: белый, чёрный, серый, жёлтый, зелёный, красный, бордовый.
- Три размера S/M/L с фиксированными ценами (константы, не БД-поле, не админ-UI).
- Никакой гравировки, никакой загрузки произвольных шрифтов/SVG клиентом, никакого второго товара, никакого отслеживания статуса доставки — явно вне рамок (см. спеку).
- Полный текст решений и обоснований: `docs/superpowers/specs/2026-10-05-print-keychain-shop-design.md`.

---

## File Structure

```
supabase/migrations/print_orders.sql                          (new) -- схема
src/lib/printShop/pricing.ts                                  (new) -- SIZE_PRESETS, цены
src/lib/printShop/fonts.ts                                    (new) -- список шрифтов (манифест)
scripts/fetch-print-shop-fonts.mjs                             (new) -- одноразовый скрипт скачивания TTF
public/fonts/print-shop/*.ttf                                  (new) -- сами файлы шрифтов (бинарные)
src/lib/printShop/geometryUtils.ts                             (new) -- flatten + группировка holes (чистая 2D-геометрия)
src/lib/printShop/offsetContour.ts                             (new) -- clipper offset-обёртка
src/lib/printShop/keychainGeometry.ts                          (new) -- оркестратор: opentype.Font+params -> THREE.BufferGeometry x2
src/lib/printShop/stlExport.ts                                 (new) -- BufferGeometry -> STL (ArrayBuffer)
src/lib/printShop/ownerAccount.ts                               (new) -- founder profile id / telegram chat id
src/lib/printShop/orderPayment.ts                              (new) -- Kaspi Pay: getOrCreateKaspiPaymentForPrintOrder
src/lib/printShop/orderFulfillment.ts                          (new) -- на paid: STL + upload + Telegram
src/lib/kaspiPay/settlePayment.ts                              (modify) -- print_order_id ветка
src/app/api/print/orders/route.ts                              (new) -- POST создать заказ
src/app/api/print/orders/[id]/payment/route.ts                 (new) -- GET mint/poll оплаты
src/app/print/page.tsx                                          (new) -- серверная обёртка (metadata)
src/app/print/PrintShopClient.tsx                               (new) -- конфигуратор + 3D-превью + чекаут
supabase/migrations/README.md                                  (modify) -- запись про новую таблицу/колонку
```

---

### Task 1: Схема базы — `print_orders`, колонка на `kaspi_payment_requests`, Storage-бакет

**Files:**
- Create: `supabase/migrations/print_orders.sql`
- Modify: `supabase/migrations/README.md`

**Interfaces:**
- Produces: таблица `public.print_orders` (`id, status, font, text, ring_at_end, base_color, text_color, size, price, customer_name, customer_phone, note, kaspi_payment_request_id, base_stl_path, text_stl_path, created_at, updated_at`); колонка `public.kaspi_payment_requests.print_order_id uuid`; уникальный частичный индекс `kaspi_payment_requests_print_order_pending_idx`; публичный Storage-бакет `print-orders`.

- [ ] **Step 1: Написать миграцию**

```sql
-- supabase/migrations/print_orders.sql
create table public.print_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  font text not null,
  text text not null,
  ring_at_end boolean not null default false,
  base_color text not null,
  text_color text not null,
  size text not null check (size in ('S','M','L')),
  price int not null,
  customer_name text not null,
  customer_phone text not null,
  note text,
  kaspi_payment_request_id uuid,
  base_stl_path text,
  text_stl_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.print_orders enable row level security;

alter table public.kaspi_payment_requests add column print_order_id uuid;
create unique index kaspi_payment_requests_print_order_pending_idx
  on public.kaspi_payment_requests (print_order_id)
  where (status = 'pending' and print_order_id is not null);

insert into storage.buckets (id, name, public)
values ('print-orders', 'print-orders', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Применить через Supabase MCP**

Вызвать `mcp__plugin_supabase_supabase__apply_migration` с `project_id=terjitbqgrjlqezyydql`, `name='print_orders'`, содержимым файла выше.

- [ ] **Step 3: Проверить вживую**

```sql
select count(*) from public.print_orders; -- 0, без ошибки RLS (идём через service-role)
select indexname from pg_indexes where tablename = 'kaspi_payment_requests' and indexname like '%print_order%';
select public from storage.buckets where id = 'print-orders'; -- true
```

Выполнить через `mcp__plugin_supabase_supabase__execute_sql`.

- [ ] **Step 4: Записать в `supabase/migrations/README.md`**

Добавить короткую секцию по образцу уже существующих записей в этом файле:

```markdown
## Витрина именных 3D-брелков — `print_orders`

Личный магазин founder'а (не мультитенантная фича), та же поза RLS-без-политик,
что у `salon_sites`/`planner_sessions` — доступ только через service-role.
`kaspi_payment_requests.print_order_id` — третья, взаимоисключающая с
`invoice_id`/`shop_order_id`, ветка `checkAndSettleKaspiPayment`
(`src/lib/kaspiPay/settlePayment.ts`). STL-файлы лежат в публичном Storage-
бакете `print-orders` (`<orderId>/base.stl`, `<orderId>/text.stl`). Дизайн:
`docs/superpowers/specs/2026-10-05-print-keychain-shop-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/print_orders.sql supabase/migrations/README.md
git commit -m "feat(print-shop): add print_orders schema, Kaspi payment link, storage bucket"
```

---

### Task 2: Зависимости

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `three`, `@react-three/fiber`, `@react-three/drei`, `opentype.js`, `clipper-lib` в `dependencies`; `@types/three`, `@types/opentype.js`, `@types/clipper-lib` в `devDependencies`.

- [ ] **Step 1: Установить**

```bash
npm install three@^0.186.1 @react-three/fiber@^9.8.1 @react-three/drei@^10.7.9 opentype.js@^2.0.0 clipper-lib@^6.4.2
npm install --save-dev @types/three@^0.186.0 @types/opentype.js@^1.3.10 @types/clipper-lib@^6.4.0
```

- [ ] **Step 2: Проверить, что typecheck и build всё ещё зелёные без изменений кода**

```bash
npx tsc --noEmit
```

Expected: без новых ошибок (новые пакеты пока нигде не импортируются).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(print-shop): add three.js/opentype.js/clipper-lib dependencies"
```

---

### Task 3: Шрифты — манифест + скрипт скачивания + сами файлы

**Files:**
- Create: `scripts/fetch-print-shop-fonts.mjs`
- Create: `src/lib/printShop/fonts.ts`
- Create (binary, via script): `public/fonts/print-shop/*.ttf`

**Interfaces:**
- Produces: `PRINT_SHOP_FONTS: { id: string; label: string; family: string; file: string }[]` (экспорт из `fonts.ts`), `public/fonts/print-shop/<id>.ttf` на диске для каждого.

Google Fonts отдаёт WOFF2 современным браузерам по умолчанию — `opentype.js` не умеет распаковывать WOFF2 (только TTF/OTF/WOFF1), поэтому скрипт запрашивает CSS2 API с устаревшим User-Agent, который не объявляет поддержку WOFF2, и Google сам отдаёт ссылку на TTF.

- [ ] **Step 1: Написать скрипт**

```js
// scripts/fetch-print-shop-fonts.mjs
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// Кириллические шрифты Google Fonts, достаточно толстые/округлые для
// 3D-печати мелким текстом (без тонких засечек/волосяных линий). Список
// курирован вручную 2026-10-05 -- см. docs/superpowers/specs/2026-10-05-
// print-keychain-shop-design.md.
const FONTS = [
  { id: 'pt-sans', label: 'PT Sans', family: 'PT Sans', weight: 700 },
  { id: 'pt-sans-caption', label: 'PT Sans Caption', family: 'PT Sans Caption', weight: 700 },
  { id: 'pt-serif', label: 'PT Serif', family: 'PT Serif', weight: 700 },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat', weight: 800 },
  { id: 'nunito', label: 'Nunito', family: 'Nunito', weight: 800 },
  { id: 'golos-text', label: 'Golos Text', family: 'Golos Text', weight: 700 },
  { id: 'unbounded', label: 'Unbounded', family: 'Unbounded', weight: 700 },
  { id: 'caveat', label: 'Caveat', family: 'Caveat', weight: 700 },
  { id: 'comfortaa', label: 'Comfortaa', family: 'Comfortaa', weight: 700 },
  { id: 'rubik', label: 'Rubik', family: 'Rubik', weight: 800 },
  { id: 'manrope', label: 'Manrope', family: 'Manrope', weight: 800 },
  { id: 'exo-2', label: 'Exo 2', family: 'Exo 2', weight: 800 },
  { id: 'tektur', label: 'Tektur', family: 'Tektur', weight: 700 },
  { id: 'bad-script', label: 'Bad Script', family: 'Bad Script', weight: 400 },
  { id: 'marck-script', label: 'Marck Script', family: 'Marck Script', weight: 400 },
  { id: 'yeseva-one', label: 'Yeseva One', family: 'Yeseva One', weight: 400 },
  { id: 'russo-one', label: 'Russo One', family: 'Russo One', weight: 400 },
  { id: 'oswald', label: 'Oswald', family: 'Oswald', weight: 700 },
  { id: 'jura', label: 'Jura', family: 'Jura', weight: 700 },
  { id: 'play', label: 'Play', family: 'Play', weight: 700 },
]

const OUT_DIR = path.resolve(process.cwd(), 'public/fonts/print-shop')
// Пресловутый приём: UA без поддержки WOFF2 -- Google CSS2 API честно
// отдаёт ссылку на обычный TTF вместо woff2, который opentype.js не читает.
const LEGACY_UA = 'Mozilla/5.0 (Windows NT 6.1; rv:2.0) Gecko/20100101 Firefox/4.0'

async function fetchFontTtfUrl(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent('АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')}`
  const res = await fetch(cssUrl, { headers: { 'User-Agent': LEGACY_UA } })
  if (!res.ok) throw new Error(`CSS2 API ${res.status} for ${family}`)
  const css = await res.text()
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/)
  if (!match) throw new Error(`no ttf url found for ${family} (got: ${css.slice(0, 200)})`)
  return match[1]
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const failures = []
  for (const font of FONTS) {
    try {
      const ttfUrl = await fetchFontTtfUrl(font.family, font.weight)
      const bytes = await (await fetch(ttfUrl)).arrayBuffer()
      await writeFile(path.join(OUT_DIR, `${font.id}.ttf`), Buffer.from(bytes))
      console.log(`OK  ${font.id} <- ${ttfUrl}`)
    } catch (e) {
      console.error(`FAIL ${font.id}: ${e.message}`)
      failures.push(font.id)
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} font(s) failed: ${failures.join(', ')} -- fix or drop from the list before continuing.`)
    process.exit(1)
  }
}

main()
```

- [ ] **Step 2: Запустить и проверить файлы**

```bash
node scripts/fetch-print-shop-fonts.mjs
ls -la public/fonts/print-shop/ | wc -l
```

Expected: скрипт завершается с кодом 0, в папке 20 файлов `.ttf`. Если какой-то шрифт падает (семейство не существует под этим именем в Google Fonts, или вес недоступен) — убрать/поправить эту запись в `FONTS` и перезапустить, не оставляя заказчика без файла.

- [ ] **Step 3: Написать манифест**

```ts
// src/lib/printShop/fonts.ts
export type PrintShopFont = { id: string; label: string; family: string }

// Должно 1:1 соответствовать public/fonts/print-shop/<id>.ttf -- см.
// scripts/fetch-print-shop-fonts.mjs, которым эти файлы были скачаны.
export const PRINT_SHOP_FONTS: PrintShopFont[] = [
  { id: 'pt-sans', label: 'PT Sans', family: 'PT Sans' },
  { id: 'pt-sans-caption', label: 'PT Sans Caption', family: 'PT Sans Caption' },
  { id: 'pt-serif', label: 'PT Serif', family: 'PT Serif' },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat' },
  { id: 'nunito', label: 'Nunito', family: 'Nunito' },
  { id: 'golos-text', label: 'Golos Text', family: 'Golos Text' },
  { id: 'unbounded', label: 'Unbounded', family: 'Unbounded' },
  { id: 'caveat', label: 'Caveat', family: 'Caveat' },
  { id: 'comfortaa', label: 'Comfortaa', family: 'Comfortaa' },
  { id: 'rubik', label: 'Rubik', family: 'Rubik' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope' },
  { id: 'exo-2', label: 'Exo 2', family: 'Exo 2' },
  { id: 'tektur', label: 'Tektur', family: 'Tektur' },
  { id: 'bad-script', label: 'Bad Script', family: 'Bad Script' },
  { id: 'marck-script', label: 'Marck Script', family: 'Marck Script' },
  { id: 'yeseva-one', label: 'Yeseva One', family: 'Yeseva One' },
  { id: 'russo-one', label: 'Russo One', family: 'Russo One' },
  { id: 'oswald', label: 'Oswald', family: 'Oswald' },
  { id: 'jura', label: 'Jura', family: 'Jura' },
  { id: 'play', label: 'Play', family: 'Play' },
]

export function findPrintShopFont(id: string): PrintShopFont | undefined {
  return PRINT_SHOP_FONTS.find(f => f.id === id)
}

export function printShopFontUrl(id: string): string {
  return `/fonts/print-shop/${id}.ttf`
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-print-shop-fonts.mjs src/lib/printShop/fonts.ts public/fonts/print-shop/
git commit -m "feat(print-shop): curate and fetch 20 Cyrillic keychain fonts"
```

---

### Task 4: Чистая 2D-геометрия — flatten контура буквы + группировка holes

**Files:**
- Create: `src/lib/printShop/geometryUtils.ts`
- Test: `src/lib/printShop/geometryUtils.test.ts`

**Interfaces:**
- Consumes: ничего (framework-agnostic, принимает обычные числа/массивы).
- Produces: `type Point = { x: number; y: number }`; `flattenOpentypePath(commands: OpentypeCommand[], curveSegments?: number): Point[][]`; `groupIntoShapesWithHoles(subpaths: Point[][]): { outer: Point[]; holes: Point[][] }[]`.

- [ ] **Step 1: Написать провальный тест на flatten**

```ts
// src/lib/printShop/geometryUtils.test.ts
import { describe, it, expect } from 'vitest'
import { flattenOpentypePath, groupIntoShapesWithHoles } from './geometryUtils'

describe('flattenOpentypePath', () => {
  it('splits M/L/Z commands into closed polyline subpaths', () => {
    const commands = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
      { type: 'M', x: 2, y: 2 },
      { type: 'L', x: 4, y: 2 },
      { type: 'Z' },
    ] as any
    const result = flattenOpentypePath(commands)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
    expect(result[1]).toEqual([{ x: 2, y: 2 }, { x: 4, y: 2 }])
  })

  it('flattens a C (cubic bezier) command into intermediate points', () => {
    const commands = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
      { type: 'Z' },
    ] as any
    const result = flattenOpentypePath(commands, 4)
    // start point + 4 sampled segment endpoints (t=0.25,0.5,0.75,1.0)
    expect(result[0]).toHaveLength(5)
    expect(result[0][0]).toEqual({ x: 0, y: 0 })
    expect(result[0][4].x).toBeCloseTo(10, 5)
    expect(result[0][4].y).toBeCloseTo(0, 5)
  })
})

describe('groupIntoShapesWithHoles', () => {
  it('nests a smaller contained subpath as a hole of the larger one', () => {
    const outer: any[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const hole: any[] = [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }]
    const result = groupIntoShapesWithHoles([outer, hole])
    expect(result).toHaveLength(1)
    expect(result[0].outer).toEqual(outer)
    expect(result[0].holes).toEqual([hole])
  })

  it('keeps two disjoint subpaths (e.g. two separate letters) as two independent outers', () => {
    const a: any[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]
    const b: any[] = [{ x: 20, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 5 }]
    const result = groupIntoShapesWithHoles([a, b])
    expect(result).toHaveLength(2)
    expect(result.map(r => r.holes.length)).toEqual([0, 0])
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

```bash
npx vitest run src/lib/printShop/geometryUtils.test.ts
```

Expected: FAIL — `geometryUtils.ts` ещё не существует.

- [ ] **Step 3: Реализовать**

```ts
// src/lib/printShop/geometryUtils.ts
export type Point = { x: number; y: number }

// opentype.js Path.commands — не импортируем сам пакет здесь, чтобы этот
// модуль оставался чистой 2D-геометрией без внешних зависимостей (легче
// юнит-тестировать синтетическими командами, как в geometryUtils.test.ts).
export type OpentypeCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' }

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt, b = 2 * mt * t, c = t * t
  return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y }
}

/**
 * Splits a flat opentype.js command list into closed polyline subpaths,
 * sampling curves into straight segments (curveSegments points per curve,
 * not counting the shared start point) so every downstream consumer
 * (THREE.Shape, clipper-lib) works with plain polygons only.
 */
export function flattenOpentypePath(commands: OpentypeCommand[], curveSegments = 8): Point[][] {
  const subpaths: Point[][] = []
  let current: Point[] = []
  let cursor: Point = { x: 0, y: 0 }
  let subpathStart: Point = { x: 0, y: 0 }

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (current.length) subpaths.push(current)
      cursor = { x: cmd.x, y: cmd.y }
      subpathStart = cursor
      current = [cursor]
    } else if (cmd.type === 'L') {
      cursor = { x: cmd.x, y: cmd.y }
      current.push(cursor)
    } else if (cmd.type === 'C') {
      const p0 = cursor, p1 = { x: cmd.x1, y: cmd.y1 }, p2 = { x: cmd.x2, y: cmd.y2 }, p3 = { x: cmd.x, y: cmd.y }
      for (let i = 1; i <= curveSegments; i++) current.push(cubicPoint(p0, p1, p2, p3, i / curveSegments))
      cursor = p3
    } else if (cmd.type === 'Q') {
      const p0 = cursor, p1 = { x: cmd.x1, y: cmd.y1 }, p2 = { x: cmd.x, y: cmd.y }
      for (let i = 1; i <= curveSegments; i++) current.push(quadPoint(p0, p1, p2, i / curveSegments))
      cursor = p2
    } else if (cmd.type === 'Z') {
      cursor = subpathStart
      // No explicit closing duplicate point -- every consumer here (THREE.Shape,
      // clipper-lib) treats a polyline as implicitly closed back to its first point.
    }
  }
  if (current.length) subpaths.push(current)
  return subpaths
}

function shoelaceArea(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function boundingBox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

function bboxContains(outer: ReturnType<typeof boundingBox>, inner: ReturnType<typeof boundingBox>): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

/**
 * Groups flattened subpaths into outer-shape+holes clusters using pure
 * geometry (area magnitude + bounding-box containment) -- deliberately NOT
 * relying on an assumed winding-direction convention, since different font
 * files/rasterizers aren't 100% consistent about it. The letter "О" becomes
 * one entry with one hole; two separate letters become two independent
 * entries with no holes; a dot above "й"/"i" is never mistaken for a hole
 * because its bounding box doesn't sit inside the stem's.
 */
export function groupIntoShapesWithHoles(subpaths: Point[][]): { outer: Point[]; holes: Point[][] }[] {
  const withMeta = subpaths
    .map(points => ({ points, area: Math.abs(shoelaceArea(points)), bbox: boundingBox(points) }))
    .sort((a, b) => b.area - a.area)

  const result: { outer: Point[]; holes: Point[][] }[] = []
  const claimed = new Set<number>()

  for (let i = 0; i < withMeta.length; i++) {
    if (claimed.has(i)) continue
    const outer = withMeta[i]
    const holes: Point[][] = []
    for (let j = i + 1; j < withMeta.length; j++) {
      if (claimed.has(j)) continue
      const candidate = withMeta[j]
      if (bboxContains(outer.bbox, candidate.bbox)) {
        holes.push(candidate.points)
        claimed.add(j)
      }
    }
    result.push({ outer: outer.points, holes })
  }
  return result
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

```bash
npx vitest run src/lib/printShop/geometryUtils.test.ts
```

Expected: PASS, все тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/lib/printShop/geometryUtils.ts src/lib/printShop/geometryUtils.test.ts
git commit -m "feat(print-shop): flatten opentype paths and group letter outlines into holes"
```

---

### Task 5: Offset-контур через clipper-lib

**Files:**
- Create: `src/lib/printShop/offsetContour.ts`
- Test: `src/lib/printShop/offsetContour.test.ts`

**Interfaces:**
- Consumes: `Point` из `./geometryUtils`.
- Produces: `offsetOutward(subpaths: Point[][], distanceMm: number, scale?: number): Point[][]`.

- [ ] **Step 1: Написать провальный тест**

```ts
// src/lib/printShop/offsetContour.test.ts
import { describe, it, expect } from 'vitest'
import { offsetOutward } from './offsetContour'

describe('offsetOutward', () => {
  it('grows a single square outward by roughly the given distance', () => {
    const square = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]]
    const result = offsetOutward(square, 2)
    expect(result).toHaveLength(1)
    const xs = result[0].map(p => p.x)
    // Outward by 2mm on each side -> roughly -2..12 on X (rounded corners
    // mean the exact extreme point may be a fraction off, hence the margin).
    expect(Math.min(...xs)).toBeLessThan(-1.5)
    expect(Math.max(...xs)).toBeGreaterThan(11.5)
  })

  it('merges two nearby squares into one contour when the offset bridges the gap', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b = [{ x: 11, y: 0 }, { x: 21, y: 0 }, { x: 21, y: 10 }, { x: 11, y: 10 }]
    const result = offsetOutward([a, b], 3)
    expect(result).toHaveLength(1)
  })

  it('leaves two far-apart squares as two separate contours', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b = [{ x: 100, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 10 }, { x: 100, y: 10 }]
    const result = offsetOutward([a, b], 2)
    expect(result).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

```bash
npx vitest run src/lib/printShop/offsetContour.test.ts
```

Expected: FAIL — файл ещё не существует.

- [ ] **Step 3: Реализовать**

```ts
// src/lib/printShop/offsetContour.ts
import ClipperLib from 'clipper-lib'
import type { Point } from './geometryUtils'

// Clipper работает с целыми координатами (64-битная арифметика внутри) --
// умножаем на SCALE перед offset, делим обратно после. 1000 даёт точность
// 0.001мм, с большим запасом для брелка в несколько сантиметров.
const SCALE = 1000

/**
 * Outward offset (outset) of a set of closed 2D subpaths by distanceMm, with
 * rounded corners -- the SAME operation that, applied to a name's letter
 * outlines, produces the auto-contour "border around the text" base shape
 * (see the design spec). Nearby subpaths naturally merge into one contour
 * where the offset regions overlap; this is standard ClipperOffset
 * behaviour, not something this wrapper does itself.
 */
export function offsetOutward(subpaths: Point[][], distanceMm: number): Point[][] {
  const paths = subpaths.map(sp => sp.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })))

  const co = new ClipperLib.ClipperOffset()
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const solution = new ClipperLib.Paths()
  co.Execute(solution, distanceMm * SCALE)

  return solution.map((path: { X: number; Y: number }[]) => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })))
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

```bash
npx vitest run src/lib/printShop/offsetContour.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/printShop/offsetContour.ts src/lib/printShop/offsetContour.test.ts
git commit -m "feat(print-shop): outward polygon offset via clipper-lib for the auto-contour base"
```

---

### Task 6: Цены и размерные пресеты

**Files:**
- Create: `src/lib/printShop/pricing.ts`
- Test: `src/lib/printShop/pricing.test.ts`

**Interfaces:**
- Produces: `type KeychainSize = 'S' | 'M' | 'L'`; `SIZE_PRESETS: Record<KeychainSize, {...}>`; `priceForSize(size: KeychainSize): number`.

- [ ] **Step 1: Написать провальный тест**

```ts
// src/lib/printShop/pricing.test.ts
import { describe, it, expect } from 'vitest'
import { SIZE_PRESETS, priceForSize } from './pricing'

describe('pricing', () => {
  it('has all three sizes with positive dimensions', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const p = SIZE_PRESETS[size]
      expect(p.fontSizeMm).toBeGreaterThan(0)
      expect(p.baseThicknessMm).toBeGreaterThan(0)
      expect(p.textThicknessMm).toBeGreaterThan(0)
      expect(p.borderMm).toBeGreaterThan(0)
      expect(p.ringHoleDiameterMm).toBeGreaterThan(0)
      expect(p.ringWallMm).toBeGreaterThan(0)
    }
  })

  it('prices strictly increase from S to M to L', () => {
    expect(priceForSize('S')).toBeLessThan(priceForSize('M'))
    expect(priceForSize('M')).toBeLessThan(priceForSize('L'))
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

```bash
npx vitest run src/lib/printShop/pricing.test.ts
```

- [ ] **Step 3: Реализовать**

```ts
// src/lib/printShop/pricing.ts
export type KeychainSize = 'S' | 'M' | 'L'

export type SizePreset = {
  fontSizeMm: number
  baseThicknessMm: number
  textThicknessMm: number
  borderMm: number
  ringHoleDiameterMm: number
  ringWallMm: number
  ringDistanceMm: number
  price: number
}

// Черновые цены по просьбе founder'а ("цены пока придумай") -- простая
// константа, не поле в БД и не админ-UI в v1 (см. design-спеку). Остальные
// числа отталкиваются от значений по умолчанию у референса MakerWorld
// (base 2.0 / text 1.4 / border 3.4 / hole ⌀5 / wall 3.0), масштабированы
// по трём размерам.
export const SIZE_PRESETS: Record<KeychainSize, SizePreset> = {
  S: { fontSizeMm: 10, baseThicknessMm: 2.0, textThicknessMm: 1.2, borderMm: 2.5, ringHoleDiameterMm: 4, ringWallMm: 2.5, ringDistanceMm: 1.2, price: 2500 },
  M: { fontSizeMm: 14, baseThicknessMm: 2.0, textThicknessMm: 1.4, borderMm: 3.0, ringHoleDiameterMm: 5, ringWallMm: 3.0, ringDistanceMm: 1.2, price: 3500 },
  L: { fontSizeMm: 18, baseThicknessMm: 2.4, textThicknessMm: 1.6, borderMm: 3.5, ringHoleDiameterMm: 5, ringWallMm: 3.0, ringDistanceMm: 1.2, price: 4500 },
}

export function priceForSize(size: KeychainSize): number {
  return SIZE_PRESETS[size].price
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

```bash
npx vitest run src/lib/printShop/pricing.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/printShop/pricing.ts src/lib/printShop/pricing.test.ts
git commit -m "feat(print-shop): size presets and draft pricing"
```

---

### Task 7: Оркестратор геометрии — текст+параметры → три.js BufferGeometry

**Files:**
- Create: `src/lib/printShop/keychainGeometry.ts`
- Test: `src/lib/printShop/keychainGeometry.test.ts`

**Interfaces:**
- Consumes: `flattenOpentypePath`, `groupIntoShapesWithHoles` из `./geometryUtils`; `offsetOutward` из `./offsetContour`; `SIZE_PRESETS`, `KeychainSize` из `./pricing`; `opentype.Font` (из пакета `opentype.js`, тип `Font`).
- Produces: `buildKeychainGeometries(params: { font: Font; text: string; size: KeychainSize; ringAtEnd: boolean }): { baseGeometry: THREE.BufferGeometry; textGeometry: THREE.BufferGeometry }`.

- [ ] **Step 1: Написать провальный тест**

Использует реальный шрифт из `public/fonts/print-shop/` (Task 3 уже положил файлы на диск) — геометрию с реальными буквами тестируем не на синтетике, а на настоящем шрифте, иначе не поймаем регрессию в стыковке opentype → three.js.

```ts
// src/lib/printShop/keychainGeometry.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import opentype from 'opentype.js'
import { buildKeychainGeometries } from './keychainGeometry'

let font: opentype.Font

beforeAll(() => {
  const buf = readFileSync(path.resolve(__dirname, '../../../public/fonts/print-shop/pt-sans.ttf'))
  font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe('buildKeychainGeometries', () => {
  it('produces non-empty base and text geometries for a simple Cyrillic name', () => {
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Айгерим', size: 'M', ringAtEnd: false })
    expect(baseGeometry.attributes.position.count).toBeGreaterThan(0)
    expect(textGeometry.attributes.position.count).toBeGreaterThan(0)
  })

  it('base geometry bounding box is larger than text geometry bounding box (border adds margin)', () => {
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Миша', size: 'M', ringAtEnd: false })
    baseGeometry.computeBoundingBox()
    textGeometry.computeBoundingBox()
    const baseSize = baseGeometry.boundingBox!.max.x - baseGeometry.boundingBox!.min.x
    const textSize = textGeometry.boundingBox!.max.x - textGeometry.boundingBox!.min.x
    expect(baseSize).toBeGreaterThan(textSize)
  })

  it('text geometry sits above the base (its min Z equals base thickness)', () => {
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'A', size: 'S', ringAtEnd: false })
    baseGeometry.computeBoundingBox()
    textGeometry.computeBoundingBox()
    expect(textGeometry.boundingBox!.min.z).toBeCloseTo(baseGeometry.boundingBox!.max.z, 1)
  })

  it('placing the ring at the end moves it to the opposite side from the default start placement', () => {
    const start = buildKeychainGeometries({ font, text: 'Ким', size: 'S', ringAtEnd: false })
    const end = buildKeychainGeometries({ font, text: 'Ким', size: 'S', ringAtEnd: true })
    start.baseGeometry.computeBoundingBox()
    end.baseGeometry.computeBoundingBox()
    // Same overall name, same size preset -> same total width either way,
    // but the ring is a fixed-size circle at one end, so total extent must
    // differ in WHICH side has the extra bump if start vs end actually
    // differ. Simplest robust check: the two bounding boxes are not
    // byte-identical (the ring really moved somewhere).
    expect(start.baseGeometry.boundingBox).not.toEqual(end.baseGeometry.boundingBox)
  })

  it('throws a clear error for empty text instead of producing a degenerate mesh', () => {
    expect(() => buildKeychainGeometries({ font, text: '', size: 'S', ringAtEnd: false })).toThrow(/text/i)
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

```bash
npx vitest run src/lib/printShop/keychainGeometry.test.ts
```

Expected: FAIL — `keychainGeometry.ts` ещё не существует.

- [ ] **Step 3: Реализовать**

```ts
// src/lib/printShop/keychainGeometry.ts
import * as THREE from 'three'
import type { Font } from 'opentype.js'
import { flattenOpentypePath, groupIntoShapesWithHoles, type Point } from './geometryUtils'
import { offsetOutward } from './offsetContour'
import { SIZE_PRESETS, type KeychainSize } from './pricing'

function shapesFromGroups(groups: { outer: Point[]; holes: Point[][] }[]): THREE.Shape[] {
  return groups.map(g => {
    const shape = new THREE.Shape(g.outer.map(p => new THREE.Vector2(p.x, p.y)))
    for (const hole of g.holes) shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(p.x, p.y))))
    return shape
  })
}

function circlePoints(cx: number, cy: number, radius: number, segments = 32): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
  }
  return pts
}

export function buildKeychainGeometries(params: {
  font: Font
  text: string
  size: KeychainSize
  ringAtEnd: boolean
}): { baseGeometry: THREE.BufferGeometry; textGeometry: THREE.BufferGeometry } {
  const text = params.text.trim()
  if (!text) throw new Error('buildKeychainGeometries: text must not be empty')

  const preset = SIZE_PRESETS[params.size]

  // opentype.js keeps a Y-up coordinate system (baseline at y=0, ascenders
  // positive) in getPath()'s output -- the same convention three.js world
  // space uses, so no axis flip is needed here.
  const path = params.font.getPath(text, 0, 0, preset.fontSizeMm)
  const letterSubpaths = flattenOpentypePath(path.commands as any)
  const letterGroups = groupIntoShapesWithHoles(letterSubpaths)

  // Ring: a hole-with-wall annulus plus a short rectangular bridge
  // connecting it to the nearest end of the text, added to the SAME subpath
  // set that goes into the offset step so the bridge becomes an organic
  // part of the final contour rather than a shape glued on top (see spec).
  const bbox = (() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const sp of letterSubpaths) for (const p of sp) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    return { minX, maxX, minY, maxY }
  })()
  const midY = (bbox.minY + bbox.maxY) / 2
  const ringRadius = preset.ringHoleDiameterMm / 2 + preset.ringWallMm
  const ringCenterX = params.ringAtEnd
    ? bbox.maxX + preset.ringDistanceMm + ringRadius
    : bbox.minX - preset.ringDistanceMm - ringRadius
  const ringOuter = circlePoints(ringCenterX, midY, ringRadius)
  const bridgeHalfHeight = preset.ringWallMm
  const bridgeStartX = params.ringAtEnd ? bbox.maxX : ringCenterX + ringRadius
  const bridgeEndX = params.ringAtEnd ? ringCenterX - ringRadius : bbox.minX
  const bridge: Point[] = [
    { x: bridgeStartX, y: midY - bridgeHalfHeight },
    { x: bridgeEndX, y: midY - bridgeHalfHeight },
    { x: bridgeEndX, y: midY + bridgeHalfHeight },
    { x: bridgeStartX, y: midY + bridgeHalfHeight },
  ]

  // BASE: outward-offset contour of letters + ring + bridge, extruded by
  // baseThicknessMm, sitting at z in [0, baseThicknessMm].
  const offsetSubpaths = offsetOutward([...letterSubpaths, ringOuter, bridge], preset.borderMm)
  const baseGroups = groupIntoShapesWithHoles(offsetSubpaths)
  // The ring's own hole (the part a real key ring threads through) is cut
  // out of the base explicitly -- the offset step grows material OUTWARD
  // around the ring's outer circle, it does not know a hole belongs inside it.
  const ringHoleRadius = preset.ringHoleDiameterMm / 2
  for (const group of baseGroups) {
    const dx = group.outer.reduce((s, p) => s + p.x, 0) / group.outer.length - ringCenterX
    const dy = group.outer.reduce((s, p) => s + p.y, 0) / group.outer.length - midY
    if (Math.hypot(dx, dy) < ringRadius * 2) {
      group.holes.push(circlePoints(ringCenterX, midY, ringHoleRadius))
    }
  }
  const baseShapes = shapesFromGroups(baseGroups)
  const baseGeometry = new THREE.ExtrudeGeometry(baseShapes, { depth: preset.baseThicknessMm, bevelEnabled: false })

  // TEXT: raw (un-offset) letter outlines, extruded by textThicknessMm,
  // raised on top of the base (z in [baseThicknessMm, baseThicknessMm+textThicknessMm]).
  const textShapes = shapesFromGroups(letterGroups)
  const textGeometry = new THREE.ExtrudeGeometry(textShapes, { depth: preset.textThicknessMm, bevelEnabled: false })
  textGeometry.translate(0, 0, preset.baseThicknessMm)

  return { baseGeometry, textGeometry }
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

```bash
npx vitest run src/lib/printShop/keychainGeometry.test.ts
```

Expected: PASS. Если тест на bounding box/ring не проходит из-за числовых нюансов реального шрифта — поправить допуски (`toBeCloseTo` precision), не саму логику, если базовая форма геометрически верна.

- [ ] **Step 5: Ручная визуальная проверка (не юнит-тест — самая рискованная часть всего плана)**

```bash
node -e "
const opentype = require('opentype.js')
const fs = require('fs')
const { buildKeychainGeometries } = require('./src/lib/printShop/keychainGeometry.ts')
" 2>&1 || echo "см. ниже — делаем это через ts-node/tsx, не через node напрямую"
npx tsx -e "
import { readFileSync, writeFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { buildKeychainGeometries } from './src/lib/printShop/keychainGeometry'
import { exportGeometryToSTL } from './src/lib/printShop/stlExport'
const buf = readFileSync('public/fonts/print-shop/unbounded.ttf')
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Алихан', size: 'M', ringAtEnd: true })
writeFileSync('/tmp/base.stl', Buffer.from(exportGeometryToSTL(baseGeometry)))
writeFileSync('/tmp/text.stl', Buffer.from(exportGeometryToSTL(textGeometry)))
console.log('wrote /tmp/base.stl and /tmp/text.stl')
"
```

(Эта команда предполагает, что Task 8 — `stlExport.ts` — уже готов; если выполняется раньше, временно заменить экспорт STL на `console.log(baseGeometry.attributes.position.count)` просто чтобы увидеть, что геометрия не нулевая и не NaN.) Открыть оба `.stl` в любом просмотрщике (Windows 3D Viewer, или онлайн-просмотрщик STL) и глазами подтвердить: буквы читаемы, не перевёрнуты вверх ногами, кольцо на нужном конце, основа видимо шире текста по контуру. Если текст вверх ногами — значит Y-ось opentype.js на самом деле Y-down для этой версии пакета, нужно инвертировать `y` при флэттенинге в Task 4 (добавить `y: -cmd.y` и т.д.) и перезапустить все тесты.

- [ ] **Step 6: Commit**

```bash
git add src/lib/printShop/keychainGeometry.ts src/lib/printShop/keychainGeometry.test.ts
git commit -m "feat(print-shop): orchestrate opentype+clipper+three.js into keychain geometries"
```

---

### Task 8: Экспорт STL

**Files:**
- Create: `src/lib/printShop/stlExport.ts`
- Test: `src/lib/printShop/stlExport.test.ts`

**Interfaces:**
- Consumes: `THREE.BufferGeometry`.
- Produces: `exportGeometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer`.

- [ ] **Step 1: Написать провальный тест**

```ts
// src/lib/printShop/stlExport.test.ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { exportGeometryToSTL } from './stlExport'

describe('exportGeometryToSTL', () => {
  it('produces a non-empty binary STL for a simple box', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const buffer = exportGeometryToSTL(geometry)
    expect(buffer.byteLength).toBeGreaterThan(84) // 80-byte header + 4-byte triangle count, at minimum
    const view = new DataView(buffer)
    const triangleCount = view.getUint32(80, true)
    expect(triangleCount).toBeGreaterThan(0)
    // Binary STL size = 84 header bytes + 50 bytes per triangle
    expect(buffer.byteLength).toBe(84 + triangleCount * 50)
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

```bash
npx vitest run src/lib/printShop/stlExport.test.ts
```

- [ ] **Step 3: Реализовать**

```ts
// src/lib/printShop/stlExport.ts
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

const exporter = new STLExporter()

/**
 * Serializes a BufferGeometry to a binary STL ArrayBuffer -- works in plain
 * Node (no canvas/WebGL needed, STLExporter only walks the geometry's own
 * vertex/index data), used both for the manual visual check in Task 7 and
 * for real server-side generation after a paid order (Task 10).
 */
export function exportGeometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const mesh = new THREE.Mesh(geometry)
  const result = exporter.parse(mesh, { binary: true }) as DataView
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

```bash
npx vitest run src/lib/printShop/stlExport.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/printShop/stlExport.ts src/lib/printShop/stlExport.test.ts
git commit -m "feat(print-shop): binary STL export via three.js STLExporter"
```

---

### Task 9: Владелец магазина — founder's profile id + Telegram chat id

**Files:**
- Create: `src/lib/printShop/ownerAccount.ts`
- Test: `src/lib/printShop/ownerAccount.test.ts`

**Interfaces:**
- Produces: `getPrintShopOwnerUserId(): string` (бросает понятную ошибку, если env не задан); `loadPrintShopOwnerTelegramChatId(): Promise<string | null>`.

- [ ] **Step 1: Написать провальный тест**

```ts
// src/lib/printShop/ownerAccount.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPrintShopOwnerUserId } from './ownerAccount'

describe('getPrintShopOwnerUserId', () => {
  const ORIGINAL = process.env.PRINT_SHOP_OWNER_USER_ID

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PRINT_SHOP_OWNER_USER_ID
    else process.env.PRINT_SHOP_OWNER_USER_ID = ORIGINAL
  })

  it('returns the configured id', () => {
    process.env.PRINT_SHOP_OWNER_USER_ID = '11111111-1111-1111-1111-111111111111'
    expect(getPrintShopOwnerUserId()).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('throws a clear error when not configured', () => {
    delete process.env.PRINT_SHOP_OWNER_USER_ID
    expect(() => getPrintShopOwnerUserId()).toThrow(/PRINT_SHOP_OWNER_USER_ID/)
  })
})
```

- [ ] **Step 2: Запустить, убедиться что падает**

```bash
npx vitest run src/lib/printShop/ownerAccount.test.ts
```

- [ ] **Step 3: Реализовать**

```ts
// src/lib/printShop/ownerAccount.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Личный магазин founder'а -- один владелец на весь /print, его собственный
// Kaspi Pay Cashier и его собственный Telegram для уведомлений о заказах.
// Отдельный env var, а не чтение is_admin=true (сейчас 5 админских
// аккаунтов -- см. product_split_subdomains_invoices_kz память -- выбрать
// "того самого" автоматически нельзя).
export function getPrintShopOwnerUserId(): string {
  const id = process.env.PRINT_SHOP_OWNER_USER_ID
  if (!id) throw new Error('PRINT_SHOP_OWNER_USER_ID is not configured')
  return id
}

export async function loadPrintShopOwnerTelegramChatId(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', getPrintShopOwnerUserId())
    .maybeSingle()
  return data?.telegram_chat_id ?? null
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

```bash
npx vitest run src/lib/printShop/ownerAccount.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/printShop/ownerAccount.ts src/lib/printShop/ownerAccount.test.ts
git commit -m "feat(print-shop): resolve the shop owner's profile id and Telegram chat"
```

---

### Task 10: Kaspi Pay — получить/создать платёж для заказа

**Files:**
- Create: `src/lib/printShop/orderPayment.ts`

**Interfaces:**
- Consumes: `loadConnectionByUserId`, `getWalletBalance`, `computeCommission` (`@/lib/kaspiPay/*`), `createPayment` (`@/lib/kaspiPay/client`), `getPrintShopOwnerUserId` (`./ownerAccount`).
- Produces: `getOrCreateKaspiPaymentForPrintOrder(order: { id: string; price: number; status: string }): Promise<{ qr_token: string | null; payment_link: string | null; status: string; id: string; user_id: string; invoice_id: null; order_id: string; shop_order_id: null; print_order_id: string; amount: number; kaspi_operation_id: string; callback_url: null; expires_at: string | null } | null>`.

Прямая копия структуры `getOrCreateKaspiPaymentForInvoice` (`src/lib/kaspiPay/invoicePayment.ts`), с двумя отличиями: `user_id` всегда `getPrintShopOwnerUserId()` (не параметр), и привязка по `print_order_id` вместо `invoice_id`.

- [ ] **Step 1: Реализовать**

Тестов не пишем — модуль делает реальные сетевые вызовы к Kaspi (`createPayment`) и к Supabase; это тот же паттерн, что уже принят в `shopOrderPayment.ts`/`invoicePayment.ts` (ни один из них не имеет `.test.ts`, см. комментарий вверху `generateLanding.ts` про "live network call to a paid API" — тот же случай). Проверяется вживую в Task 12.

```ts
// src/lib/printShop/orderPayment.ts
import { createClient } from '@supabase/supabase-js'
import { loadConnectionByUserId } from '@/lib/kaspiPay/connection'
import { createPayment } from '@/lib/kaspiPay/client'
import { getWalletBalance, computeCommission } from '@/lib/kaspiPay/wallet'
import type { SettleableRequest } from '@/lib/kaspiPay/settlePayment'
import { getPrintShopOwnerUserId } from './ownerAccount'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface KaspiPrintOrderPayment extends SettleableRequest {
  qr_token: string | null
  payment_link: string | null
  status: string
}

const SETTLEABLE_COLUMNS = 'id, user_id, invoice_id, order_id, shop_order_id, print_order_id, amount, kaspi_operation_id, callback_url, expires_at, qr_token, payment_link, status'

const MINT_WINDOW_MS = 60_000
const MINT_LIMIT = 3
const CLOSED_STATUSES = new Set(['paid', 'failed'])

/**
 * Mirrors getOrCreateKaspiPaymentForInvoice (invoicePayment.ts) for a
 * print_orders row instead -- same mint-rate-limit and wallet-balance gate,
 * but user_id is always the shop owner (there's only one), never a
 * parameter.
 */
export async function getOrCreateKaspiPaymentForPrintOrder(order: {
  id: string
  price: number
  status: string
}): Promise<KaspiPrintOrderPayment | null> {
  const ownerId = getPrintShopOwnerUserId()

  const { data: existing, error } = await supabase
    .from('kaspi_payment_requests')
    .select(SETTLEABLE_COLUMNS)
    .eq('print_order_id', order.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`kaspi_payment_requests lookup for print order ${order.id} failed: ${error.message}`)

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing as KaspiPrintOrderPayment
  }

  if (CLOSED_STATUSES.has(order.status)) return null

  const balance = await getWalletBalance(ownerId)
  if (balance < computeCommission(order.price)) return null

  const { count: recentMints } = await supabase
    .from('kaspi_payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('print_order_id', order.id)
    .gte('created_at', new Date(Date.now() - MINT_WINDOW_MS).toISOString())
  if ((recentMints ?? 0) >= MINT_LIMIT) return null

  const connection = await loadConnectionByUserId(ownerId)
  if (!connection) return null

  const payment = await createPayment(connection, { amount: order.price, orderId: order.id })

  const { data: inserted, error: insertError } = await supabase
    .from('kaspi_payment_requests')
    .insert({
      user_id: ownerId,
      print_order_id: order.id,
      order_id: order.id,
      amount: order.price,
      kaspi_operation_id: payment.operationId,
      qr_token: payment.qrToken,
      payment_link: payment.paymentLink,
      status: 'pending',
      expires_at: payment.expiresAt,
    })
    .select(SETTLEABLE_COLUMNS)
    .single()
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: winner } = await supabase
        .from('kaspi_payment_requests')
        .select(SETTLEABLE_COLUMNS)
        .eq('print_order_id', order.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) return winner as KaspiPrintOrderPayment
    }
    console.error('Print shop: Kaspi payment created but failed to persist — order', order.id, 'operation', payment.operationId, ':', insertError.message)
    return null
  }

  return inserted as KaspiPrintOrderPayment
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/printShop/orderPayment.ts
git commit -m "feat(print-shop): mint/reuse a Kaspi Pay payment for a print order"
```

---

### Task 11: `settlePayment.ts` — ветка `print_order_id`

**Files:**
- Modify: `src/lib/kaspiPay/settlePayment.ts`

**Interfaces:**
- Consumes: `handlePrintOrderPaid` из `@/lib/printShop/orderFulfillment` (создаётся в Task 12 — этот файл импортирует его ДО того, как он существует; порядок задач здесь намеренно обратный относительно обычного TDD, потому что `settlePayment.ts` — существующий production-файл без теста на эту ветку, см. ниже).
- Produces: `SettleableRequest.print_order_id: string | null` (расширение интерфейса).

- [ ] **Step 1: Добавить поле в интерфейс**

```ts
// src/lib/kaspiPay/settlePayment.ts — в export interface SettleableRequest, после shop_order_id:
  shop_order_id: string | null
  print_order_id: string | null
```

- [ ] **Step 2: Добавить ветку после существующего `shop_order_id`-блока**

Вставить сразу после блока (строки ~127-129 в текущем файле):
```ts
  if (reqRow.shop_order_id) {
    await supabase.from('kaspi_shop_orders').update({ status: 'paid' }).eq('id', reqRow.shop_order_id)
  }
```
добавить:
```ts
  // Третья, взаимоисключающая с invoice_id/shop_order_id, ветка -- см.
  // print_order_id в getOrCreateKaspiPaymentForPrintOrder (orderPayment.ts).
  // Best-effort, как и notifyInvoicePaidInConversation выше: реальная
  // Kaspi-подтверждённая оплата уже состоялась независимо от того,
  // получится ли сгенерировать STL и отправить Telegram прямо сейчас.
  if (reqRow.print_order_id) {
    await supabase.from('print_orders').update({ status: 'paid' }).eq('id', reqRow.print_order_id)
    try {
      const { handlePrintOrderPaid } = await import('@/lib/printShop/orderFulfillment')
      await handlePrintOrderPaid(reqRow.print_order_id)
    } catch (e: any) {
      console.error('Kaspi settle: print order fulfillment failed for', reqRow.print_order_id, ':', e.message)
    }
  }
```

(Динамический `import()` — не статический, вверху файла — чтобы не создавать цикл импорта: `orderFulfillment.ts` сам ничего не импортирует из `settlePayment.ts` напрямую, но лежит в том же общем графе платёжного кода; динамический импорт здесь — простая, безопасная страховка, которая ничего не стоит на горячем пути, потому что срабатывает только в момент реальной оплаты, не на каждый опрос статуса.)

- [ ] **Step 3: Проверить компиляцию**

```bash
npx tsc --noEmit
```

Expected: падает здесь с `Cannot find module '@/lib/printShop/orderFulfillment'` — это ОЖИДАЕМО и временно, модуль появится в Task 12. Если выполняете план строго по порядку (не параллельно субагентами), эту проверку можно пропустить и вернуться к ней в конце Task 12.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kaspiPay/settlePayment.ts
git commit -m "feat(print-shop): settle print_order_id payments alongside invoice/shop-order"
```

---

### Task 12: Фулфилмент — STL + загрузка в Storage + Telegram

**Files:**
- Create: `src/lib/printShop/orderFulfillment.ts`

**Interfaces:**
- Consumes: `buildKeychainGeometries` (`./keychainGeometry`), `exportGeometryToSTL` (`./stlExport`), `findPrintShopFont`, `printShopFontUrl` (`./fonts`), `loadPrintShopOwnerTelegramChatId` (`./ownerAccount`), `sendTelegramNotification` (`@/lib/telegramNotify`), `SIZE_PRESETS` (`./pricing`).
- Produces: `handlePrintOrderPaid(printOrderId: string): Promise<void>`.

- [ ] **Step 1: Реализовать**

Без юнит-теста (сетевой + storage side-effect, тот же класс, что и Task 10) — геометрия, которую этот модуль собирает, уже протестирована в Task 7; здесь только оркестрация.

```ts
// src/lib/printShop/orderFulfillment.ts
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import opentype from 'opentype.js'
import { buildKeychainGeometries } from './keychainGeometry'
import { exportGeometryToSTL } from './stlExport'
import { findPrintShopFont } from './fonts'
import { loadPrintShopOwnerTelegramChatId } from './ownerAccount'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import type { KeychainSize } from './pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type PrintOrderRow = {
  id: string
  font: string
  text: string
  ring_at_end: boolean
  base_color: string
  text_color: string
  size: KeychainSize
  price: number
  customer_name: string
  customer_phone: string
  note: string | null
}

async function loadFontFile(fontId: string): Promise<opentype.Font> {
  const meta = findPrintShopFont(fontId)
  if (!meta) throw new Error(`unknown print shop font: ${fontId}`)
  // Server side reads the SAME static file the client fetches over HTTP
  // (public/fonts/print-shop/<id>.ttf) directly off disk -- no network
  // round-trip needed, and it's the one guaranteed-available copy during
  // the webhook's short time budget.
  const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', 'print-shop', `${fontId}.ttf`))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

/**
 * Runs once a print order's Kaspi payment settles (see settlePayment.ts's
 * print_order_id branch): rebuilds the keychain geometry from the order's
 * OWN stored parameters (never trusts whatever the client's live preview
 * sent), exports two STLs (base + text, for two-color slicing), uploads
 * them to the public print-orders Storage bucket, and pings the shop
 * owner's Telegram with the order details and both file links.
 */
export async function handlePrintOrderPaid(printOrderId: string): Promise<void> {
  const { data: order, error } = await supabase
    .from('print_orders')
    .select('id, font, text, ring_at_end, base_color, text_color, size, price, customer_name, customer_phone, note')
    .eq('id', printOrderId)
    .single()
  if (error || !order) throw new Error(`print order ${printOrderId} not found: ${error?.message}`)
  const row = order as PrintOrderRow

  const font = await loadFontFile(row.font)
  const { baseGeometry, textGeometry } = buildKeychainGeometries({
    font, text: row.text, size: row.size, ringAtEnd: row.ring_at_end,
  })
  const baseStl = exportGeometryToSTL(baseGeometry)
  const textStl = exportGeometryToSTL(textGeometry)

  const basePath = `${printOrderId}/base.stl`
  const textPath = `${printOrderId}/text.stl`
  const [baseUpload, textUpload] = await Promise.all([
    supabase.storage.from('print-orders').upload(basePath, baseStl, { contentType: 'model/stl' }),
    supabase.storage.from('print-orders').upload(textPath, textStl, { contentType: 'model/stl' }),
  ])
  if (baseUpload.error) throw new Error(`STL upload (base) failed for ${printOrderId}: ${baseUpload.error.message}`)
  if (textUpload.error) throw new Error(`STL upload (text) failed for ${printOrderId}: ${textUpload.error.message}`)

  const baseUrl = supabase.storage.from('print-orders').getPublicUrl(basePath).data.publicUrl
  const textUrl = supabase.storage.from('print-orders').getPublicUrl(textPath).data.publicUrl

  await supabase.from('print_orders').update({ base_stl_path: basePath, text_stl_path: textPath }).eq('id', printOrderId)

  const chatId = await loadPrintShopOwnerTelegramChatId()
  if (chatId) {
    const fontMeta = findPrintShopFont(row.font)
    const lines = [
      `🔑 Новый заказ брелка — ${row.price.toLocaleString('ru-KZ')} ₸`,
      `Текст: «${row.text}»`,
      `Шрифт: ${fontMeta?.label ?? row.font}`,
      `Размер: ${row.size}, кольцо: ${row.ring_at_end ? 'в конце' : 'в начале'}`,
      `Цвета: основа ${row.base_color}, текст ${row.text_color}`,
      `Клиент: ${row.customer_name}, ${row.customer_phone}`,
      row.note ? `Комментарий: ${row.note}` : null,
      '',
      `STL основа: ${baseUrl}`,
      `STL текст: ${textUrl}`,
    ].filter(Boolean)
    await sendTelegramNotification(chatId, lines.join('\n'))
  } else {
    console.error('Print shop: owner has no telegram_chat_id configured, order', printOrderId, 'notification skipped')
  }
}
```

- [ ] **Step 2: Проверить компиляцию (теперь Task 11's динамический импорт разрешается)**

```bash
npx tsc --noEmit
```

Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/lib/printShop/orderFulfillment.ts
git commit -m "feat(print-shop): generate STLs and notify the owner on Telegram when an order is paid"
```

---

### Task 13: API-роуты — создание заказа и опрос оплаты

**Files:**
- Create: `src/app/api/print/orders/route.ts`
- Create: `src/app/api/print/orders/[id]/payment/route.ts`

**Interfaces:**
- Consumes: `SIZE_PRESETS`, `priceForSize` (`@/lib/printShop/pricing`), `findPrintShopFont` (`@/lib/printShop/fonts`), `normalizeKzPhone` (`@/lib/kaspiPay/phone`), `getOrCreateKaspiPaymentForPrintOrder` (`@/lib/printShop/orderPayment`), `checkAndSettleKaspiPayment` (`@/lib/kaspiPay/settlePayment`).
- Produces: `POST /api/print/orders` → `{ orderId: string } | { error: string }`; `GET /api/print/orders/[id]/payment` → `{ payment: { qr_token, payment_link, status } | null }`.

- [ ] **Step 1: POST — создание заказа**

```ts
// src/app/api/print/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { priceForSize, type KeychainSize } from '@/lib/printShop/pricing'
import { findPrintShopFont } from '@/lib/printShop/fonts'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_TEXT_LENGTH = 20
const VALID_SIZES = new Set(['S', 'M', 'L'])
const VALID_COLORS = new Set(['белый', 'чёрный', 'серый', 'жёлтый', 'зелёный', 'красный', 'бордовый'])

// Public, unauthenticated -- the price is ALWAYS recomputed server-side from
// `size` via priceForSize, never taken from the client body, so a tampered
// request can't buy a keychain for less than its real price.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const fontId = typeof body?.font === 'string' ? body.font : ''
  const size = typeof body?.size === 'string' ? body.size : ''
  const ringAtEnd = body?.ringAtEnd === true
  const baseColor = typeof body?.baseColor === 'string' ? body.baseColor : ''
  const textColor = typeof body?.textColor === 'string' ? body.textColor : ''
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : ''
  const customerPhone = normalizeKzPhone(typeof body?.customerPhone === 'string' ? body.customerPhone : '')
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null

  if (!text || text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: 'Укажите текст брелка (до 20 символов)' }, { status: 400 })
  if (!findPrintShopFont(fontId)) return NextResponse.json({ error: 'Неизвестный шрифт' }, { status: 400 })
  if (!VALID_SIZES.has(size)) return NextResponse.json({ error: 'Неизвестный размер' }, { status: 400 })
  if (!VALID_COLORS.has(baseColor) || !VALID_COLORS.has(textColor)) return NextResponse.json({ error: 'Неизвестный цвет' }, { status: 400 })
  if (!customerName) return NextResponse.json({ error: 'Укажите имя' }, { status: 400 })
  if (!customerPhone) return NextResponse.json({ error: 'Укажите телефон' }, { status: 400 })

  const price = priceForSize(size as KeychainSize)

  const { data: inserted, error } = await supabase
    .from('print_orders')
    .insert({
      font: fontId,
      text,
      ring_at_end: ringAtEnd,
      base_color: baseColor,
      text_color: textColor,
      size,
      price,
      customer_name: customerName,
      customer_phone: customerPhone,
      note,
    })
    .select('id')
    .single()
  if (error || !inserted) {
    console.error('print-shop order create failed:', error?.message)
    return NextResponse.json({ error: 'Не удалось оформить заказ' }, { status: 500 })
  }

  return NextResponse.json({ orderId: inserted.id })
}
```

- [ ] **Step 2: GET — mint/poll оплаты**

```ts
// src/app/api/print/orders/[id]/payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateKaspiPaymentForPrintOrder } from '@/lib/printShop/orderPayment'
import { checkAndSettleKaspiPayment } from '@/lib/kaspiPay/settlePayment'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mirrors /api/shop/[slug]/order-status exactly -- the checkout page polls
// this every few seconds while payment is pending.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: order } = await supabase
    .from('print_orders')
    .select('id, price, status')
    .eq('id', id)
    .maybeSingle()
  if (!order) return NextResponse.json({ payment: null })

  try {
    const payment = await getOrCreateKaspiPaymentForPrintOrder({ id: order.id, price: order.price, status: order.status })
    if (!payment) return NextResponse.json({ payment: null })

    if (payment.status === 'pending') {
      try {
        const outcome = await checkAndSettleKaspiPayment(payment)
        if (outcome === 'paid') payment.status = 'paid'
        else if (outcome === 'expired') return NextResponse.json({ payment: null })
      } catch (e: any) {
        console.error('Print order live status check failed for', order.id, e.message)
      }
    }

    return NextResponse.json({ payment: { qr_token: payment.qr_token, payment_link: payment.payment_link, status: payment.status } })
  } catch (e: any) {
    console.error('Print order payment lookup failed for', order.id, e.message)
    return NextResponse.json({ payment: null })
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/print/orders/route.ts "src/app/api/print/orders/[id]/payment/route.ts"
git commit -m "feat(print-shop): order creation and Kaspi payment polling API routes"
```

---

### Task 14: Публичная страница `/print` — конфигуратор, 3D-превью, чекаут

**Files:**
- Create: `src/app/print/page.tsx`
- Create: `src/app/print/PrintShopClient.tsx`

**Interfaces:**
- Consumes: `PRINT_SHOP_FONTS`, `printShopFontUrl` (`@/lib/printShop/fonts`), `SIZE_PRESETS`, `priceForSize`, `type KeychainSize` (`@/lib/printShop/pricing`), `buildKeychainGeometries` (`@/lib/printShop/keychainGeometry`), API-роуты из Task 13.

- [ ] **Step 1: Серверная обёртка (metadata)**

```tsx
// src/app/print/page.tsx
import type { Metadata } from 'next'
import PrintShopClient from './PrintShopClient'

export const metadata: Metadata = {
  title: 'Именные 3D-брелки на заказ — invoices.kz',
  description: 'Настройте именной брелок: шрифт, цвета, размер — и закажите с оплатой Kaspi Pay.',
}

export default function PrintShopPage() {
  return <PrintShopClient />
}
```

- [ ] **Step 2: Клиентский компонент — конфигуратор + 3D + чекаут**

```tsx
// src/app/print/PrintShopClient.tsx
'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import opentype from 'opentype.js'
import * as THREE from 'three'
import { PRINT_SHOP_FONTS, printShopFontUrl } from '@/lib/printShop/fonts'
import { SIZE_PRESETS, priceForSize, type KeychainSize } from '@/lib/printShop/pricing'
import { buildKeychainGeometries } from '@/lib/printShop/keychainGeometry'

const COLORS = ['белый', 'чёрный', 'серый', 'жёлтый', 'зелёный', 'красный', 'бордовый'] as const
const COLOR_HEX: Record<string, string> = {
  белый: '#f5f5f5', чёрный: '#1a1a1a', серый: '#9ca3af', жёлтый: '#fbbf24',
  зелёный: '#16a34a', красный: '#dc2626', бордовый: '#7f1d1d',
}

const fontCache = new Map<string, opentype.Font>()
async function loadFont(fontId: string): Promise<opentype.Font> {
  const cached = fontCache.get(fontId)
  if (cached) return cached
  const buf = await (await fetch(printShopFontUrl(fontId))).arrayBuffer()
  const font = opentype.parse(buf)
  fontCache.set(fontId, font)
  return font
}

function KeychainMesh({ font, text, size, ringAtEnd, baseColor, textColor }: {
  font: opentype.Font; text: string; size: KeychainSize; ringAtEnd: boolean; baseColor: string; textColor: string
}) {
  const geometries = useMemo(() => {
    if (!text.trim()) return null
    try {
      return buildKeychainGeometries({ font, text, size, ringAtEnd })
    } catch {
      return null
    }
  }, [font, text, size, ringAtEnd])

  if (!geometries) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometries.baseGeometry}>
        <meshStandardMaterial color={COLOR_HEX[baseColor]} />
      </mesh>
      <mesh geometry={geometries.textGeometry}>
        <meshStandardMaterial color={COLOR_HEX[textColor]} />
      </mesh>
    </group>
  )
}

type Step = 'configure' | 'details' | 'payment'

export default function PrintShopClient() {
  const [text, setText] = useState('Самал')
  const [fontId, setFontId] = useState(PRINT_SHOP_FONTS[0].id)
  const [fontQuery, setFontQuery] = useState('')
  const [size, setSize] = useState<KeychainSize>('M')
  const [ringAtEnd, setRingAtEnd] = useState(false)
  const [baseColor, setBaseColor] = useState<typeof COLORS[number]>('белый')
  const [textColor, setTextColor] = useState<typeof COLORS[number]>('чёрный')
  const [font, setFont] = useState<opentype.Font | null>(null)

  const [step, setStep] = useState<Step>('configure')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [payment, setPayment] = useState<{ qr_token: string | null; payment_link: string | null; status: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    loadFont(fontId).then(f => { if (!cancelled) setFont(f) })
    return () => { cancelled = true }
  }, [fontId])

  useEffect(() => {
    if (step !== 'payment' || !orderId || payment?.status === 'paid') return
    const poll = async () => {
      const res = await fetch(`/api/print/orders/${orderId}/payment`)
      const data = await res.json()
      if (data.payment) setPayment(data.payment)
    }
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, orderId, payment?.status])

  const filteredFonts = useMemo(
    () => PRINT_SHOP_FONTS.filter(f => f.label.toLowerCase().includes(fontQuery.toLowerCase())),
    [fontQuery]
  )

  async function submitOrder() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/print/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, font: fontId, size, ringAtEnd, baseColor, textColor, customerName, customerPhone, note }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) { setError(data.error || 'Не удалось оформить заказ'); return }
    setOrderId(data.orderId)
    setStep('payment')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-4xl mx-auto p-4 lg:p-8 grid lg:grid-cols-2 gap-8">
        <div className="aspect-square rounded-2xl overflow-hidden" style={{ background: 'var(--nav-surface-glass)' }}>
          <Canvas camera={{ position: [0, 60, 0], fov: 35 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[20, 40, 20]} intensity={0.8} />
            {font && <KeychainMesh font={font} text={text} size={size} ringAtEnd={ringAtEnd} baseColor={baseColor} textColor={textColor} />}
            <OrbitControls enablePan={false} />
          </Canvas>
        </div>

        <div className="space-y-4">
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Именной 3D-брелок</h1>

          {step === 'configure' && (
            <>
              <input
                value={text}
                onChange={e => setText(e.target.value.slice(0, 20))}
                placeholder="Текст на брелке"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}
              />

              <div>
                <input
                  value={fontQuery}
                  onChange={e => setFontQuery(e.target.value)}
                  placeholder="Поиск шрифта…"
                  className="w-full rounded-lg px-3 py-2 text-sm mb-2"
                  style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}
                />
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {filteredFonts.map(f => (
                    <button key={f.id} onClick={() => setFontId(f.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{ background: fontId === f.id ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: fontId === f.id ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                {(['S', 'M', 'L'] as const).map(s => (
                  <button key={s} onClick={() => setSize(s)}
                    className="flex-1 rounded-lg py-2 text-sm font-medium"
                    style={{ background: size === s ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: size === s ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                    {s} — {priceForSize(s).toLocaleString('ru-KZ')} ₸
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                <input type="checkbox" checked={ringAtEnd} onChange={e => setRingAtEnd(e.target.checked)} />
                Кольцо в конце имени (по умолчанию — в начале)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Цвет основы</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setBaseColor(c)} title={c}
                        className="w-7 h-7 rounded-full border-2"
                        style={{ background: COLOR_HEX[c], borderColor: baseColor === c ? 'var(--nav-accent)' : 'transparent' }} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Цвет текста</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setTextColor(c)} title={c}
                        className="w-7 h-7 rounded-full border-2"
                        style={{ background: COLOR_HEX[c], borderColor: textColor === c ? 'var(--nav-accent)' : 'transparent' }} />
                    ))}
                  </div>
                </div>
              </div>

              <button
                disabled={!text.trim()}
                onClick={() => setStep('details')}
                className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                Заказать за {priceForSize(size).toLocaleString('ru-KZ')} ₸
              </button>
            </>
          )}

          {step === 'details' && (
            <div className="space-y-2">
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ваше имя"
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} />
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Телефон"
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} />
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий (необязательно)" rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} />
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                disabled={submitting || !customerName.trim() || !customerPhone.trim()}
                onClick={submitOrder}
                className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {submitting ? 'Оформляю…' : 'Перейти к оплате'}
              </button>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-3 text-center">
              {payment?.status === 'paid' ? (
                <div className="text-sm" style={{ color: 'var(--nav-success)' }}>
                  Оплачено! Мы начнём печать и свяжемся с вами.
                </div>
              ) : payment?.payment_link ? (
                <>
                  <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Отсканируйте QR или откройте ссылку в приложении Kaspi.</div>
                  <a href={payment.payment_link} target="_blank" rel="noreferrer"
                    className="inline-block rounded-xl py-3 px-6 text-sm font-medium"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Оплатить в Kaspi
                  </a>
                </>
              ) : (
                <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Готовим оплату…</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck и build**

```bash
npx tsc --noEmit
npm run build
```

Expected: оба зелёные. Если сборка падает на серверном рендере `/print` из-за `@react-three/fiber`'s Canvas (иногда требует `'use client'` чуть иначе оформленной границы) — убедиться, что `PrintShopClient.tsx` целиком клиентский компонент (уже помечен `'use client'` вверху), а `page.tsx` остаётся серверным только ради `metadata` — та же связка, что уже используется в проекте (см. [[nextjs16_dynamic_export_client_component_trap]] — память про то, что экспорт из `'use client'`-файла молча не работает, здесь не актуально, потому что `metadata` экспортируется из СЕРВЕРНОГО `page.tsx`, а не из клиентского файла).

- [ ] **Step 4: Ручная проверка в браузере**

```bash
npm run dev
```

Открыть `http://localhost:3000/print`, убедиться: 3D-модель крутится мышкой, меняется при смене текста/шрифта/цвета/размера без лагов, поиск шрифта фильтрует список, кнопка «Заказать» ведёт на форму данных клиента. Дойти до шага оплаты (реальный Kaspi QR появится, если `PRINT_SHOP_OWNER_USER_ID` уже настроен и у этого аккаунта есть активное Kaspi Pay подключение — иначе увидеть `payment: null`, это ожидаемо до Task 15).

- [ ] **Step 5: Commit**

```bash
git add src/app/print/
git commit -m "feat(print-shop): public /print configurator page with live 3D preview and checkout"
```

---

### Task 15: Переменная окружения, финальный гейт, документация

**Files:**
- Modify: `supabase/migrations/README.md` (уже тронут в Task 1 — добавить строку про env var)

**Interfaces:** нет новых.

- [ ] **Step 1: Добавить `PRINT_SHOP_OWNER_USER_ID` в Vercel**

Через Vercel Dashboard → Settings → Environment Variables (или `vercel env add PRINT_SHOP_OWNER_USER_ID production`), значение — `profiles.id` founder'а (тот же аккаунт, что уже используется для Kaspi Pay Cashier и для Telegram-уведомлений планировщика — см. `planner_sessions`/`owner_profile_id`, тот же человек).

- [ ] **Step 2: Полный гейт**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: все три зелёные, без регрессий в существующих тестах.

- [ ] **Step 3: Дописать в `supabase/migrations/README.md`**

В уже добавленную в Task 1 секцию «Витрина именных 3D-брелков» добавить строку:

```markdown
Требует `PRINT_SHOP_OWNER_USER_ID` в Vercel (profiles.id founder'а) — без
него `getPrintShopOwnerUserId()` бросает ошибку, и чекаут не сможет
создать Kaspi-платёж ни для одного заказа.
```

- [ ] **Step 4: Commit и push**

```bash
git add supabase/migrations/README.md
git commit -m "docs(print-shop): document PRINT_SHOP_OWNER_USER_ID requirement"
git push
```

- [ ] **Step 5: Живая проверка после деплоя**

После того как `PRINT_SHOP_OWNER_USER_ID` установлен в Vercel и задеплоено: открыть `https://invoices.kz/print`, пройти весь путь реальными данными (можно с минимальной суммой — цена фиксированная, не поменять), оплатить настоящим Kaspi, убедиться что (а) пришло Telegram-уведомление, (б) оба STL по ссылкам из уведомления открываются и выглядят как настроенный брелок, (в) `print_orders.status = 'paid'` и `base_stl_path`/`text_stl_path` заполнены — проверить через `execute_sql`.

---

## Self-Review

**Покрытие спеки:** текст/шрифт/два цвета/размер — Task 14 (UI) + Task 13 (валидация). Автоконтур вокруг текста — Task 4+5+7. Кольцо в начало/конец — Task 7 (`ringAtEnd`). Два отдельных STL — Task 8+12. Kaspi Pay на сайте — Task 10+11+13. Telegram-уведомление — Task 12. Таблица `print_orders` + связь с `kaspi_payment_requests` — Task 1. Цены-константы — Task 6. Личный магазин без мультитенантности — ни одна задача не трогает `profiles`/обычных продавцов, `PRINT_SHOP_OWNER_USER_ID` фиксирован (Task 9/15). Вне рамок v1 (второй товар, статус доставки, гравировка, произвольные шрифты, полный каталог 8267, ручные мм-настройки, список заказов) — ни одна задача их не строит, явно пропущены.

**Плейсхолдеры:** нет TBD/TODO; единственное место с осознанной неопределённостью — Task 7 Step 5 (ручная проверка ориентации текста по Y) и Task 3 Step 2 (какие-то шрифты у Google могут не найтись под этим точным именем/весом) — оба явно помечены как ожидаемые точки, где мог понадобиться маленький фикс на месте, с точным объяснением что чинить и как проверить, не "добавить обработку ошибок" расплывчато.

**Типы и сигнатуры между задачами:** `Point` (Task 4) используется без изменений в Task 5/7; `KeychainSize`/`SIZE_PRESETS` (Task 6) используются в Task 7/12/13/14 с одинаковыми именами полей (`fontSizeMm`, `baseThicknessMm` и т.д.); `buildKeychainGeometries({font, text, size, ringAtEnd})` — одна и та же сигнатура в Task 7 (объявление), Task 12 (сервер), Task 14 (клиент); `SettleableRequest.print_order_id` (Task 11) совпадает с колонкой из Task 1 и с полем, которое `orderPayment.ts` (Task 10) кладёт в `kaspi_payment_requests`.
