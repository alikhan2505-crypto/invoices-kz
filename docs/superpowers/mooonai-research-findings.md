# MoonAI (mooonai.com) — Deep Research Findings

**Date:** 2026-08-20
**Method:** Live browser exploration (chrome-devtools-mcp) of a real MoonAI account (`tanprincipal@emalupe.com`, mail.tm), reusing the account created in the 2026-08-15 research pass (which already covered the signup flow, the 3-step onboarding wizard, and one test-chat message — not repeated here). This pass created a **second agent** (via the new "AI-assisted" creation path, then deleted it after verifying multi-agent behavior), ran a real function-calling conversation in Тестовый чат, connected and then disconnected the website-chat channel, and opened every settings tab, billing tab, and secondary screen the product exposes.

**Purpose:** Build spec for invoices.kz's own team to use when deciding what to add to the "AI-агент" feature. Every field name, option list, and default below is the literal product copy, in Russian, as observed live.

---

## 0. Account/session context (useful for interpreting the rest)

- MoonAI accounts can hold multiple **organizations/workspaces** (Настройки → Организации → "Новая организация"), each with its own member list ("Участников: N"). Settings modal also has tabs: Общее (account name, email, referral link, UI language), Безопасность, Пользователи (team members), Подключения.
- There's a referral program: a personal invite link at `https://mooonai.com/join/<CODE>`, shown in Настройки → Общее.
- Trial: confirmed live as **exactly 3 days** on the current landing page ("3 дня бесплатно" appears in the hero, footer CTA, and FAQ) — this differs from the 7-day figure documented in the earlier pass; the billing screen for this account showed a precise countdown "Окончание пробного периода 1 день 20 часов", consistent with a 3-day trial that had already run ~1.2 days.
- The agent list sidebar and the dedicated `/ai-agents` page both support **multiple agents per account** (see §8).

---

## 1. Agent settings — all 9 tabs in detail

Every agent-settings page has a persistent secondary header: an agent name/avatar, a **"Триал режим"** badge (when on trial), a **"Тестовый чат"** shortcut button (top-right, opens the same test chat pre-scoped to that agent), and a **"Видео-урок"** button (links a topic-specific YouTube video, see §7). Tabs: Настройки · Промптинг · Сообщения · LLM‑Модели · Контроль · Функции · База знаний · Интеграции · Каналы.

### 1.1 Настройки (Settings)
Two sub-tabs: **Общие настройки** and **MCP‑серверы**.

**Общие настройки:**
- Avatar picker ("Выбрать аватар")
- **Название** — text field (agent display name)
- **Статус бота** toggle — "Активировать или деактивировать" (kill switch for the whole agent)
- **Состояние чата по умолчанию** toggle — default active/inactive state for *new* conversations
- **Часовой пояс** — dropdown, defaults to `Asia/Almaty GMT+5`
- **Включить расписание** toggle — "Настройте автоматическую активацию бота в определенное время." When on, reveals a **full weekly schedule grid**: one row per day (Пн–Вс), each with a from/to time range (`00:00–23:59` default) using dual time-spinner inputs, plus a "+" button per row to add additional time windows for that day, and a "Настроить часовой пояс" shortcut. All times are relative to the agent's own timezone.
- **Сообщение вне рабочего времени** toggle — "Пока агент не работает, клиент получит ваш заранее подготовленный ответ." Reveals a **Сообщение** textarea (default text mirrors the toggle label) that fires when a client messages outside the schedule.
- **Удалить агента** button (danger, bottom of page) — see §8 for the confirmation flow.

**MCP‑серверы sub-tab:** Empty state "MCP-серверов пока нет" / "Добавьте сервер, чтобы агент мог использовать его функции в диалогах" + **"Добавить сервер"** button opening a **"Новый MCP-сервер"** modal:
- **URL MCP-сервера** * (required, placeholder `https://mcp.example.com/sse`)
- **Заголовки** * (required) — key/value header rows (example prefilled: `Authorization` / `Bearer your-api-key`), "+ Добавить заголовок"
- **Префикс функций** — text field, placeholder `crm`, helper text: "Подставляется к именам функций сервера и помогает избежать совпадений между серверами"
- **Функции сервера** section with a **"Проверить и загрузить"** button that introspects the MCP server and lists its callable tools once URL+headers are filled
- Отмена / Добавить сервер

This means MoonAI agents can call **arbitrary external MCP servers**, not just the built-in "Функции" system — a materially more advanced extensibility layer than a fixed function list.

### 1.2 Промптинг (Prompting)
Two sub-tabs: **Промпт и история** and **Расширенные настройки**.

**Промпт и история:**
- **"Инструкция для агента"** — one large textarea containing the *entire* system prompt as structured plain text (the wizard writes directly into this box; editing it is the "advanced" path). See §1.2.1 below for the exact template MoonAI generates.
- **"Улучшить промпт"** button — opens an AI-assisted prompt-rewrite dialog (used from within the "Быстрый старт" checklist too, see §8).
- **"Сохранить версию"** button + a **"История изменений"** panel below ("Пока нет сохранённых версий промпта" when empty) — i.e. **prompt version history/snapshots**, not just live-edit.

**Расширенные настройки:**
- **Видимость номера / никнейма** toggle — "Отображение информации о данных клиентов" (whether the LLM context includes the customer's phone/nickname)
- **Видимость мессенджера** toggle — "Отображение информации о каналах" (whether the LLM context includes which channel the message came from)

#### 1.2.1 The exact generated system-prompt template
Captured verbatim from the invoices.kz test agent (auto-written by the onboarding wizard from: company name, tone preset, vertical, product description, goal, and data-to-collect list). This is the single most valuable artifact for spec'ing invoices.kz's own prompt generator:

```
РОЛЬ
Первая линия для invoices.kz. Сфера: IT и технологии. Агент онлайн-сервиса
выставления счетов, КП и накладных для малого бизнеса в Казахстане.

ЦЕЛЬ ДИАЛОГА
Ответить на вопросы клиента и при необходимости собрать контактные данные
для передачи менеджеру.

ДАННЫЕ ДЛЯ СБОРА (CLIENTDATA)
client_name — Имя клиента — required
client_phone — Номер телефона — required

ОЧЕРЁДНОСТЬ ВОПРОСОВ
1. Вовлечение: Уточнить запрос или вопрос клиента.
2. Контакт: Запросить имя, затем телефон (если не получили ранее и телефон
   не известен из канала).

ПРАВИЛА КОММУНИКАЦИИ
Агент квалифицирует запросы и собирает контакты.
Один вопрос за сообщение.
Не обещает цену, не регистрирует, не подтверждает заказ, не выдает
коммерческие решения.
Коротко отвечает на встречные вопросы, затем возвращается к сбору данных.
Если необходимо — эскалирует на живого менеджера.

ЯЗЫКИ
Русский, казахский, английский. Агент отвечает на языке первого сообщения.

EMOJI
Используй минимум, не более 1 в сообщении при приветствии и финале.

ПРИВЕТСТВИЕ
Здравствуйте! Вас приветствует сервис invoices.kz для работы с электронными
счетами, КП и накладными. Чем можем помочь вашему бизнесу? Опишите ваш
запрос, чтобы мы быстрее вас сориентировали.

СТРУКТУРА ДИАЛОГА
1. Принять и понять вопрос клиента.
2. Кратко ответить или пояснить по сервису.
3. Запросить имя клиента.
4. Запросить номер телефона (если ещё не получен).
5. После сбора контактов завершить диалог, передав информацию менеджеру.

ПРЕИМУЩЕСТВА КОМПАНИИ
- Оперативная выставка электронных счетов.
- Удобно для малого бизнеса Казахстана.
- Быстрое оформление КП и накладных в одном сервисе.

ПРАВИЛА ВЫЗОВА ФУНКЦИЙ
qualified_lead_handoff: вызвать после сбора обоих обязательных данных.
  Параметры: собранные client_name и client_phone, escalation_reason="qualified_lead", additional_notes (optional).
early_escalation: вызвать при агрессии, срочности, просьбе живого менеджера или сложном вопросе.
  Параметры: client_name (или "не указано"), собранные поля, escalation_reason="early_escalation", additional_notes — причина.

ОГРАНИЧЕНИЯ
Агент не выставляет счёт, не подтверждает заказы, и не обещает стоимость
или возможности без уточнений. Не записывает клиентов самостоятельно.

СЛУЖЕБНЫЕ НАСТРОЙКИ
timezone=Asia/Almaty
currency=KZT (тенге)
```
Note the template is **identical in shape** whether the agent was created via "Настроить вручную" or the newer "С помощью ИИ" flow (see §8) — only the filled-in values differ (e.g. a second test agent with goal "Квалифицировать заявку" got a ЦЕЛЬ ДИАЛОГА / ОЧЕРЁДНОСТЬ ВОПРОСОВ / СТРУКТУРА ДИАЛОГА rewritten around qualification rather than Q&A, but the section skeleton — РОЛЬ, ЦЕЛЬ ДИАЛОГА, ДАННЫЕ ДЛЯ СБОРА, ОЧЕРЁДНОСТЬ ВОПРОСОВ, ПРАВИЛА КОММУНИКАЦИИ, ЯЗЫКИ, EMOJI, ПРИВЕТСТВИЕ, СТРУКТУРА ДИАЛОГА, ПРЕИМУЩЕСТВА КОМПАНИИ, ПРАВИЛА ВЫЗОВА ФУНКЦИЙ, ОГРАНИЧЕНИЯ, СЛУЖЕБНЫЕ НАСТРОЙКИ — is fixed).

### 1.3 Сообщения (Messages)
**"Отправка сообщений"** section:
- **Разделение сообщений** toggle (on by default) — "Каждый абзац будет отправлен в отдельном сообщении" + **"Задержка в секундах"** dropdown (default `2`) between the split messages.
- **Буфер сообщений** — "Задержка отправки сообщений экономит токены и делает бота 'человечнее'" + **"Задержка в секундах"** numeric input (default `1`). This debounces rapid consecutive user messages into one LLM call.

**"Follow-up сообщения"** section (the "дожимные сообщения" feature advertised on the landing page):
- **Отложенная отправка** toggle — "AI-агент автоматически отправляет повторные сообщения при отсутствии ответа." When enabled, reveals:
  - **Дни / Часы / Минуты** — delay before the follow-up fires (default `0д / 04ч / 00м`)
  - **Количество отправок** dropdown — `Одна отправка за диалог` or `Повторные отправки в одном диалоге`
  - **Поведение в нерабочее время** dropdown — default `Отправлять сразу, игнорируя расписание`
  - **Инструкция** — free-text textarea telling the LLM how to *compose* the follow-up (it's AI-generated per-conversation, not a fixed template)
- **Расписание** (separate sub-toggle) — "Включите расписание, чтобы задать рабочие часы отправки сообщений." When on: an **"Интервал отправки"** time range (`00:00–23:59` default) + a **"Отправлять сообщения в выходные"** checkbox. Helper text: "Отложенные сообщения отправляются только в указанный интервал (00:00–23:59, Asia/Almaty). Если время попадает на нерабочие часы, сообщение будет отправлено в начале следующего интервала."

### 1.4 LLM-Модели (LLM Models)
- **"Выберите LLM-модель"** — a searchable combobox. Current selection shown with a description card, a **"Стоимость"** breakdown (входящие/исходящие токены per 1000, plus a flat "Со своим GPT API-key: X cent за запрос" rate), and an **"Использовать свой API-ключ"** toggle ("Запросы будут выполняться через ваш API-ключ" — i.e. BYO-key support that presumably drops the per-token markup to the flat per-request fee).
- Full model list observed in the dropdown (searchable, grouped loosely by provider): **GPT-5.5** ("Самая мощная"), GPT-5.4, GPT-5.4 mini, GPT-5.4 nano, GPT-5, **GPT-4.1** ("Самая популярная" — the default), GPT-4o-mini, GPT-4o, O4 mini, O3, O3 mini, Claude 4.7 Opus, Claude 4.6 Opus, Claude 4.6 Sonnet, Claude 4.5 Sonnet, Claude 4.5 Haiku, Claude 4.1 Opus, Gemini 3.1 flash lite, Gemini 2.5 flash, Gemini 2.5 flash lite, Deepseek v4 flash, Deepseek v4 pro, GLM 5.2, GLM 5.1, GLM 5, GLM 5 turbo, qwen 3.7 plus, qwen 3.7 max, **Open Router** (bring-your-own model via OpenRouter). GPT-4.1 example pricing shown: 0.9¢/1000 input tokens, 3.6¢/1000 output tokens, or 0.1¢/request flat with your own key.
- **"Дополнительные настройки"** has two sub-tabs:
  - **Стандартные настройки**: **Температура** slider (0–1, default `0.5`, labeled "Средняя температура" with contextual copy that changes with the value — "Оптимальный баланс точности и гибкости: агент следует скриптам, но при необходимости проявляет инициативу"); **Распознавать аудио** toggle (on by default) + a model sub-dropdown (`Whisper (99+ языков) Универсальный`); **Распознавать изображения** toggle (on, JPG/PNG/JPEG); **Распознавать файлы** toggle (on, PDF).
  - **Продвинутые настройки**: **Frequency Penalty** slider (−2..2, default 0.0, "Уменьшение повторения часто встречающихся слов") and **Presence Penalty** slider (−2..2, default 0.0, "Уменьшение повторения уже упомянутых слов") — raw OpenAI-style sampling params exposed directly.

### 1.5 Контроль (Control)
Three sub-tabs.

**Оптимизация истории** ("Ускорьте ИИ-агента и экономьте токены, ограничив число последних учитываемых сообщений"):
- **Ограничение по количеству сообщений** — numeric input, default `30` — "ИИ-агент учитывает только последние X сообщений в диалоге с клиентом."
- **Ограничение по времени** — dropdown, default `2 недели` — "ИИ-агент будет учитывать только последние X дней общения с клиентом."

**Контроль вмешательства оператора** (this is MoonAI's human-takeover system — see also §3):
- **Защита от спама пользователя** toggle (off by default) — "Защищает агента от повторных и массовых сообщений." Reveals: **Сообщение при достижении лимита** (custom text), **Кол-во сообщений**, **Длительность**.
- **Пауза при вмешательстве оператора** toggle — **on by default** — "Агент автоматически ставится на паузу, когда менеджер пишет в диалог." This is the core mechanic: any operator message inside a live dialog auto-pauses the AI for that conversation.
- **Игнорировать первое сообщение в диалоге** toggle (off) — "Первое сообщение оператора в диалоге не будет вызывать паузу в работе агента."
- **Автовозобновление работы агента** toggle (off) — "Временной интервал после вмешательства оператора, по истечении которого ИИ-агент возобновит работу." Reveals Дни/Часы/Минуты (default `0/00/03`).
- **Сообщение при возобновлении работы ИИ-агента** toggle (off) + a **Сообщение** textarea — "ИИ-агент отправит сообщение после возобновления работы."
- **Сообщения-исключения** toggle (off) — "ИИ-агент не будет останавливать работу, если оператор отправит эти фразы." A tag-style **Фраза** input ("Нажмите Enter, чтобы добавить фразу") — lets an operator send canned phrases without triggering the pause.

**Управление диалогом по ключевым фразам:**
- **Останавливать диалог по ключевым фразам** toggle (off) — "ИИ-агент остановит работу если клиент отправит эти фразы." Tag-style phrase list.
- **Возобновлять диалог по ключевым фразам** toggle (off) — "ИИ-агент возобновит работу, если клиент отправит эти фразы." Tag-style phrase list.

### 1.6 Функции (Functions)
List view: cards per function (Название + short Описание + Активен toggle) plus a **"+"** button to add a new one. The invoices.kz agent ships with exactly the two functions referenced in its prompt:
- **qualified_lead_handoff** — "Передача квалифицированного лида менеджеру после сбора имени и телефона клиента."
- **early_escalation** — "Досрочная эскалация беседы менеджеру по просьбе пользователя, при агрессии, срочности или сложном вопросе."

Clicking into a function opens a genuinely deep builder (`/functions/{agentId}/{functionId}`):
- **Название**, **Описание** (multiline), **Статус функции** toggle
- **Параметры функции** — a repeatable, drag-reorderable list. Each parameter has: **Название**, **Тип параметра** (dropdown: `Текстовый` or `Числовой` only — a small type system), **Инструкция** (the field's description fed to the LLM), **Возможные значences** (enum-style value list, optional), **Обязательный параметр** checkbox, and a "+" to add more params.
- **"Реакция на выполнение функции"** → **Действие** dropdown: `Ничего не отправлять` / `Сообщение` / `Инструкция` / `ИИ-агент сам решит` (default). An info card explains: "При выборе этой опции ИИ самостоятельно сформирует ответ на основе результатов выполнения функции без дополнительных инструкций."
- **"Пост-сценарий"** → **Действие** dropdown: `Продолжать диалог` (default) / `Поставить диалог на паузу` / `Изменить промпт` / **`Выбрать агента`** — the last option is a genuine **multi-agent handoff mechanism**: a function call can route the conversation to a *different* agent in the account.
- **"Вложенные функции"** — **Целевая функция** dropdown to chain into another function after this one runs.
- **"Отключить отложенные сообщения"** toggle — after this function fires, follow-up nudges (§1.3) are suppressed for that dialog.
- **"Отправка результатов" → Интеграции"** — a multi-select of delivery destinations for the function's captured data, with a **"+"** menu offering: **Telegram отчет**, **WhatsApp-группа**, **Custom API**, **Отправка файла**, **Python** (custom script execution!), **Теги** (auto-tag the dialog), **Отложенные** (schedule a deferred send). For Telegram, the UI shows a live 2-step connect flow: copy a per-workspace secret key, then DM it to `@moonai_telegram_reporter_bot` as `/set <key>` — a single shared bot that multiplexes per-workspace report delivery via that key.
  - Each selected integration then gets a **field-mapping table** (Имя / Действие / Значение per row) so you can compose the outbound message from static text ("Текст") or dynamic values pulled from the function's own parameters ("Параметры из функции").
- **"Удалить функцию"** danger button at the bottom.

**Live-tested behavior:** in Тестовый чат, once the LLM decides to call `qualified_lead_handoff`, the chat renders a distinct **green-tinted "Вызов функции:" card** listing every resolved parameter (`client_name: Алихан`, `client_phone: +7 700 123 45 67`, `escalation_reason: qualified_lead`, `additional_notes: <AI-composed summary of the conversation>`), immediately followed by a **"Результат функции:"** card showing the raw delivery-integration response (in our test, the Telegram delivery wasn't fully configured and returned `Error: 400: Chat ID is required Please fix your mistakes.`). Despite the delivery error, the agent still closed the conversation naturally ("Реакция на выполнение функции" = "ИИ-агент сам решит" degrades gracefully). A **toast notification** also fired: "Уведомление: Функция qualified_lead_handoff вызвана с ошибкой" / "[Функции] Во время выполнения функции произошла ошибка. Проверьте настройки и корректность параметров функции." — i.e. function-execution errors surface both inline in the transcript and as a system notification.

### 1.7 База знаний (Knowledge Base)
Landing page offers two distinct modes, each a separate route:
- **Прямой RAG** ("Заполните данные вручную") — "ИИ проходится по всему массиву знаний, чтобы найти нужную информацию. Дороже, но надежнее." Organized into named **groups** (e.g. create a group "FAQ тест" via a "Добавить группу" modal — just a Название field). Inside a group, entries are added via **"Добавить знание"**: a **Название** + a **Условие** (free-text — this is literally the knowledge content/answer, despite the field being labeled "condition"). Each group also has a **Расширенные настройки** sub-tab exposing classic RAG retrieval knobs: **Максимальное количество результатов (Top K)** slider (1–50, default `10`) and **Порог схожести (Similarity Cutoff)** slider (0.0–1.0, default `0.70`), both with inline guidance text about the token-cost tradeoff.
- **Агентный RAG** ("Загрузите файл с данными") — "ИИ вызывает знания в зависимости от условия, которое задается пользователем." Entries are added via **"Загрузить знание"**: **Название** (validated to `A-Z, a-z, 0-9, _, -`), **Условие** (a natural-language trigger description — functions like a tool description so the LLM decides *whether* to pull this document in, rather than always vector-searching it), and a drag-and-drop **file upload** (supported formats: **txt, pdf, csv**). This is effectively function-calling-style, on-demand document retrieval rather than always-on embeddings search.

### 1.8 Интеграции (Integrations)
Two tabs: **Доступные** (10) / **Подключенные** (0 for a fresh agent). Full catalog observed:

| Integration | Status label | Description |
|---|---|---|
| AmoCRM | Не подключен | "ИИ-агент создает, заполняет карточки клиентов и двигает этапы сделки" |
| Kommo | Не подключен | same copy |
| Битрикс 24 | Не подключен | same copy |
| Google Sheets | Не подключен | "Автоматически выгружайте данные клиентов, с которыми работает ИИ-агент" |
| Google Calendar | Не подключен | "ИИ-агент может назначать и записывать на стрижку, консультацию, созвон и так далее" |
| **Проверка Kaspi-чеков** | Не подключен | "Автоматически проверяет подлинность PDF-чеков от клиентов" |
| **Kaspi Pay** | Не подключен | "Агент выставляет счёт в диалоге, а клиент получает уведомление в приложении Kaspi" |
| Custom Integration | Не подключен | "Связывает агента с внешним сервисом, реализующим вашу бизнес-логику" (self-serve "Подключить") |
| Jivo | По заявке | "Агент отвечает на обращения из чата на сайте, мессенджеров и соцсетей" (sales-assisted "Оставить заявку") |
| U-ON | По заявке | "Агент фиксирует заявки туристов в CRM: контакты, направление, даты, бюджет" (sales-assisted) |

Footer: "Не нашли нужную интеграцию? Сообщите нам, и мы добавим её в план разработки."

The **AmoCRM** connect flow is a standard OAuth grant ("Для привязки аккаунта AmoCRM необходимо нажать на кнопку ниже и авторизоваться в системе... вам будет предложено выдать доступ к вашему аккаунту", "+ Создать подключение").

The **Custom Integration** page is a full generic webhook framework, independent of the "Функции" system:
- **Состояние подключения** (Подключить/Отключить)
- **Конфигурации** — multiple named, independently toggleable configs, each with:
  - **Название** ("Уникальное имя — по нему конфигурация выбирается в функции")
  - **"Хэндлеры по событиям (необязательно)"** — separate webhook URL fields for: **Начало диалога**, **Каждое сообщение**, **Конец диалога**, **Начало триггера**, **Конец триггера**
  - **"Хэндлер вызова функции"** — a dedicated webhook URL invoked when this config is selected as a function's result-delivery target
  - **Заголовки** — key/value auth headers ("Добавить заголовок")
  - **"Передавать интеграции"** — checkboxes to forward this workspace's other connected integrations' access tokens (AmoCRM / Bitrix24 / Google Sheets observed) to the external service
  - **"Добавить конфигурацию"** to define more than one

This is directly relevant to invoices.kz — a Custom Integration config pointed at invoices.kz's own backend (with an "Каждое сообщение"/function-call webhook) would let a MoonAI-style agent create real invoices, check status, etc., without invoices.kz needing to build the chat layer itself.

### 1.9 Каналы (Channels)
Nine channel cards, each "Не подключен" by default:

| Channel | Description | Connect mechanism |
|---|---|---|
| Telegram (бот) | "Подключите ИИ-агента к Telegram, чтобы он автоматически отвечал на сообщения и вёл диалоги с клиентами" | Bot token via BotFather: single **Токен** field + "Создайте бота через BotFather и скопируйте токен" instructions with a linked how-to |
| Telegram (личный) | "Подключите личный аккаунт Telegram, чтобы ИИ-агент писал клиентам от имени реального человека" | (not opened — implies a personal-account login flow, higher risk) |
| Wazzup | "Подключите ИИ-агента к Wazzup" | (third-party WhatsApp/Instagram aggregator, popular in RU/KZ market) |
| WhatsApp | "Подключите личный номер или WhatsApp Business" | 🔒 lock icon on the button (gated — likely requires a paid/verified step) |
| Instagram | "Подключите ИИ-агента к Instagram" | — |
| WABA | "Официальный бизнес-аккаунт через API — для массовых рассылок и верификации бренда" | Подключить button **disabled** until prerequisites met |
| Звонки | "Подключите ИИ-агента к SIP-телефонии" | Подключить button **disabled by default** — voice/SIP channel |
| API | "Подключите любую внешнюю систему — CRM, сайт или приложение — через HTTP" | Generic inbound API channel |
| Чат для сайта | "Подключите ИИ-агента к вашему сайту" | See below — fully explored live |

**Website chat widget (fully connected and tested live, then disconnected for cleanup):**
- **Состояние подключения** → Подключить/Отключить
- **Статус канала** toggle (independent of connection state — lets you disable without disconnecting)
- **Разрешенные домены** — tag-style allow-list of domains permitted to load the script
- **"Скрипт для сайта"** — a copy-paste embed:
  ```html
  <script src="https://dashboard.mooonai.com/cdn/moon-ai-chat-plugin/v2.0.0/moon-ai-site-chat.min.js"></script>
  <script defer>
    window.initMoonAIChat({
      "uuid": "<workspace-scoped id>",
      "company_name": "",
      "consultants": [{ "name": "ИИ консультант" }],
      "start_message": "Здравствуйте, чем могу вам помочь?",
      "colors": { "--mai-primary-bg-color": "#665cfd" }
    });
  </script>
  ```
- **"Конструктор виджета"** (widget builder) with an **"Включить предпросмотр"** live-preview toggle that renders the actual floating chat bubble on the dashboard page itself:
  - **Имя агента поддержки** (default `ИИ консультант`)
  - **Название компании**
  - **Ссылка на фото шапки виджета** — avatar URL, defaults to a robot icon
  - **Акцентный цвет виджета** — 8 preset swatches (violet/green/orange/blue/red/pink/purple/teal) + a custom color-picker/eyedropper, default `#665cfd`
  - **Цветовая тема виджета** dropdown, default `Автоматически` (implies explicit light/dark options too)
  - **Язык виджета** dropdown, default `Автоматически`
  - **Стартовое сообщение** textarea
  - **Visual result** (live-tested): a bottom-right circular chat-bubble launcher; clicking it opens a full-height right-edge panel with a header (avatar + online-status dot + name + close ×), a message area, an input box ("Чем можем помочь?") with a send arrow, and **"Powered by MoonAI"** branding + logo at the very bottom.
- Opening the widget and sending nothing still created a **new dialog entry** in Диалоги ("Website Chat - `<short-id>`", "Неизвестное содержимое") — i.e. even an opened-but-empty widget session gets tracked as a contact.

---

## 2. Дашборд (Дashboard) — full widget inventory
- Date-range control: a date-picker button (`DD.MM.YYYY - DD.MM.YYYY`) plus quick-select radios **Сегодня / Неделя / Месяц / Год**.
- Three top stat cards: **Уникальных диалогов**, **Вызов функций**, **Расходы за токены** (all "За [period]").
- **"Сообщения и диалоги"** — a dual-series area/line chart (Сообщений vs. Диалогов) over the selected period, x-axis timestamped.
- **"Отправленные сообщения"** — a donut/ring chart with center total ("N сообщений") and an "Все" channel-filter toggle beside it.
- **"Агенты"** section — one card per agent: icon, name, expiry date (red text if trial), price (e.g. `0.00 $`), a **"До окончания доступа N дня"** countdown with a red progress bar, and an on/off toggle for the whole agent — plus **"Все агенты"** and **"Мои подписки"** shortcut buttons in the section header.
- A **"Быстрый старт"** checklist card is permanently pinned in the left sidebar (below the nav, above "Прочее") showing `N/4 завершено` — see §8 for its content; it also appears embedded as a first-run modal overlay on other pages ("Агент успешно создан 🎉 ... Ваш номер WhatsApp *" — a mandatory post-creation step requiring a **personal WhatsApp number with OTP verification** before "Начать работу" unlocks — this appears to be how MoonAI captures a real phone contact for every account, distinct from the trial-agent's own channels).

---

## 3. Диалоги (Dialogs) — listing, filtering, and human takeover
- **Layout:** two-pane — a filterable conversation list on the left, transcript + controls on the right ("Выберите диалог" placeholder when nothing selected).
- **List filters:** **"Выберите агента"** dropdown (cross-agent filter), a name/phone search box, a **"Фильтр"** panel (toggle icon) that adds: **Текст сообщения** search, **Мессенджер** (channel) dropdown, **Теги** dropdown; plus status tabs **Все / Ошибка / Пауза** (each showing a live count badge) and a CSV **export/download** icon button.
- **Bulk actions:** checkbox-select one or more dialogs → **"Доп. действия"** dropdown offers **Пауза** / **Возобновить** across the whole selection.
- **Per-dialog detail view** (`/dialogs?agentId=...&chatId=...`):
  - Header: contact name, channel icon, a **"Данные диалога"** button, and — this is the human-takeover control — a **"Выключить ИИ-агента"** button that manually silences the bot for just this conversation.
  - **"Теги:"** row with an inline "+ Добавить тег" affordance.
  - Full transcript, rendered identically to Тестовый чат (including the green function-call/result cards).
  - A message compose box at the bottom lets an operator **type directly into the live conversation** — this is what triggers "Пауза при вмешательстве оператора" (§1.5) in production channels.
  - **"Данные диалога"** opens a 4-tab side-modal:
    - **Данные диалога** — editable Имя / Номер телефона / Имя пользователя / Имя контакта fields (read-only display in our case, showing the channel-level identifiers, distinct from the function-extracted `client_name`/`client_phone`)
    - **Промптинг** — "Промптов пока нет" + **"Добавить промпт"** — a **per-conversation prompt override/injection**, independent of the agent's global prompt
    - **Отложенные** — "Отложенных отправок пока нет" + **"Добавить отправку"** — manually schedule a one-off deferred message for just this dialog
    - **Теги диалога** — tag management

## 4. Рассылки (Broadcasts / Campaigns)
- Empty state: "Вы ещё не создали ни одной рассылки" / **"Создайте первую рассылку, чтобы отправить WABA-шаблон по списку клиентов из CSV."** — i.e. broadcasts are strictly **WhatsApp Business API template messages sent to a CSV-uploaded contact list**, not a general multi-channel campaign tool.
- Creation is a **4-step wizard** ("Шаг 1 из 4"). Step 1, "Настройки":
  - **"Общие настройки"**: Название рассылки (text, placeholder "Акция октябрь"), **Агент с WABA** dropdown, Канал (fixed "WABA")
  - **"Выбор шаблона"** section is **hard-gated**: "WABA не подключен" / "Выберите агента с подключенным WhatsApp Business каналом." Since no agent in this account had WABA connected, steps 2–4 (presumably: template variable mapping, CSV upload, review/send) could not be reached without a real WABA channel — consistent with the cleanup constraint not to connect a real WhatsApp Business account.

## 5. Тестовый чат (Test chat)
- Header shows the current agent (a **combobox to switch which agent you're testing**, useful once multiple agents exist) and a **"Рестарт чата"** button.
- **"Рестарт чата"** opens a confirmation modal: "После перезапуска чата сбросится весь предыдущий контекст диалога." + an **"Очистить историю диалога"** toggle (off by default) — "После перезагрузки чата будет удалена прошлая история сообщений." So restart-alone just resets the LLM's memory/context while keeping the visible transcript; the toggle additionally wipes the visible history.
- Each **agent message** shows a small 👎 thumbs-down icon (feedback/reaction capture — feeds the "Улучшите ИИ-агента через реакцию" flow, §8) and, where applicable, a **token-count badge** (e.g. "1092 токенов") plus "От агента" + timestamp.
- Function calls render as distinct **green-tinted cards** inline in the transcript: "Вызов функции: `<name>`" followed by every parameter on its own line, then a separate "Результат функции:" card with the raw integration response (including error text verbatim when delivery fails).
- No quick-reply suggestion chips were observed in the actual dashboard test-chat UI itself during this session (the pill-shaped "К Анастасии" reply shown in the marketing landing-page demo appears to be illustrative marketing UI for a *live channel* conversation, not a feature present in the dashboard's own Тестовый чат).
- Sending a test-chat message also creates a real entry in **Диалоги** (see §3), tagged by the account's own contact name — i.e. Тестовый чат and Диалоги share the same underlying conversation store.

## 6. Аналитика (dedicated Analytics page)
Materially richer than the Дashboard, with per-metric filtering:
- Agent selector dropdown + date-range picker + Сегодня/Неделя/Месяц/Год quick-selects, and a "reset view" icon top-right.
- Stat cards: **Уникальных диалогов**, **Конверсия функций** (%), **Среднее время ответа** (e.g. "5.4 сек").
- **"Сообщения и диалоги"** chart — independently filterable by **"От всех пользователей"** (user-type dropdown) and **"Все каналы"** (channel dropdown), with totals ("N Сообщений" / "N Диалогов") displayed beside the filters.
- **"Расход за токены"** chart — filterable by **"Все LLM"** (per-model breakdown dropdown).
- **"Функции"** chart — filterable by **"Все функции"**, showing **Вызовов** (call count) and **Конверсия** (%) side by side plus a time-series chart.
- **"Ошибки функций"** chart — same per-function filter, showing an **Ошибок** count and a time series; our test's one delivery error was correctly reflected here, labeled with the function name (`qualified_lead_handoff`).

This is the "per-function conversion, per-channel, date range picker" richness the brief asked about — all four breakdown axes (channel, LLM model, function, error) are real, independently-filterable widgets, not just a single combined view.

## 7. Видео-уроки (Video lessons)
A simple grid of YouTube embeds (channel: `@MoonAI_inc`), six lessons observed:
1. "Ознакомительное видео про возможности платформы и ИИ-агентов"
2. "Как создать ИИ-агента без кода | MoonAI: первые шаги"
3. "MoonAI: пошаговая настройка ИИ-агента для бизнеса и продаж"
4. "Как настроить передачу данных из AI-агента в Google Sheets"
5. "Как работать с базой знаний: разница между прямым и агентным RAG"
6. "Запись разбора: промптинг - как правильно писать промпты и управлять ответами ИИ-агента"

Individual settings pages also surface a **topic-specific "Видео-урок" button** (e.g. the Функции tab links a functions-specific video), so the six grid lessons are also contextually linked from the relevant settings screen.

## 8. Multi-agent management
- **Creating a second agent** is fully supported and was tested live. Clicking **"Создать агента +"** now opens a choice modal — **"Создание нового агента"**: "Настройте агента самостоятельно или доверьте настройку системе" — with two paths:
  - **"Настроить вручную"** — the classic 3-step wizard already documented in the prior pass (company info+tone+vertical+product → goal+data-to-collect → timezone+currency).
  - **"С помощью ИИ"** (new, not previously documented) — routes through a separate branded landing (`/onboarding`, headline "AI-сотрудник для вашего бизнеса всего за пару минут", featuring a photo of MoonAI's founder Askhat Adkhamov) into what turns out to be **the same 3-step form** with cosmetically relabeled copy ("Заполните данные" → "Уточним цели и задачи" → "Дополнительная информация"). Both paths write into the identical prompt-template engine (§1.2.1) — "AI-assisted" is an onboarding *framing*, not a different generation pipeline.
  - Exact captured option lists (previously only summarized, now verbatim):
    - **Tone-of-voice presets (4):** 🤗 Дружелюбный и тёплый · 💼 Профессиональный и деловой · ⚡️ Мотивирующий и энергичный · 🫶 Заботливый и внимательный
    - **Business-vertical presets (27, each with an emoji):** 🏬 Торговля, 🛒 Интернет-магазин, 💄 Красота, 🏥 Медицина и здоровье, 🦷 Стоматология, 💉 Косметология, 🏋️ Фитнес и спорт, 🎓 Образование, ☕ Кафе и кофейни, 🍽 Ресторанный бизнес, 🚗 Автомобильный бизнес, ✈️ Туризм, 🏨 Отельный бизнес, 💰 Финансы, 🛡 Страхование, ⚖️ Право и бухгалтерия, 🏠 Недвижимость, 🛠️ Ремонт, 🏗️ Строительство, 🚚 Логистика и транспорт, 🏭 Производство, 💻 IT и технологии, 📣 Маркетинг и реклама, 🎨 Креатив и контент, 👥 HR и услуги для бизнеса, 🧰 Сфера услуг, ✨ Свой вариант
    - **Primary-goal options (3):** ✅ Квалифицировать заявку · 🗓️ Записать на консультацию/приём · 💬 Ответить на вопросы
    - **Data-to-collect checklist (12 presets + custom):** 👤 Имя клиента · 📞 Номер телефона · 📅 Бронирование · 📝 Запись на консультацию · 📍 Адрес · 🎯 Цель обращения · 💸 Бюджет · ⏳ Желаемые сроки · 👥 Количество человек · 🏙️ Город · ⭐️ Предпочтения · 🗂️ Прошлый опыт клиента · ✨ Добавить своё
  - Creation for the second agent completed **without the ~60-second loading screen** seen in the first pass — it returned almost instantly to the "Быстрый старт" checklist. (The first agent's ~55-second countdown screen may be specific to true first-time account onboarding rather than every agent creation.)
  - The new agent immediately appeared in the left sidebar (under "ИИ-Агенты", listed alongside the existing agent) and on the `/ai-agents` grid as its own card with its own expiry/price/toggle — fully independent settings, prompt, functions, integrations, and channels per agent (URL includes the agent's numeric ID).
- **Deleting an agent:** "Удалить агента" (bottom of Настройки) opens a **"Удалить агента"** modal: "Вы уверены, что хотите удалить агента "<name>"?" with an explicit warning box — **"Будет удалено безвозвратно: — Все настройки и интеграции агента — Активная подписка (при наличии)"** — and a **type-to-confirm** field ("Для подтверждения перед удалением введите название агента") that must exactly match the agent's name before "Удалить" enables. There is **no archive/pause-forever option** — only this one hard, permanent delete path (separate from the per-agent "Статус бота" toggle, which is a soft on/off, not a delete).
- **"Быстрый старт" checklist is account-wide, not per-agent.** The `/getting-started` page has no agent selector and stayed at "0/4" identically before and after creating the second agent — it appears to track against a single, presumably most-recently-active, agent rather than being duplicated per agent. Its 4 items (confirmed by expanding each):
  1. **"Улучшите ИИ-агента через реакцию в тестовом чате"** — "Напишите агенту в тестовом чате, дождитесь ответа, поставьте реакцию и опишите, что хотите изменить" (buttons: Улучшить ИИ-агента / Пропустить)
  2. **"Скорректируйте промпт агента"** — "Перейдите в промптинг и улучшите инструкции агента с помощью ИИ-корректировки" (buttons: Скорректировать / Пропустить)
  3. **"Уведомление об успешном диалоге"** — "Укажите Telegram, куда агент отправит данные об успешном диалоге с клиентом" (buttons: Настроить / Пропустить)
  4. **"Передача менеджеру в экстренных случаях"** — "Укажите Telegram для уведомлений при запросе менеджера или срочном вопросе" (buttons: Настроить / Пропустить)
  (Items 3 and 4 map directly onto the two built-in functions, `qualified_lead_handoff` and `early_escalation`, and their Telegram-report delivery integration.)

## 9. Каналы / Интеграции specifics
Covered in full in §1.8 and §1.9 above. Summary of connect-mechanism types actually observed:
- **Bot-token paste** (Telegram бот) — simplest, no OAuth.
- **OAuth grant** (AmoCRM) — redirect-and-authorize flow.
- **Embed script + no-code widget builder** (Чат для сайта) — fully self-serve, includes live preview.
- **Webhook/API key config** (Custom Integration) — self-serve, supports multiple named configs and per-lifecycle-event URLs.
- **Locked/gated** (WhatsApp — 🔒 icon; WABA and Звонки — disabled buttons) — these likely require either a paid plan tier, a completed prerequisite (e.g. WABA before broadcasts), or manual provisioning.
- **Sales-assisted / "Оставить заявку"** (Custom Integration's enterprise variant is self-serve, but Jivo, U-ON, and the "Под ключ" pricing tier all route to a request form instead of self-serve setup).

## 10. Pricing / subscription management
Confirmed via the live billing modal (opened from the sidebar **"Подписки"** button or the Dashboard's **"Мои подписки"** link — both open the identical 5-tab modal: **Баланс · Подписки · Агенты в подписке · История · Способы оплаты**):

- **Баланс tab:** a wallet-style **"Основной баланс"** (token spend balance, `0.00$` for a fresh account) shown alongside a separate **"бонусов"** balance, a **"Пополнить баланс"** button (not clicked — leads to a real payment flow), and an **"Автопополнение баланса"** toggle with **Сумма пополнения в $** / **Порог баланса в $** fields — i.e. auto-recharge-when-below-threshold, same pattern as prepaid ad platforms.
- **Подписки tab:** two audience sub-tabs, **Малый бизнес** and **Крупный бизнес**:
  - **Малый бизнес → Стандарт** — "Идеально для малого бизнеса", **от 50$/месяц**: Один ИИ-агент для бизнеса · Все каналы и интеграции · Обучение AI на ваших данных · История чатов и AI-аналитика · Поддержка специалистов · Бонусы на счет. Button: **"Оформить подписку"** (self-serve).
  - **Малый бизнес → Под ключ** — "Настроим агента под ваш бизнес", **от 160$/месяц**: Все из стандартного тарифа · Настройка с учетом нюансов · Учет прайс-листов и пожеланий · Формирование базы знаний · Готовый агент как менеджер · Бонусы на счет. Button: **"Оставить заявку"** (sales-assisted, MoonAI's team does the setup).
  - **Крупный бизнес → Enterprise** — "Для масштабных команд и задач", **"Индивидуально"** (custom quote): Все из стандартного тарифа · **Любое количество агентов** · Кастомное решение под вас · Персональный менеджер · Гарантия SLA и стабильность · Глубинная аналитика. Button: "Оставить заявку". **This confirms the base Стандарт tier is scoped to one agent; unlimited multi-agent is an Enterprise-only entitlement** (though our trial account was able to create a second agent freely — trial mode appears not to enforce this limit).
- **Агенты в подписке tab:** per-agent subscription status list. Our agent showed **"Пробный период"** / **"Окончание пробного периода 1 день 20 часов"** / **"Активируйте подписку чтобы снять ограничения."**
- **История tab:** a transaction ledger (Дата / Источник / Операция columns) filterable by **"Тип транзакции"** and date range — empty for this account.
- **Способы оплаты tab:** "Нажмите «Добавить карту», чтобы сохранить новый способ оплаты" + **"Добавить карту"** button — not clicked, per the no-real-payment-details constraint.

---

## Prioritized recommendations for invoices.kz

invoices.kz's AI-агент today is: one Instagram-only agent, 4 tone presets, free-text description, a 2-option goal picker, and a 2-checkbox data-collection list (Имя/Телефон). No multi-agent, no campaigns, no dedicated analytics page. Given that starting point, here's what's worth building, roughly in build order:

**Tier 1 — highest leverage, most contained scope:**
1. **Human-takeover controls on existing conversations** (§1.5 "Контроль вмешательства оператора" + §3 per-dialog "Выключить ИИ-агента" button). invoices.kz almost certainly already has an operator inbox for its Instagram DMs; adding "operator sends a message → bot auto-pauses" plus a manual on/off per conversation is a small, high-trust feature that directly prevents the AI from talking over a human.
2. **Structured, versioned prompt editing** (§1.2): expose the auto-generated prompt as an editable textarea with a "Сохранить версию"/history list, instead of it being fully opaque. Even without MoonAI's "Улучшить промпт" AI-rewrite button, a raw edit + version snapshot is cheap to build and unblocks power users immediately.
3. **Richer data-to-collect list + custom fields** (§8's 12-preset list vs. invoices.kz's 2). Trivial schema change, large perceived-capability jump, and it's exactly what the existing prompt-generation code already has a slot for (`ДАННЫЕ ДЛЯ СБОРА`).
4. **A dedicated Functions/Actions concept**, even minimal: today invoices.kz presumably hard-codes "collect name+phone, notify me." Formalizing this as MoonAI's `qualified_lead_handoff`/`early_escalation` pattern — named function, params, a delivery target (start with just Telegram/email, which invoices.kz already has wired per user memory) — sets up cleanly for #5 and #6 below without a redesign later.

**Tier 2 — meaningfully differentiating, moderate scope:**
5. **Per-function delivery routing to Telegram** (§1.6's "Отправка результатов"), building on invoices.kz's *already-shipped* Telegram bot infrastructure (per user memory, Telegram toggle exists but is currently decorative with no per-user Telegram). This is a natural place to finally wire that up for real: "when a lead is qualified, send me a Telegram message" is concrete, useful, and reuses existing plumbing.
6. **A minimal Аналитика page** with just 2 of MoonAI's widgets: messages/dialogs-over-time and a function-conversion rate. Even without full per-channel/per-model breakdowns, this closes the single biggest visible gap versus MoonAI (currently zero analytics beyond nothing).
7. **Website chat widget channel** (§1.9): invoices.kz has a marketing site and presumably wants leads from it; a copy-paste embed script with a tiny color/name customizer is a well-scoped, high-conversion feature, and unlike Instagram it requires no Meta app review process.

**Tier 3 — worth doing, but sequence after the above:**
8. **Multi-agent support**, but only once #1–4 exist — the MoonAI evidence (§8) shows the incremental cost of multi-agent is mostly "give the settings pages an agent-ID param and add a picker," *not* new product surface, since every tab (Настройки/Промптинг/Функции/etc.) is already scoped per-agent by construction. Recommend architecting new settings pages with an agent ID in the route from day one, even while invoices.kz ships only one agent, so this becomes a routing change later rather than a rewrite.
9. **Follow-up/nudge messages** (§1.3 "Отложенная отправка") — valuable for reducing drop-off on qualified leads that go quiet, but needs careful scheduling/timezone infrastructure (Дни/Часы/Минуты + working-hours window) that's more work than it looks.
10. **Custom Integration webhook framework** (§1.8) — powerful (lets the agent call invoices.kz's own backend to check/create invoices mid-conversation) but is real infrastructure work; treat as a v2 differentiator once the core agent product has traction, not a v1 item.

**Probably not worth building soon:**
- **Рассылки/broadcasts** (§4): hard-gated behind WABA (official WhatsApp Business API) in MoonAI's own product, which itself requires Meta Business verification — a heavy lift disproportionate to invoices.kz's current single-channel (Instagram) footprint. Revisit only after WhatsApp becomes a supported channel.
- **MCP-server support and Python custom-code execution** (§1.1, §1.6): technically impressive but aimed at a technical power-user segment MoonAI itself gates behind its higher tiers; low priority for invoices.kz's SMB-focused user base.
- **Full billing/wallet self-service UI** (§10): only matters once invoices.kz sells AI-агент as metered/token-based rather than bundled into an existing plan tier.
