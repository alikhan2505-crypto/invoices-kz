# Языковые версии бесплатных инструментов /tools (ru / kk / en)

Эталон — `/tools/kontragent` (14.10.2026). Все остальные инструменты переводятся по этой же схеме.

## Адреса

| Язык | Адрес | Примечание |
|---|---|---|
| ru | `/tools/<slug>` | старый адрес, не меняется — на него уже ведут выдача и внешние ссылки; он же `x-default` |
| kk | `/tools/kk/<slug>` | как у гайдов (`/guides/kk/<slug>`) |
| en | `/tools/en/<slug>` | |

Язык страницы задаёт **адрес**, а не кука/localStorage посетителя: робот куки не носит, и одна ссылка всегда должна отдавать один текст. Посещение страницы не меняет сохранённый язык посетителя; его меняют только явный клик по переключателю языка и клик в регистрацию (чтобы `/login` открылся на языке страницы).

## Раскладка файлов

```
src/lib/tools-i18n/              общие помощники (стабильный контракт, не ломать сигнатуры)
  index.ts                       ToolLang, toolPath/toolUrl/toolAlternates, toolMetadata,
                                 TOOL_CHROME (общие подписи), toolJsonLd, formatIsoDate, formatTenge
  ToolLangSwitch.tsx             'use client' — переключатель Рус/Қаз/Eng + <html lang> под страницу
  ToolCta.tsx                    'use client' — карточка «Начать бесплатно» на трёх языках
  ToolJsonLd.tsx                 серверный — schema.org WebApplication + BreadcrumbList

src/app/tools/<slug>/
  dict.ts                        ВСЕ тексты инструмента: seo (для <head>) + интерфейс, Record<ToolLang, …>
  <Name>Tool.tsx                 'use client' — сам инструмент, принимает { lang: ToolLang }
  page.tsx                       ru: серверная обёртка (metadata + JsonLd + <Tool lang="ru" />)
src/app/tools/kk/<slug>/page.tsx та же обёртка с LANG = 'kk'
src/app/tools/en/<slug>/page.tsx та же обёртка с LANG = 'en'
```

Старый `src/app/tools/<slug>/layout.tsx`, который держал только metadata (потому что page был клиентским), удаляется — metadata переезжает в серверный `page.tsx`.

## Обёртка страницы (одинаковая для трёх языков)

```tsx
import type { Metadata } from 'next'
import { toolMetadata } from '@/lib/tools-i18n'
import ToolJsonLd from '@/lib/tools-i18n/ToolJsonLd'
import KontragentTool from '../../kontragent/KontragentTool'   // в ru-версии: './KontragentTool'
import { kontragentDict } from '../../kontragent/dict'

const LANG = 'kk' as const
const t = kontragentDict[LANG]

export const metadata: Metadata = toolMetadata('kontragent', LANG, t.seo)

export default function Page() {
  return (
    <>
      <ToolJsonLd slug="kontragent" lang={LANG} name={t.h1} description={t.seo.description} />
      <KontragentTool lang={LANG} />
    </>
  )
}
```

`toolMetadata()` выдаёт: `title` (+ « | invoices.kz»), `description`, `keywords`, `alternates.canonical` = свой адрес, `alternates.languages` = `{ ru, kk, en, 'x-default' }`, Open Graph с `locale` и `alternateLocale`, Twitter-карточку. Картинка превью по умолчанию `/og/tool-<slug>.png` (общая для всех языков; четвёртый аргумент — свой путь, если нарисуют локализованную).

Важно (Next 16): `export const metadata` работает только в серверном файле. Поэтому page.tsx — без `'use client'`, а весь интерактив — в отдельном `<Name>Tool.tsx`.

## Сам инструмент

- Принимает `lang: ToolLang`, берёт тексты `const t = dict[lang]`, общие подписи — `TOOL_CHROME[lang]`.
- **Не** читать язык из `useLanguage()` для текста страницы — только из пропса. `useLanguage().setLang` можно звать на явных действиях (переключатель, регистрация).
- В шапке: `<ToolLangSwitch slug="<slug>" lang={lang} />` — ссылки с `hrefLang` на соседние языки (по ним же ходит робот) и выставление `<html lang>`.
- Внизу: `<ToolCta source="<slug>" lang={lang} />` из `@/lib/tools-i18n/ToolCta` (тот же эвент `tool_cta_click`, плюс `lang`).
- Ссылки «← Все инструменты» / «Гайды»: `toolsIndexPath(lang)` / `guidesIndexPath(lang)`. Индексы есть на всех трёх языках (`/tools`, `/tools/kk`, `/tools/en`, с 14.10.2026).
- Ссылки на соседние инструменты — через `toolLinkPath('<slug>', lang)`: своя языковая версия, если инструмент есть в `LOCALIZED_TOOL_SLUGS`, иначе русский адрес (а не 404). `toolPath('<slug>', lang)` — только для заведомо переведённых.
- В эвенты `track()` добавлять `{ lang }`.
- Даты и суммы: `formatIsoDate()` (→ `ДД.ММ.ГГГГ`), `formatTenge()` (пробелы-разделители и `₸` на любом языке).
- Тексты ошибок API приходят по-русски: на ru их можно показывать как есть, на kk/en — свой перевод по статус-коду (см. `KontragentTool.tsx`).

## Что переводится, а что нет

- Интерфейс инструмента (заголовки, подписи полей, кнопки, ошибки, подсказки) — на язык страницы.
- **Сами документы** остаются в своей юридической форме, как сегодня. На 14.10.2026 `generateInvoicePDF` / `generateAVR` / `generateNakladnaya` / `generateKP` языкового параметра не имеют и печатают только русскую форму — на kk/en-страницах документ выходит тот же русский, это нормально (бланк, который примет бухгалтерия). Язык документа — отдельная настройка документа, не языка страницы; если когда-то появится казахский бланк — давать выбор в форме, а не подменять по языку страницы. Английского бланка не делаем. На kk/en-странице стоит одной строкой предупредить, что документ формируется на русском.
- Данные из госреестров (название компании, статус `statusru`) приходят по-русски. Известные значения можно переводить словариком в `dict.ts` (пример — `status` у kontragent), незнакомые показывать как есть.
- Суммы в `₸`, БИН/ИИН, коды (КБК, КНП, ОКЭД), технические токены — без изменений.

## Как переводить

- Русский текст и ru-metadata переносятся в `dict.ts` **дословно** — иначе собьём уже набранную выдачу (есть тест на неизменность ru-title у kontragent).
- Казахский — живой современный язык с Ә Ғ Қ Ң Ө Ұ Ү Һ І, не калька. Термины: БИН → **БСН**, ИИН → **ЖСН**, ИП → **ЖК**, ТОО → **ЖШС**, КГД → **МКК**, НДС → **ҚҚС**, ЭСФ → **ЭШФ**, АВР → **Орындалған жұмыстар актісі (ОЖА)**, КП → **Коммерциялық ұсыныс (КҰ)**, накладная → **жүкқұжат**, задолженность (налоговая) → **салық берешегі**.
- Английский — для иностранцев и релокантов, ищущих «Kazakhstan …»: в title/description явно писать Kazakhstan, расшифровывать местные аббревиатуры при первом упоминании (State Revenue Committee (KGD), BIN/IIN). Гайдов на английском нет — ссылка «Guides» помечена «(in Russian)».
- Ключевые слова (`seo.keywords`) — свои для каждого языка, по тому, как люди реально ищут на этом языке, а не перевод русских.
- Тест-страховка: одинаковый набор ключей во всех трёх словарях и отсутствие русских аббревиатур в kk (`src/lib/tools-i18n/index.test.ts` — добавить свой инструмент туда же).

## Чего НЕ трогать при переводе одного инструмента

- `src/app/sitemap.ts` и индекс (`src/lib/tools-i18n/ToolsIndexView.tsx`, тексты — `toolsIndex.ts`) руками не трогать: и sitemap (три адреса с hreflang), и карточки индекса на kk/en переключаются сами, когда slug попадает в `LOCALIZED_TOOL_SLUGS` (`src/lib/tools-i18n/index.ts`). Добавлять туда slug — последним шагом, когда готовы все три `page.tsx`: `consistency.test.ts` проверит страницы, hreflang и sitemap.
- Общий `src/app/tools/ToolCta.tsx` — остаётся для ещё не переведённых инструментов; переведённые используют `@/lib/tools-i18n/ToolCta`.
- API-роуты `src/app/api/tools/**` — язык им не нужен.
- Сигнатуры в `src/lib/tools-i18n/**` — на них опираются другие инструменты; расширять только обратно совместимо.

## Состояние на 14.10.2026

- Переведены все восемь инструментов (ru/kk/en, в `LOCALIZED_TOOL_SLUGS`): avr, kontragent, kp, margin, nakladnaya, nalogi, schet, waybills. Индекс `/tools` — на трёх языках, все карточки ведут на версию своего языка (пометка «орысша» / «in Russian» в индексе осталась только как механизм для будущих инструментов). Sitemap отдаёт все 24 адреса инструментов с взаимным hreflang.
- schet и avr переведены последними: сами документы (счёт `generateInvoicePDF`, АВР `generateAVR` по форме Р-1) по-прежнему печатаются на русском, на kk/en-страницах это сказано одной строкой. Ссылки «Выставить счёт» в nalogi/kp идут через `toolLinkPath` и теперь ведут на `/tools/kk|en/schet`.
- Вне `/tools`: казахские гайды (`src/app/guides/kk/**`) ещё ссылаются на русские адреса инструментов — заменить на `/tools/kk/<slug>`. Корневой layout отдаёт серверный `<html lang="kk">` на всех страницах; на `/tools` ru/en его поправляет только клиент (`useToolDocumentLang`).

## Поиск названия по БИН/ИИН (kp, schet, avr, nakladnaya)

- Поле — `BinNameField` из `@/lib/tools-i18n/BinNameField` (`tool`, `role: 'seller' | 'client'`). Ставится ПЕРЕД полем названия: человек вводит БИН, название подставляется ниже. Поиск только по кнопке «Найти»/«Табу»/«Find», кнопка активна при ровно 12 цифрах.
- Тексты статусов общие для всех инструментов — `NAME_LOOKUP_TEXT` в `nameLookup.ts`; подписи самих полей БИН — в `dict.ts` инструмента.
- Сервер — `POST /api/tools/name-lookup { bin, tool, role }` (белый список в `src/lib/toolQuota.ts`): сначала наш кэш `bin_lookup_cache` (бесплатно, без лимита), затем живой реестр — 3 раза на IP в квартал на КАЖДОЕ поле каждого инструмента (ключ `lookup:` + sha256), плюс общий дневной предохранитель `REGISTRY_DAILY_GLOBAL`. Отдаёт только название.
