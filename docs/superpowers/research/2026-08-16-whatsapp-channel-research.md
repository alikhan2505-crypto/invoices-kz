# WhatsApp-канал для AI-агента — исследование (2026-08-16)

Собрано за ночь по запросу: «настраивай подключения whatsapp, узнай всё что надо на
гитхабе и на сайте Meta». Источники: официальная документация Meta (через Meta
Developer Tools MCP, devtools_discovery), GitHub. Всё проверено на актуальность
августа 2026 (в доках даты обновлений май–июль 2026).

## TL;DR

Мультитенантное подключение WhatsApp для клиентов invoices.kz делается через
**Embedded Signup** — это WhatsApp-аналог только что заработавшего у нас
Instagram Business Login. Мы становимся **Tech Provider** (не Solution Partner —
кредитная линия не нужна). Business Verification **уже пройдена сегодня** — это
был самый долгий пункт. Остался App Review на 2 разрешения (средний срок — ~24
часа!) и сама интеграция. Экономика отличная: наш сценарий (бот отвечает на
входящие) сейчас полностью бесплатен у Meta, но с 1 октября 2026 станет платным
per-message — закладывать в цену кредитов сразу.

## Как работает подключение клиента (Embedded Signup)

1. Кнопка «Подключить WhatsApp» у нас на сайте запускает попап Embedded Signup
   (JS SDK, Facebook Login for Business) — клиент логинится в Meta, создаёт/выбирает
   бизнес-портфолио и WABA (WhatsApp Business Account), вводит и верифицирует свой
   номер, даёт нашему приложению доступ.
2. Попап возвращает в наше окно: `waba_id`, `phone_number_id`, одноразовый
   `code`.
3. Наш сервер:
   - меняет `code` на **business token** (клиентский токен) через
     `GET /oauth/access_token` (client_id + client_secret + code) — прямой аналог
     нашего Instagram-callback;
   - регистрирует номер для Cloud API: `POST /<PHONE_NUMBER_ID>/register`
     (с PIN);
   - подписывает приложение на вебхуки клиентского WABA:
     `POST /<WABA_ID>/subscribed_apps` — тот же грабель, что мы поймали с
     Instagram (без этого вебхуки молча не приходят), только на уровне WABA.
4. Дальше: входящие сообщения приходят на наш webhook (topic `whatsapp_business_account`,
   поле `messages`), отвечаем через `POST /<PHONE_NUMBER_ID>/messages` клиентским
   токеном.

**Hosted Embedded Signup** — вариант «нулевой интеграции»: Meta даёт готовую
страницу-онбординг по URL (App Dashboard → WhatsApp → Quickstart → View
onboarding → Zero integration onboarding). Не кастомизируется, но для MVP может
снять весь JS SDK-этап. Требования: рабочий production webhook + подписка на
`account_update`.

**Coexistence (важно для КЗ!)**: клиент может подключить номер, который уже
живёт в его приложении WhatsApp Business на телефоне (версия 2.24.17+), И
ПРОДОЛЖАТЬ пользоваться приложением — история чатов синхронизируется. Это
критично: у казахстанских малых бизнесов вся жизнь в WhatsApp Business app, номер
"отдать боту целиком" никто не захочет. Настраивается через
`featureType: 'whatsapp_business_app_onboarding'` в конфиге ES. После онбординга
есть 24 часа на синхронизацию истории (иначе offboard и заново).

**Версии**: ES v2 умирает 15 октября 2026 — сразу делать **v4**.

## Наш статус как Tech Provider

- **Tech Provider** = онбордим клиентов сами, без кредитной линии. Каждый клиент
  привязывает СВОЮ карту к своему WABA и платит Meta напрямую — invoices.kz не
  несёт расходов на доставку сообщений вообще.
- Шаги (App Dashboard → WhatsApp use case → Tech Provider onboarding):
  1. ~~Business Verification~~ — **уже пройдена (2026-08-15)** ✓
  2. App Review на `whatsapp_business_messaging` + `whatsapp_business_management`
     (Advanced Access). На КАЖДОЕ разрешение — отдельное видео + отдельный текст
     (нельзя одно видео на два разрешения — авто-реджект). Видео #1: отправка
     сообщения из нашего приложения и получение его в клиенте WhatsApp. Видео #2:
     создание шаблона (можно показать через WhatsApp Manager, не обязательно свой
     UI). Средний срок ревью — **~24 часа**.
  3. Access Verification.
- **Лимит онбординга**: по умолчанию 10 новых клиентов за скользящие 7 дней;
  после BV + App Review + Access Verification автоматически поднимают до 200/нед.
- В dev-режиме всё тестируется без App Review (админы/тестеры приложения).
  Есть sandbox-аккаунты для теста самого ES-флоу (живут 30 дней).

## Экономика (per-message pricing, действует с 1 июля 2025)

- Входящие от клиентов: бесплатно всегда.
- **Наш сценарий** — бот отвечает обычным текстом на входящее сообщение → это
  «сервисное» не-шаблонное сообщение внутри 24-часового Customer Service Window
  (CSW открывается/продлевается каждым сообщением пользователя) → **сейчас
  бесплатно (с ноября 2024)**.
- ⚠️ **С 1 октября 2026 Meta начнёт брать per-message плату за сервисные
  сообщения** (анонс от 1 июля 2026). Ставки будут по стране получателя. Для нас:
  закладывать это в стоимость кредита AI-агента с самого начала, не строить
  экономику на «бесплатно навсегда».
- Вне 24-часового окна писать можно только платными шаблонами
  (marketing/utility/auth) — для Phase 1 бота НЕ нужно (мы только отвечаем).
- Free Entry Point: если клиент пришёл по Click-to-WhatsApp рекламе — 72 часа всё
  бесплатно.
- ⚠️ Проверить: «pricing policy for AI Providers» (действует с 16 февраля 2026,
  обновлена 12 мая 2026) — отдельная политика для AI-решений на платформе.
  Плюс Meta запустила своего «Meta Business Agent» (1 июля 2026, per-token с
  1 августа 2026) — прямой конкурент, но сторонние AI-решения остаются в
  категории сервисных сообщений.

## GitHub-референсы

- `WhatsApp/WhatsApp-Nodejs-SDK` (274⭐) — официальный Node SDK Cloud API
- `fbsamples/whatsapp-api-examples` (288⭐) — официальные примеры Meta
- `gokapso/whatsapp-cloud-inbox` (762⭐) — open-source inbox поверх Cloud API,
  хороший референс по webhook-обработке
- `Gaurang200/whatsapp-embedded-signup` (17⭐) — пример ES-интеграции
- Chatwoot (35.9k⭐) — тот же мультитенантный паттерн (ES + Cloud API), что и их
  Instagram-канал, который мы уже сверяли

## Набросок под наш код

- `ai_agent_channel_connections` уже готова к мультиканальности (`channel`):
  строки `channel='whatsapp'`, `external_account_id` = phone_number_id; понадобится
  доп. поле (или колонка) под `waba_id`.
- Новые роуты по образу Instagram-пары:
  - `GET /api/ai-agent/whatsapp/connect` — страница/редирект с ES (или Hosted ES URL)
  - `POST /api/ai-agent/whatsapp/callback` — приём `code` из JS SDK (тут POST от
    нашего же фронта, не redirect как в IG), обмен на токен, register, subscribed_apps,
    upsert подключения (шифрование тем же `AI_AGENT_ENCRYPTION_KEY`)
- Вебхук: `https://graph.facebook.com`-подпись тем же `X-Hub-Signature-256`;
  payload `entry[].changes[].value.messages[]` — маршрутизация по
  `metadata.phone_number_id` → подключение → `handleTenantIncoming` почти
  переиспользуется как есть (source='dm').
- Отправка: `POST https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>/messages`
  с `{ messaging_product: 'whatsapp', to, type: 'text', text: { body } }`.
- 24h-окно нам не мешает: бот ВСЕГДА отвечает на только что пришедшее сообщение,
  то есть всегда внутри окна — шаблоны для Phase 1 не нужны.

## Открытые вопросы (решить перед планом)

1. Тот же Meta app (1763701871429757) или отдельный? Склоняюсь к тому же:
   бизнес-портфолио уже верифицировано и привязано, App Review в одном месте.
   WhatsApp use case добавляется в существующее приложение.
2. JS SDK ES v4 или Hosted ES для первой версии? Hosted быстрее, но флоу не
   кастомизируется и уводит с нашего сайта.
3. Прочитать полностью «AI Providers pricing policy» до запуска.
4. Coexistence включать сразу (скорее да — это главный сценарий для КЗ) или
   начать с чистых номеров.
