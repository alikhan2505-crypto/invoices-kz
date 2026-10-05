# CTWA + Meta CAPI — Design

## Context

Пункт #6 согласованной очереди фич (27.08.2026), деприоритизирован 28.08 ("я думаю сейчас для запуска этого нам не надо") ради готовности к запуску, возобновлён по просьбе основателя 05.10.2026. Два форка были решены ещё в брейншторме 28.08: это клиентская фича (продавец подключает свой рекламный кабинет Meta к своему WhatsApp-каналу AI-агента), и MVP шлёт только одно событие "Lead" при создании Заявки, без настраиваемой карты статусов. Третий, последний открытый вопрос — как продавец передаёт доступ к CAPI — решён в этой сессии: **вручную, Pixel ID + токен доступа**, вставляются полями в настройках (не OAuth), чтобы не заводить ещё одну заявку на Meta App Review поверх уже стоящей в очереди (Instagram App Review всё ещё не подана).

Актуальность усилена изменением тарифов WhatsApp Business с 1 октября 2026: сервисные сообщения внутри 24-часового окна стали платными сверх 1000 бесплатных в месяц (на номер продавца), тогда как разговоры, начатые по клику на рекламу Click-to-WhatsApp (CTWA), получают 72 часа полностью бесплатно. Это НЕ меняет архитектуру фичи, но подтверждает её ценность: для продавца становится ещё важнее понимать, какие переписки пришли из рекламы.

## Что такое «Заявка» (напоминание, уже так устроено)

Отдельной таблицы лидов нет — Заявка это строка `ai_agent_conversations` с `lead_status`, "каждая переписка — заявка с первого сообщения" (дизайн 27.08). У каждого канала уже есть атомарный захват первого сообщения (`start_flow_triggered` false→true, `whatsappWebhookHandler.ts:210-212`) — это уже проверенный, без гонки сигнал "это новая Заявка", и именно сюда подвешивается CAPI-событие, без нового отдельного механизма.

## Решения из брейншторма

- **Кто подключает:** продавец сам, через свой собственный Meta Pixel ID + системный токен доступа — ручной ввод в настройках агента, не OAuth.
- **Что шлём:** ровно одно событие `Lead` на первое сообщение WhatsApp-переписки, у которой есть `ctwa_clid` (значит пришла по клику на рекламу). Никакой карты "статус Заявки → событие Meta" в v1.
- **Только WhatsApp.** У Instagram есть похожий механизм (Click-to-Instagram-ads), но вне рамок v1 — закрытое решение брейншторма касалось именно WhatsApp-канала.

## Откуда берётся `ctwa_clid`

Когда клиент кликает по рекламе Click-to-WhatsApp и пишет первое сообщение, Meta добавляет объект `referral` в это (и только это) входящее сообщение вебхука — `source_id`, `source_type`, `source_url`, `ctwa_clid`. Сейчас `src/app/api/whatsapp/webhook/route.ts`'s `WhatsAppValue.messages[]` вообще не описывает это поле — просто теряется. Нужно:
1. Добавить `referral?: { source_id?: string; source_type?: string; source_url?: string; ctwa_clid?: string }` в тип `messages[]`.
2. Прокинуть `msg.referral?.ctwa_clid` в `handleWhatsAppIncoming` новым опциональным параметром `ctwaClid`.
3. Сохранить его на саму Заявку — новая колонка `ai_agent_conversations.ctwa_clid text`, пишется **только** при первом сообщении (отдельным `update` сразу после уже существующего атомарного захвата `isFirstMessage`, не через общий `upsert` — чтобы второе/третье сообщение той же переписки без `referral` никогда не затёрло уже сохранённое значение).

## Данные

```sql
alter table ai_agents add column meta_pixel_id text;
alter table ai_agents add column meta_capi_token_enc text;
alter table ai_agent_conversations add column ctwa_clid text;
```

`meta_capi_token_enc` — тот же `encryptAtRest`/`getKey()` приём, что уже используют WhatsApp/Instagram/Telegram-токены (`src/lib/aiAgent/connection.ts`), но **свой собственный ключ** `META_CAPI_ENCRYPTION_KEY` — явно заявленная конвенция этой кодовой базы: один ключ шифрования на функциональную область, не общий на все фичи (см. тот же файл). Pixel ID не секрет (он виден в любом месте, куда продавец вставляет Meta Pixel на сайте) — хранится открытым текстом.

## Отправка события

Новый чистый модуль `src/lib/aiAgent/metaCapi.ts`:
- `buildLeadEventPayload(ctwaClid: string, eventTimeUnix: number): object` — чистая функция, собирает тело запроса один в один по официальной схеме Meta (проверено по актуальной документации 05.10.2026, НЕ придумано):
  ```json
  {
    "data": [{
      "event_name": "Lead",
      "event_time": 1234567890,
      "action_source": "business_messaging",
      "messaging_channel": "whatsapp",
      "user_data": { "ctwa_clid": "..." }
    }]
  }
  ```
  `event_name: "Lead"` — стандартное имя события Meta, подтверждено реальными рабочими примерами интеграций именно с `action_source: "business_messaging"`. (`"LeadSubmitted"` — это другое, отдельное имя для автоматических Meta-side «lead gen flows» внутри WhatsApp Flows, не то, что строим мы.) `user_data` в v1 — только `ctwa_clid`, без хэшированных телефона/почты: именно `ctwa_clid` и есть реальный ключ атрибуции для CTWA, остальное добавило бы сложность без выигрыша для MVP с одним событием.
- `sendLeadEvent(pixelId: string, accessToken: string, ctwaClid: string): Promise<void>` — `POST https://graph.facebook.com/v21.0/{pixelId}/events`, `access_token` в теле запроса (тот же приём, что уже используют все вызовы Graph API в этой кодовой базе — `src/lib/instagram.ts`'s `createContainer`), не в заголовке. Кидает `MetaCapiError` при не-200, которую вызывающий код перехватывает и логирует — ровно тот же приём отказоустойчивости, что уже у `debitAiAgentWallet`/`sendTelegramNotification`-вызовов в том же `whatsappWebhookHandler.ts`: ошибка CAPI никогда не должна сорвать доставку ответа клиенту.

## Точка вызова

В `handleWhatsAppIncoming` (`whatsappWebhookHandler.ts`), сразу после существующего атомарного захвата `isFirstMessage` (строка ~212) и после того, как `ctwa_clid` сохранён на Заявку:

```ts
if (isFirstMessage && params.ctwaClid && agent.meta_pixel_id && agent.meta_capi_token_enc) {
  try {
    const token = decryptAtRest(agent.meta_capi_token_enc, getMetaCapiKey())
    await sendLeadEvent(agent.meta_pixel_id, token, params.ctwaClid)
  } catch (capiErr: any) {
    console.error('ai-agent whatsapp: Meta CAPI Lead event failed for', params.externalId, ':', capiErr.message)
  }
}
```

`agent` уже загружен целиком (`select('*')`) в начале функции — новые колонки доступны без лишнего запроса.

## Настройки — подключение Pixel ID + токена

Новая карточка на `/ai-agent/settings`, рядом с существующими карточками каналов (не внутри грида «Каналы» — это не канал доставки сообщений, а отдельная интеграция аналитики, своя секция «Реклама»).

- `POST /api/ai-agent/meta-capi/connect` — тело `{agentId, pixelId, accessToken}`, валидирует непустые строки, шифрует токен, пишет оба поля на `ai_agents`. Тот же `requireUser`+`isAdmin`-паттерн, что у `whatsapp/callback/route.ts`.
- `DELETE /api/ai-agent/meta-capi/connect` — тело `{agentId}`, обнуляет оба поля (`null`).
- UI: два текстовых поля (Pixel ID; Access Token — `type="password"`, как банковские реквизиты), кнопка «Сохранить», статус-чип «Подключено»/«Не подключено» по наличию `meta_pixel_id`. Короткая поясняющая строка под формой: где взять Pixel ID и токен (Meta Events Manager → источники данных → ваш Pixel → Настройки → Генерировать токен доступа).

## Вне рамок v1 (осознанно)

- Instagram CTWA (Click-to-Instagram-ads) — только WhatsApp.
- Настраиваемая карта «статус Заявки → событие Meta» — всегда ровно одно событие `Lead` на первое сообщение.
- Хэшированные `ph`/`em` в `user_data` — не нужны для атрибуции по `ctwa_clid`.
- OAuth-подключение рекламного кабинета — явно отклонено в пользу ручного ввода, чтобы не создавать новую зависимость от Meta App Review.
- Повторная отправка события при неудаче (ретраи) — одна попытка, ошибка молча логируется, не блокирует ответ клиенту.
- Показ факта «эта Заявка пришла из рекламы» в самом интерфейсе Заявок/Переписки — `ctwa_clid` сохраняется в БД, но UI для него не делаем в v1 (это чисто бэкенд-атрибуция для самого Meta Ads Manager продавца).

## Тестирование

Новая чистая логика: `buildLeadEventPayload` — юнит-тест на точную форму JSON (включая `action_source`/`messaging_channel`, не только наличие полей). `sendLeadEvent` — не юнит-тестируется напрямую (сетевой вызов), как и остальные подобные функции в этой кодовой базе (`sendWhatsAppMessage` и т.п.) — проверяется живым вызовом. Живая проверка: настоящая реклама Click-to-WhatsApp недоступна для тестового прогона — проверяем отправкой synthetic-вебхука с `referral.ctwa_clid` на `/api/whatsapp/webhook` (подписанного настоящим `WHATSAPP_APP_SECRET`) на тестовый номер с подключенным Pixel ID + тестовым токеном, подтверждаем через Meta Events Manager → Test Events, что событие `Lead` дошло с правильным `ctwa_clid`.
