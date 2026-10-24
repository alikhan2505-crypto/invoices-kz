# Команды и протокол для invoices-kz-ui

Все команды запускать из корня репозитория `C:/Users/Abilbayev.Alikhan/invoices-kz` (Git Bash). Они только читают. Проверено 24.10.2026.

## 1. Грепы по диффу

Сырые цвета в новом коде (ожидаемый результат: пусто). Предупреждения git про CRLF уходят в stderr, их глушим:

```
git diff -U0 -- '*.tsx' '*.css' 2>/dev/null | grep -nE '^\+.*(bg-gray-|text-gray-|border-gray-|#[0-9a-fA-F]{6}\b)'
```

`transition: all` и `transition-all` (на 24.10 в 20 файлах; в новом коде ноль):

```
grep -rlE "transition-all|transition:\s*all" src
```

Страницы разделов без общего заголовка (на 24.10 три: `profile/page.tsx`, `profile/about/page.tsx`, `ai-agent/setup/page.tsx`):

```
for d in "src/app/(cabinet)" src/app/kaspi-shop src/app/ai-agent src/app/kaspi-api; do find "$d" -name page.tsx -print0 | xargs -0 grep -L "PageHeader"; done
```

Свой `<h1` в страницах кабинета (должен быть только внутри PageHeader; сейчас остаётся `profile/page.tsx`):

```
grep -rln "<h1" "src/app/(cabinet)" --include=page.tsx
```

Иконки-кнопки без подписи и кликабельные div (смотреть глазами, список для ревью, не автоматический вердикт):

```
git diff -U0 -- '*.tsx' 2>/dev/null | grep -nE '^\+.*<div[^>]*onClick'
```

Поля БИН, ИИК, телефон без `inputMode`:

```
git diff -U0 -- '*.tsx' 2>/dev/null | grep -nE '^\+.*<input' | grep -vE 'inputMode'
```

## 2. Детектор impeccable

Путь зависит от установленной версии плагина (на 24.10 это 3.8.0). Найти актуальный:

```
find /c/Users/Abilbayev.Alikhan/.claude/plugins/cache -name detect.mjs
```

Запуск по изменённым файлам (пустой массив `[]` значит находок нет; проверено на `src/components/PageHeader.tsx`):

```
node <путь к detect.mjs> --json $(git diff --name-only -- '*.tsx' '*.css')
```

Конфиг детектора: `.impeccable/config.json` (`ignoreFiles` для генераторов PDF и писем, `ignoreValues` с причинами). Ложное срабатывание не глушить молча: добавить значение с полем `reason`. Файл `.impeccable/hook.cache.json` в git не идёт.

## 3. Типы и тесты

В `package.json` есть `lint` и `test` (`vitest run`), скрипта на tsc нет:

```
npx tsc --noEmit
npx vitest run
```

Перед `next build` удалить `.next/dev/types` (если там остался `validator.ts` от dev, сборка падает). Параллельные сборки не запускать. Dev-сервер один на каталог (замок `.next/dev/lock`).

## 4. Матрица темы (4 клетки)

В браузере (Playwright) для каждой клетки выставить условие, открыть страницу и считать токен:

| Клетка | ОС | localStorage `theme` |
|---|---|---|
| 1 | тёмная (`emulateMedia colorScheme: dark`) | нет ключа |
| 2 | тёмная | `light` |
| 3 | светлая | `dark` |
| 4 | любая | принудительно светлый маршрут `/` или `/cashier-api` |

Проверка в консоли страницы (после выставления `localStorage` перезагрузить страницу):

```
getComputedStyle(document.documentElement).getPropertyValue('--nav-bg')
```

Ожидание: клетка 1 тёмный `#0E1020`, клетка 2 светлый `#F5F6FB`, клетка 3 тёмный, клетка 4 светлый. Значения взяты из `globals.css` на 24.10; если палитру меняли, сверить с файлом. Затем скриншот каждой клетки на трёх типах страниц: кабинет, продуктовый раздел, 404 или загрузка. Ключ `theme` читает `ThemeProvider.tsx` (`light` или `dark`, иное значит «системная»).

## 5. Мобильные ширины и WebKit

- Ширины: 1440, 768, 390, 360. Горизонтального скролла нет (`document.documentElement.scrollWidth <= innerWidth`).
- Для iPhone-багов использовать движок WebKit (эмуляция устройства), а не Chromium. Ловушка из `SiteNav.tsx`: `backdrop-filter` на `<main>` делает его containing block для `position: fixed` только в WebKit.
- Замедленная сеть для tri-state: профиль и права должны не мигать апсейлом и замками при задержке 300 и 1000 мс.

## 6. Живой CSS после деплоя

```
curl -s https://invoices.kz/<страница> | grep -o '/_next/static/[^"]*\.css' | sort -u
curl -s https://invoices.kz<путь чанка> | grep -c '<новый класс>'
curl -sI https://invoices.kz<путь чанка> | grep -iE 'age|x-vercel-cache|cache-control'
```

Если новый класс не найден, а HTML свежий: вынести правила в новый css-файл и импортировать из компонента (ловушка 13.10).

## 7. Порядок переделки существующего экрана (taste-skill redesign protocol, пересказ)

Снять «до» на закреплённых ширинах. Назвать три изменения с наибольшим эффектом. Сохранить стек и контент. Менять по порядку: типографика, цвет, рамка, состояния, компоненты. Снять «после» на тех же ширинах и сравнить. Отчёт заявляет только реально выполненные проверки (строка «Проверено / Не проверено»). Банлист из того же скилла не применять.

## 8. Недостающие инструменты (кандидаты, нужен отдельный запрос на правку репозитория)

Эти скрипты в репозитории отсутствуют; чек-лист выше держится на ручных командах: скрипт матрицы темы, скрипт контраста пар токенов, тест «страница в `(cabinet)` без PageHeader», `:where()` для ресетов `.prd-root` и `.lp-root`, `color-scheme` на корне, общий модуль `src/lib/motion.ts` и глобальный `MotionConfig reducedMotion="user"`. Не создавать их в рамках правки скилла.
