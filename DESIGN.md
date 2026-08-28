---
name: invoices.kz
description: Карманная бухгалтерия для ИП и ТОО Казахстана — счета, КП, АВР и накладные за 30 секунд
colors:
  navy-primary: "#1C2056"
  mint-accent: "#2DC48D"
  surface-page: "#f9fafb"
  surface-card: "#ffffff"
  surface-hover: "#f3f4f6"
  ink-secondary: "#6b7280"
  ink-muted: "#9ca3af"
  ink-input: "#111827"
  border-default: "#e5e7eb"
  danger: "#ef4444"
  info-link: "#60a5fa"
  warning: "#eab308"
  dark-bg: "#0f1117"
  dark-card: "#1a1d27"
  dark-border: "#2d3148"
typography:
  body:
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  title:
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.navy-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-primary-active:
    backgroundColor: "{colors.navy-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  icon-action-view:
    backgroundColor: "transparent"
    textColor: "{colors.info-link}"
    rounded: "{rounded.full}"
    size: "32px"
  icon-action-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
    size: "32px"
  card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: invoices.kz

## 1. Overview

**Creative North Star: "The Pocket Ledger"**

invoices.kz — это бухгалтерия, которая помещается в карман. ИП и ТОО Казахстана открывают её между делами, часто с телефона на ходу, чтобы выставить счёт клиенту за 30 секунд и не думать о дизайне больше, чем нужно. Каждый экран — это один понятный шаг, без лишних полей и решений.

Система отвергает тяжёлую «корпоративную» бухгалтерскую эстетику: никаких таблиц в стиле 1С/Excel, никаких серых форм без иерархии, никакого «интерфейса для опытного бухгалтера». Вместо этого — плоские светлые карточки, один глубокий navy-акцент и редкий мятный для денег/успеха, в духе казахстанских финтех-приложений (Kaspi/Tinkoff): быстро, современно, по делу.

**Key Characteristics:**
- Светлый, почти бумажный фон (`#f9fafb`) с чистыми белыми карточками
- Один доминирующий брендовый цвет (глубокий navy `#1C2056`) на хедерах, primary-кнопках и активных состояниях
- Мятный акцент (`#2DC48D`) зарезервирован за деньгами и подтверждением успеха
- Плоская элевация — `shadow-sm` и ничего тяжелее
- Полная поддержка тёмной темы через `data-theme` атрибут, не `prefers-color-scheme`

## 2. Colors

Палитра сдержанная: один доминирующий цвет, один акцент для денег, остальное — нейтральные оттенки серого на белой подложке.

### Primary
- **Карманный Navy** (`#1C2056`): главный брендовый цвет. Хедеры, primary-кнопки, активные иконки навигации, акцентные заголовки сумм. Используется как единственный «голос» бренда на экране — не более одного крупного navy-блока на первом экране.

### Secondary
- **Чек Mint** (`#2DC48D`): зарезервирован за деньгами — успешные платежи, активные тарифы, позитивные суммы. Не используется как декоративный акцент.

### Neutral
- **Бумажный фон** (`#f9fafb`): фон страниц (`bg-gray-50`).
- **Карточный белый** (`#ffffff`): поверхность карточек, шапки экранов.
- **Hover-серый** (`#f3f4f6`): hover/pressed состояния плоских поверхностей.
- **Вторичный текст** (`#6b7280`): подписи, второстепенные данные (даты, статусы).
- **Приглушённый текст** (`#9ca3af`): плейсхолдеры, неактивные иконки навигации.
- **Текст полей ввода** (`#111827`): значения в input/textarea/select.
- **Граница по умолчанию** (`#e5e7eb`): разделители карточек и списков.

### Functional
- **Опасность** (`#ef4444`/`text-red-400`): удаление, деструктивные действия.
- **Информационная ссылка** (`#60a5fa`/`text-blue-400`): просмотр, нейтральные второстепенные действия.
- **Предупреждение** (`#eab308`): промокоды и служебные пометки в админке.

### Named Rules
**The One Navy Rule.** Глубокий navy (`#1C2056`) — единственный «громкий» цвет интерфейса. Он не разбавляется вторым ярким акцентом на одном экране: деньги — mint, опасность — red, всё остальное — оттенки серого.

**The Money-Only Mint Rule.** Мятный `#2DC48D` появляется только там, где речь о деньгах или успехе (оплачено, активный тариф, положительная сумма). Использование его как декоративного акцента запрещено.

## 3. Typography

**Body Font:** Geist (var(--font-geist-sans)), с резервом на Arial/Helvetica/system sans-serif.

**Character:** Geist — чистый геометрический гротеск, который на мобильных экранах казахстанских ИП читается так же легко, как нативный системный шрифт, но выглядит более современно, чем голый Arial.

### Hierarchy
- **Title** (600, 16px, 1.3): заголовки экранов в шапке (`font-semibold text-[#1C2056]`).
- **Body** (400, 14px, 1.5): основной текст карточек, списков, форм.
- **Label** (500, 12px, 1.4): подписи под суммами, бейджи количества, статусы.
- **Numeric/Money** (700, 14–16px): суммы всегда жирные, `text-[#1C2056]` или `text-white` на цветной подложке — деньги должны считываться мгновенно, без вчитывания.

### Named Rules
**The Instant-Sum Rule.** Денежная сумма на экране всегда жирнее и контрастнее окружающего текста — она самый важный объект на строке, глаз должен находить её первой.

## 4. Elevation

Система плоская по умолчанию. Глубина передаётся не тенью, а контрастом фон/карточка (бумажный `#f9fafb` под белой `#ffffff` карточкой), а не стопками теней.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` / Tailwind `shadow-sm`): единственная тень в системе, на всех карточках и табах в состоянии покоя.

### Named Rules
**The Flat-By-Default Rule.** Никаких `shadow-md`/`shadow-lg`/`shadow-xl`. Если карточке нужно выделиться — меняется заливка (`bg-[#1C2056]` для итоговых блоков), не тень.

## 5. Components

### Buttons
- **Shape:** скруглённые углы 12–16px (`rounded-lg`/`rounded-xl`), полный `rounded-full` только у круглых иконок/бейджей.
- **Primary:** `bg-[#1C2056] text-white`, паддинг `px-6 py-3`, обычно на всю ширину контейнера для ключевого CTA.
- **Hover/Active:** `transform: scale(0.95); opacity: 0.8` на active (заглобальный `button:active` в globals.css) — тактильный фидбэк без теней и цветовых переходов.
- **Secondary/Tab:** `bg-white text-gray-500 shadow-sm`, активный таб — `bg-[#1C2056] text-white`.

### Icon Action Buttons
- **Style:** без фона, без рамки, только цвет иконки — `text-blue-400 hover:text-blue-600` (нейтральное действие вроде «посмотреть»), `text-red-400 hover:text-red-600` (удаление). Визуальный размер иконки может оставаться 32×32px и меньше, но **тач-зона кнопки — минимум 44×44px** (базовый уровень доступности из PRODUCT.md): расширяем зону нажатия невидимым паддингом (`w-11 h-11 flex items-center justify-center`, как у `.back-btn`), иконка остаётся маленькой по центру. Тач-зоны соседних иконок не должны перекрываться.
- **Don't:** не добавлять фон/обводку этим иконкам — они нарочно «тихие», чтобы не спорить с основным CTA на экране.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px) для контейнеров-списков, `rounded-xl` (12px) для элементов внутри.
- **Background:** белый на бумажном фоне страницы.
- **Shadow Strategy:** только `shadow-sm`, см. Elevation.
- **Border:** внутренние разделители строк — `border-b border-gray-100`, внешней рамки у карточки нет (тень + цвет фона уже отделяют её от страницы).
- **Internal Padding:** `p-4` для контейнера, `px-4 py-3.5` для строк списка.

### Inputs / Fields
- **Style:** текст `#111827`, плейсхолдер `#9ca3af`, фон обычно `bg-gray-50` или белый с рамкой `border-gray-200`.
- **Focus:** видимое выделение рамки (унаследовано от Tailwind `focus:ring`/`focus:border` паттернов проекта).

### Navigation (Bottom Nav)
- **Style:** фиксированная нижняя панель, `bg-white border-t`, три пункта.
- **States:** активная иконка/подпись — `#1C2056` с `font-medium`; неактивная — `#9ca3af`. Бейдж непрочитанного — `bg-red-500` кружок с числом.

### Document List Item (signature pattern)
Карточка-список документов (КП/АВР/Накладные) — главный повторяющийся паттерн архива: строка с номером документа, бейджем даты, именем клиента и суммой слева, действия (просмотр/удаление) — тихими иконками справа, разделены `border-b border-gray-100`. Сумма всегда жирная и `text-[#1C2056]` по Instant-Sum Rule.

## 6. Do's and Don'ts

### Do:
- **Do** держать на экране один доминирующий navy-блок (`#1C2056`) — не два.
- **Do** делать денежные суммы жирными и контрастными (см. The Instant-Sum Rule).
- **Do** использовать `shadow-sm` как единственную тень в системе.
- **Do** использовать `rounded-xl`/`rounded-2xl` для всех карточек и крупных кнопок — система скруглённая, не острая.
- **Do** держать тач-зоны действий ≥44px (визуально иконка может быть меньше — зона расширяется невидимым паддингом), особенно в рядах из нескольких иконок.

### Don't:
- **Don't** использовать тяжёлую «корпоративную» бухгалтерскую эстетику — таблицы в духе 1С/Excel, серые формы без иерархии.
- **Don't** использовать мятный `#2DC48D` decoративно — только для денег/успеха (The Money-Only Mint Rule).
- **Don't** добавлять `shadow-md`/`shadow-lg` — система плоская по умолчанию.
- **Don't** использовать `border-left`/`border-right` цветной полосой как акцент на карточках.
- **Don't** использовать градиентный текст или eyebrow-подписи — это SaaS-клише, чуждое продукту для ИП.
- **Don't** переопределять `body` system-шрифтом (Arial) поверх подключённого Geist — шрифт должен резолвиться через `var(--font-geist-sans)`.
