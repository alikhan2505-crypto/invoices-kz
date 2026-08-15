# AI-агент — мульти-тенантный ИИ-ассистент для чатов клиентов — Design

**Status:** approved section-by-section with the user in live dialogue (2026-08-15), each section confirmed before moving to the next. This doc captures the full architecture for both channels; only Instagram gets an implementation plan right away (see Scope below).

## Обзор

Новый платный подпродукт invoices.kz: каждый пользователь подключает свой Instagram (позже — WhatsApp), настраивает своего ИИ-агента (тон, описание бизнеса, цель), и агент сам отвечает его клиентам в переписке — без участия invoices.kz. Прямой аналог MoonAI (mooonai.com), но встроенный в уже существующий продукт и переиспользующий его инфраструктуру (Telegram-уведомления, Kaspi Pay для пополнения кошелька, уже написанный Instagram-бот).

**Почему не просто "улучшить наш внутренний IG-бот":** текущий `src/lib/instagram.ts`/`instagramAiReply.ts` — single-tenant, обслуживает только собственный аккаунт invoices.kz через один статичный `INSTAGRAM_ACCESS_TOKEN` и присылает черновики админу в Telegram. Эта фича превращает то же ядро в мульти-тенантный продукт: свой агент и свой кошелёк на каждого клиента.

## Область применения и порядок сборки

Один дизайн — оба канала (Instagram, WhatsApp) делят одно ядро: конфиг агента, кошелёк, диалоговый движок, режим обучения. Отличается только OAuth-подключение и способ отправки/приёма сообщений на каждый канал.

**Реализация — двумя последовательными планами:**
1. **Phase 1 (план пишется сейчас): Instagram end-to-end**, до реальной оплачивающей аудитории. Переиспользует ~70% уже написанного кода (вебхук, шаблоны, генерация ИИ-ответа).
2. **Phase 2 (план — позже, после того как Phase 1 живёт): WhatsApp** поверх того же ядра (`ai_agents`, кошелёк, диалоговый движок не меняются — добавляется новый тип канала).

Это не откладывание WhatsApp "на потом без даты" — просто не блокируем первую живую версию продукта тяжёлым внешним согласованием обоих каналов одновременно (см. раздел про внешние риски).

## Архитектура данных

Новые таблицы, отдельные от существующих `instagram_*` (те остаются как есть — single-tenant бот для собственного аккаунта invoices.kz продолжает работать независимо) и от обоих существующих кошельков (`kaspi_shop_wallet`, `profiles.kaspi_wallet_balance`) — третий, отдельный кошелёк, тот же принцип "не смешивать разные по природе списания", что уже применён в проекте дважды.

```sql
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) unique, -- v1: один агент на пользователя
  name text not null default 'Ассистент',
  tone text not null default 'friendly', -- friendly | professional | energetic | caring
  business_description text not null default '',
  goal text not null default 'answer_questions', -- answer_questions | qualify_lead
  collect_name boolean not null default true,
  collect_phone boolean not null default true,
  status text not null default 'training', -- training | active | paused
  training_started_at timestamptz not null default now(),
  training_message_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table ai_agent_channel_connections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  channel text not null, -- 'instagram' | 'whatsapp' (только 'instagram' в Phase 1)
  external_account_id text not null,
  external_account_name text,
  access_token_enc text not null, -- шифруется тем же decryptAtRest/encryptAtRest, что уже используется в kaspiPay/kaspiShop
  status text not null default 'active', -- active | token_expired
  connected_at timestamptz not null default now(),
  unique (channel, external_account_id)
);

create table ai_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  channel text not null,
  external_thread_id text not null, -- id отправителя в IG для DM, id ветки комментария для comment
  customer_handle text,
  collected_name text,
  collected_phone text,
  created_at timestamptz not null default now(),
  unique (agent_id, channel, external_thread_id)
);

create table ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_agent_conversations(id) on delete cascade,
  direction text not null, -- inbound | outbound
  text text not null,
  is_ai_generated boolean not null default false, -- false = сработал шаблон (бесплатно)
  status text not null default 'sent', -- sent | pending_review | skipped
  urgent boolean not null default false,
  created_at timestamptz not null default now()
);

create table ai_agent_wallet (
  user_id uuid primary key references auth.users(id),
  balance_credits integer not null default 0
);
create table ai_agent_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  delta_credits integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create table ai_agent_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  topup_id text not null unique,
  amount_tenge numeric not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
```

`instagram_reply_templates`-подобная таблица шаблонов не переиспользуется как есть (та привязана к единственному аккаунту invoices.kz) — под каждого агента заводится собственный список шаблонов, конкретная схема (`ai_agent_reply_templates`, `agent_id`/`trigger_words`/`reply_text`/`channel`) уточняется в плане по образцу уже существующей таблицы.

## Настройка агента (онбординг)

Один экран, не визард — название компании подставляется из уже известных `profiles`/реквизитов, дальше: тон (пресеты), свободный текст "о бизнесе" (единственный источник знаний в v1 — без загрузки документов, YAGNI), цель (ответить на вопросы / квалифицировать заявку), чекбоксы что собирать у клиента (имя, телефон). Дальше — кнопка "Подключить Instagram".

## Instagram OAuth (мульти-тенантный коннект)

Сегодня: один статичный `INSTAGRAM_ACCESS_TOKEN`, приложение "Не опубликовано". Для мульти-тенантности нужен настоящий OAuth (Instagram Business Login): клиент жмёт "Подключить", авторизует свой аккаунт, мы получаем токен на его аккаунт и сохраняем в `ai_agent_channel_connections`.

**Внешний риск, не зависящий от нас:** чтобы это работало для любого клиента (не только вручную добавленных), приложение должно быть опубликовано и пройти Meta App Review на `instagram_business_manage_messages`/`instagram_business_manage_comments` — тот же класс риска, что и продакшн-одобрение BCC ([[bcc-connect-v2-invoices-kz]]): срок вне нашего контроля, обычно дни-недели, требует скринкаст сценария и политику конфиденциальности.

**Смягчение:** пока ревью не пройдено, первых клиентов можно подключать вручную как "тестировщиков" в кабинете Meta (ровно так уже работает текущий однотенантный бот) — не нужно ждать полного одобрения, чтобы обкатать продукт на первых платящих.

## Диалоговый движок

`generateAiReply` (`src/lib/instagramAiReply.ts`) получает новый обязательный параметр `businessContext: { name, tone, description, goal }` вместо хардкода на строке 47 ("invoices.kz — сервис для выставления счетов"). Это добавление параметра, не переписывание функции: единственный существующий вызов (`src/app/api/instagram/webhook/route.ts`, собственный однотенантный бот) обновляется передавать ровно тот же текст, что сейчас зашит внутри — поведение старого бота не меняется ни на символ. Новый мульти-тенантный вебхук — второй вызывающий, передающий контекст из `ai_agents` конкретного клиента. Остальная механика функции (source: comment/dm, история переписки для DM, короткие ответы в комментариях, определение языка, urgent-флаг) не трогается — она уже канало- и клиенто-агностична по своей сути.

**Один и тот же вебхук на оба сценария, не два разных.** Meta регистрирует ровно один callback URL на приложение для объекта "instagram" — события всех подключённых через это приложение аккаунтов (и старый однотенантный, и новые клиентские) приходят на один и тот же `src/app/api/instagram/webhook/route.ts`. Различаются по `entry.id` из тела вебхука (id аккаунта, на котором произошло событие): совпадает с `INSTAGRAM_BUSINESS_ACCOUNT_ID` → старый путь без изменений; иначе — ищем `ai_agent_channel_connections` по `external_account_id = entry.id`, находим агента → шаблон агента (мгновенно, бесплатно) → нет совпадения → `generateAiReply` с контекстом агента. Дедуп повторной доставки того же события от Meta — по `external_id`, тем же принципом, что уже есть у `instagram_auto_replies` (для новой мульти-тенантной таблицы это отдельная колонка `ai_agent_messages.external_id` с частичным уникальным индексом, добавлена вместе с остальными таблицами).

## Режим обучения → авто

Новый агент стартует в `status: 'training'` (первые 7 дней или 20 диалогов — что раньше). Черновик ИИ-ответа в этом режиме не отправляется сразу, а сохраняется как `ai_agent_messages.status = 'pending_review'` и появляется на новой странице **"Диалоги на проверке"** в разделе AI-агента — обычное текстовое редактирование, кнопки Отправить/Править/Пропустить. Если у пользователя уже подключены Telegram-уведомления (`profiles.telegram_chat_id`/`notify_telegram`) — дополнительно уходит лёгкий пуш через уже существующий `sendTelegramNotification` ("у вас N черновиков на проверке", ссылка на страницу) — не полноценный флоу с инлайн-кнопками, только уведомление. Telegram не обязателен для запуска агента.

По истечении порога `status` агента переключается на `'active'` — дальше черновики уходят клиенту напрямую, без остановки на проверку. Страница "Диалоги на проверке" после этого показывает только историю (переиспользуется как постоянный дневник переписки — аналог "Диалоги" у MoonAI).

## Кошелёк и биллинг

Отдельный `ai_agent_wallet`, пополнение через тот же платёжный путь, что уже работает для Kaspi Shop Wallet (`loadPlatformConnection`/`createPayment`/`checkStatus`). Списание — только за реально сгенерированный ИИ-ответ (`is_ai_generated = true`), совпадение по шаблону бесплатно, ровно как шаблоны в текущем IG-боте не требуют вызова Anthropic. Курс в кредитах — по аналогии с Kaspi Shop (1 кредит = 5 ₸), точная стоимость одного ИИ-ответа в кредитах считается в плане реализации от реальной цены токенов Haiku за среднее сообщение + запас.

## Место в продукте

Новый пункт верхнего меню — **"AI-агент"**, по аналогии с "Kaspi Магазин": свой онбординг, настройки, кошелёк, "Диалоги на проверке"/история. Не прячется в Профиль — отдельный платный подпродукт, а не настройка существующего.

## Обработка ошибок

Протухший токен клиента (Meta отвечает 401) — `ai_agent_channel_connections.status = 'token_expired'`, баннер в UI "переподключите Instagram", тот же паттерн `sessionExpired`, что уже используется в Kaspi Shop (`markSessionExpired`-подобный helper). Вебхук отвечает Meta мгновенно (200) и обрабатывает сообщение асинхронно — чтобы не словить таймаут-ретрай от Meta на медленном ИИ-вызове.

## Phase 3 (зафиксировано на будущее, не в этом плане): Счета из диалога

Настоящий отрыв от MoonAI — тот сам может только кинуть общую ссылку на оплату Kaspi, а этот агент живёт внутри invoices.kz и может выставить настоящий документ. Два разных по весу куска, оба намеренно не входят в план Phase 1 (Instagram), чтобы не раздувать его:

- **Цена товара из Kaspi Shop (дешёвая часть).** Если у пользователя есть подключённый Kaspi Shop, агент при ответе на вопрос о цене смотрит реальную цену из `kaspi_shop_tracked_products` вместо того, чтобы полагаться только на свободный текст `business_description`. Не требует новой инфраструктуры — просто ещё один источник контекста для `generateAiReply`, читается тем же Supabase-клиентом. Кандидат на то, чтобы войти сразу следом за Phase 1, до WhatsApp.
- **Выставление счёта и накладной прямо в переписке (тяжёлая часть).** Агент распознаёт намерение купить, собирает позиции/сумму из диалога, создаёт настоящий счёт через существующую логику `invoices` на клиента, собранного из `ai_agent_conversations.collected_name`/`collected_phone`, присылает оплату через уже работающий Kaspi Pay. Накладная — по факту оплаты/доставки, отдельным шагом, не в момент выставления счёта (данные по составу и количеству товара в свободной переписке не всегда структурированы настолько, чтобы автоматически закрыть сделку документом без проверки продавцом). Требует отдельного дизайна (как агент извлекает позиции/сумму из неструктурированного текста, что делать при неполных данных, как это встраивается в уже существующий флоу счёта) — не проектируется в деталях сейчас, чтобы не решать это до того, как будет видно, как реально ведут себя диалоги в Phase 1.

## Тестирование

Чистые функции — Vitest, по конвенции проекта: сборка системного промпта из полей агента, расчёт списания с кошелька, логика перехода training→active по порогу. Вебхук-роуты, OAuth-обмен токена, страницы — без тестов, как и everywhere в этом кодбейсе (`generateAiReply`/`sendTelegramNotification` тоже намеренно не тестируются — живой сетевой вызов к платному API).

## Global Constraints

- v1: один агент на пользователя (`ai_agents.user_id unique`) — без мульти-агентов.
- Единственный источник знаний агента в v1 — свободный текст `business_description`, без загрузки файлов/RAG.
- Списание кошелька — только за реальный ИИ-вызов, не за срабатывание шаблона.
- Training-режим не требует Telegram — это опциональный бонус-пуш, не блокер запуска.
- Phase 1 (этот план) — только Instagram. WhatsApp — отдельный план после того, как Phase 1 живёт на реальных клиентах.
- Phase 1 не создаёт счета/накладные и не читает Kaspi Shop — это Phase 3, отдельный дизайн после того, как видно, как реально ведут себя диалоги на живых клиентах.
- Существующий single-tenant `instagram_*`/`instagramAiReply.ts` бот для собственного аккаунта invoices.kz не трогается и не выводится из строя — новая мульти-тенантная механика строится рядом, переиспользуя общие куски (`generateAiReply`'s core logic, `sendTelegramNotification`), а не заменяя старое.
