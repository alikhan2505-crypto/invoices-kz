# Сценарии на WhatsApp/Instagram — Design

## Context

Пункт #3 согласованной очереди фич ("Делай все по порядку и качественно... Тарифы не трогай"), после доставленных «Заявок» и «Онлайн-каталога продавца». Визуальный конструктор сценариев (`FlowBuilder.tsx`, вкладка «Сценарии» в `/ai-agent/settings`, шипнут 2026-08-23) сейчас работает ТОЛЬКО на Telegram — данные (`ai_agent_flows`, `active_flow_id`/`active_step_id` на `ai_agent_conversations`) уже канало-независимы, но вся исполняющая логика (проверка триггеров, отправка шага с кнопками, разбор клика, invoice-шаг) целиком живёт в `telegramWebhookHandler.ts`/`telegram.ts` — в `whatsappWebhookHandler.ts` и `webhookHandler.ts` (Instagram) сценариев нет вообще, подтверждено чтением кода.

Реальное техническое ограничение, определяющее дизайн: у трёх каналов разные лимиты интерактивных кнопок — Telegram inline keyboard практически без ограничений (по кнопке на строку, как сейчас), WhatsApp Interactive Reply Buttons максимум 3 (List Message — до 10 пунктов), Instagram quick replies максимум 13.

## Решения из брейншторма

- **Одно определение сценария на все каналы**, с автоадаптацией отрисовки кнопок под конкретный канал — не отдельные ветки под каждый канал.
- **Стартовый сценарий (is_start)** на WhatsApp/Instagram запускается на самое первое сообщение клиента агенту (аналог того, как `/start` уже работает в Telegram — там нет команд).

## Архитектура: выносим общую логику, не копируем её трижды

Сейчас `telegramWebhookHandler.ts` содержит связанные друг с другом кусочки: `startTelegramFlow`, `handleTelegramFlowCallback` (разбор `callback_query`, включая защиту от клика по устаревшей клавиатуре через `btn:{stepId}:{index}`), `maybeExecuteInvoiceStep`. Всё это канало-независимо по сути — привязано к Telegram только через вызовы `sendTelegramFlowStep`/`sendTelegramBotMessage`/`answerTelegramCallbackQuery`.

Новый `src/lib/aiAgent/flowEngine.ts` берёт эту логику один раз, канало-агностично, по образцу уже существующего `channelSend.ts`'s `sendIntoConversation` (тот уже ветвится по `conversation.channel` для обычного текста):
- `startFlow(conversation, flow)` — отправляет первый шаг через новую общую `sendFlowStep(conversation, step)` (ветвится по каналу так же, как `sendIntoConversation`), обновляет `active_flow_id`/`active_step_id`, закрывает состояние если шаг терминальный.
- `resolveFlowButtonClick(definition, activeStepId, clickedStepId, buttonIndex)` — чистая функция (без I/O), переносится в `flow.ts` рядом с остальной чистой логикой сценариев: возвращает `'stale' | 'end' | { nextStep: FlowStep }`. Это ровно та логика, что сейчас инлайн внутри `handleTelegramFlowCallback` (строки 550-576) — извлекается без изменения поведения.
- `handleFlowButtonClick(conversation, clickedPayload)` — вызывает `resolveFlowButtonClick`, затем `sendFlowStep` для следующего шага. Общий для всех трёх каналов.
- `maybeExecuteInvoiceStep(conversation, step)` — переезжает из `telegramWebhookHandler.ts`, использует `sendIntoConversation` (уже канало-независимый) вместо прямого `sendTelegramBotMessage`.

`telegramWebhookHandler.ts` после рефакторинга просто вызывает `flowEngine`'s функции вместо своих собственных — поведение на Telegram не меняется, байт-в-байт то же самое (не считая имени модуля, откуда импортируется).

## Каждый канал даёт только две вещи

1. **Отправка шага в своём формате** — `sendFlowStep`'s Telegram/WhatsApp/Instagram-ветки:
   - Telegram: без изменений, `sendTelegramFlowStep` (по кнопке на строку).
   - WhatsApp (`src/lib/whatsapp.ts`, новая `sendWhatsAppFlowStep`): ≤3 кнопки → `interactive.type: 'button'` (Reply Buttons); 4-10 кнопок → `interactive.type: 'list'` (один section, до 10 rows); 0 кнопок → обычный текст (`sendWhatsAppMessage`). Интерактивные сообщения — sessions message, разрешены в том же 24-часовом окне без шаблонов, как обычный текст сейчас.
   - Instagram (`src/lib/instagram.ts`, новая `sendInstagramFlowStep`): ≤13 кнопок → нативные `quick_replies`; 0 кнопок → обычный текст (`sendDirectMessage`).
   - **Край случай, осознанно не блокирующий**: >10 кнопок на WhatsApp или >13 на Instagram — берём первые N, лишние логируем предупреждением. Реальным продавцам вряд ли когда-либо понадобится больше 10-13 вариантов в одном шаге; это защита от нерабочего сообщения, а не полноценный UX для такого случая.
2. **Разбор своего формата клика в общий payload** — каждый webhook-хендлер при получении входящего апдейта проверяет, не является ли это кликом по кнопке сценария, и если да — извлекает `btn:{stepId}:{index}` (тот же формат, что Telegram уже кладёт в `callback_data`) и передаёт в `flowEngine.handleFlowButtonClick` вместо обычной текстовой обработки:
   - WhatsApp: входящее сообщение `type === 'interactive'`, из `interactive.button_reply.id` (Reply Buttons) или `interactive.list_reply.id` (List Message) — это и есть наш `btn:...` id, потому что именно это значение мы сами туда положили при отправке.
   - Instagram: `messaging[].message.quick_reply.payload` — так же, наше собственное значение, положенное при отправке.

Один и тот же id-формат на всех трёх каналах — значит один и тот же разбор (`resolveFlowButtonClick`), включая уже проверенную в бою защиту от клика по устаревшей/уже прокрученной клавиатуре (Telegram и WhatsApp никогда не удаляют старые интерактивные сообщения из истории чата — та же проблема, что уже нашлась и была исправлена для Telegram, актуальна и здесь).

## Триггеры и приоритет — без изменений в порядке

WhatsApp/Instagram получают тот же приоритетный порядок, что уже есть в Telegram (`handleTelegramIncoming`): дедуп входящего → выход из активного сценария при свободном тексте вместо клика → пауза оператора → стоп-фраза → совпадение шаблона → совпадение триггера сценария (новый уровень, вставляется в то же место) → ИИ-ответ. Для is_start-сценария: в момент создания НОВОЙ строки `ai_agent_conversations` для этого канала (первое обращение клиента) — вместо ответа-приветствия по умолчанию, если у агента есть сценарий с `is_start=true`.

## Invoice-шаги работают на всех каналах бесплатно

`kind: 'invoice'`-шаги уже используют канало-независимую отправку счёта (`invoiceSend.ts`/`channelSend.ts`, «Счёт из чата», 2026-08-25) — как только `maybeExecuteInvoiceStep` переезжает в `flowEngine.ts` и зовёт `sendIntoConversation` вместо прямого Telegram-вызова, эта функциональность автоматически работает и на WhatsApp, и на Instagram без отдельной реализации.

## Конструктор (FlowBuilder.tsx)

Без новых экранов — сценарий по-прежнему создаётся один раз, работает на всех подключённых каналах агента. Добавляется только краткая поясняющая подсказка рядом с кнопками шага о том, что на WhatsApp/Instagram много кнопок автоматически превращаются в список/обрезаются — чтобы продавец не удивился разнице в виде на разных каналах.

## Вне рамок (осознанно)

- Разные ветки одного сценария под разные каналы.
- WhatsApp/Instagram-специфичные типы сообщений сверх кнопок (карусели, медиа-кнопки, list-message с описаниями/иконками на rows).
- Любые изменения самого формата `FlowDefinition`/`FlowStep` — используется как есть.

## Тестирование

`resolveFlowButtonClick` — чистая функция, юнит-тесты покрывают: точное совпадение (переход на следующий шаг), устаревший клик (не тот `stepId`), клик по несуществующей кнопке/индексу, кнопка с `nextStepId: null` («конец сценария»), dangling-ссылка на несуществующий шаг. Функции построения WhatsApp/Instagram-payload'ов (`buildWhatsAppFlowPayload`/`buildInstagramQuickReplies` или аналогично названные) — тоже чистые, тестируются на количестве кнопок 0/1/3/4/10/11/13/14 отдельно от сетевого вызова. Живая проверка: тестовый сценарий с 2, 5 и 15 кнопками на каждом из трёх реально подключённых каналов; invoice-шаг на WhatsApp и Instagram end-to-end.
