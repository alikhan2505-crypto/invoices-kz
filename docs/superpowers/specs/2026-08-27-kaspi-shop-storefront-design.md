# Онлайн-каталог продавца (витрина) — Design

## Context

Пункт #2 согласованной очереди фич ("Делай все по порядку и качественно... Тарифы не трогай"), после доставленной Kanban-воронки в «Заявках» AI-агента. Идея: дать продавцу с подключённым Kaspi Shop публичную страницу-витрину, на которую он может кидать ссылку в Instagram/WhatsApp, и принимать заказы напрямую — минуя комиссию и правила Kaspi Marketplace, оплата через уже существующий Kaspi Pay Кассир.

Ключевое техническое ограничение, определяющее архитектуру: у продавца в этом кодбейсе есть ДВА полностью независимых Kaspi-подключения под одним `user_id`:
- `kaspi_shop_connections` — Kaspi Shop Marketplace API, источник товаров (`kaspi_shop_tracked_products`, репрайсер).
- `kaspi_connections` — Kaspi Pay Кассир (см. `src/lib/kaspiPay/`), источник приёма оплаты.

Витрина связывает оба: товары берутся из первого, оплата — через второй. Оба должны быть активны, иначе витрину нельзя опубликовать.

## Решения из брейншторма

- **Цель**: публичная витрина для прямых продаж (не прайс-лист, не внутренний каталог для AI-агента).
- **Товары**: все `kaspi_shop_tracked_products` подключения с `enabled=true`, без фото/описаний в v1 — работаем на существующих данных как есть.
- **Оформление заказа**: клик «Купить» → форма имя+телефон+адрес → затем оплата (не голая оплата без формы, не переход в WhatsApp).
- **Заказы витрины**: отдельная новая страница, не вкладка в существующих `/kaspi-shop/orders` (те — заказы с Kaspi Marketplace, другой источник данных).
- **URL**: продавец сам задаёт slug (`invoices.kz/shop/{slug}`), не авто-ID.

## Данные

Новые колонки на `kaspi_shop_connections`:
```sql
alter table kaspi_shop_connections
  add column storefront_slug text unique,
  add column storefront_published boolean not null default false;
```
Привязка к конкретному `connection_id`, а не к «активному» в свитчере мультистора — чтобы опубликованная ссылка не ломалась, если продавец переключит активный магазин для других целей (репрайсер и т.д.).

Товары на витрине = `kaspi_shop_tracked_products` этого `connection_id` где `enabled=true` **и** `stock_count > 0` (или `stock_count is null` — трактуем как "не отслеживается, считаем доступным", т.к. не все товары обязаны иметь заполненный сток). Кончившийся товар не показываем — не хотим принимать оплату за то, чего нет.

Новая таблица заказов витрины:
```sql
create table kaspi_shop_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references kaspi_shop_connections(id) on delete cascade,
  tracked_product_id uuid references kaspi_shop_tracked_products(id) on delete set null,
  product_name text not null,
  price numeric not null,
  buyer_name text not null,
  buyer_phone text not null,
  buyer_address text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'expired')),
  created_at timestamptz not null default now()
);
create index kaspi_shop_orders_connection_id_idx on kaspi_shop_orders(connection_id);
```
`product_name`/`price` — снимок на момент заказа (продавец мог поменять цену после того, как покупатель уже начал оформление; заказ должен остаться с той ценой, что видел покупатель). `tracked_product_id` — мягкая ссылка, только для отображения в списке заказов какой именно товар это был (может стать `null`, если товар потом удалили из отслеживания — заказ всё равно остаётся читаемым по `product_name`/`price`).

Новая nullable колонка на существующей `kaspi_payment_requests`, по образцу уже существующей `invoice_id`:
```sql
alter table kaspi_payment_requests add column shop_order_id uuid references kaspi_shop_orders(id);
```

## Оплата — расширение существующего механизма, не форк

`src/lib/kaspiPay/settlePayment.ts`'s `checkAndSettleKaspiPayment` уже параметризована через `SettleableRequest` и уже умеет ветвиться по `invoice_id` (помечает счёт оплаченным, если он задан). Добавляется параллельная ветка:
```ts
if (reqRow.shop_order_id) {
  await supabase.from('kaspi_shop_orders').update({ status: 'paid' }).eq('id', reqRow.shop_order_id)
}
```
`SettleableRequest` получает `shop_order_id: string | null`. Всё остальное — атомарный claim, списание комиссии, вебхук — остаётся общим для обоих видов оплаты (счета и заказы витрины), как и задумано изначально этим кодом (комиссия уже явно описана как «применяется одинаково хоть для счёта, хоть для внешнего API»).

Новый `src/lib/kaspiPay/shopOrderPayment.ts` с `getOrCreateKaspiPaymentForShopOrder(order)` — по образцу `getOrCreateKaspiPaymentForInvoice` (`invoicePayment.ts`): ищет существующий live `pending`-платёж по `shop_order_id`, иначе минтит новый через `createPayment(connection, {amount, orderId: order.id})`, где `connection` грузится через `loadConnectionByUserId(sellerUserId)` (Kaspi Pay Кассир продавца, НЕ Kaspi Shop подключение). Тот же rate-limit на минтинг (публичный путь — как и `/view/[token]`), та же проверка баланса кошелька на комиссию перед минтингом нового платежа.

## Публичная страница `/shop/[slug]`

Новый top-level публичный route (как `/view/[token]`, `/invoice/[id]` — не под `/kaspi-shop`, тот раздел админ-гейтед и требует логина). `GET /api/shop/[slug]` резолвит slug → `connection_id` (только если `storefront_published=true`, иначе 404) → отдаёт список товаров.

Карточка товара: название, бренд, цена. Клик «Купить» открывает модалку с формой (имя, телефон, адрес) → `POST /api/shop/[slug]/order` создаёт `kaspi_shop_orders` (status `pending_payment`) и сразу вызывает `getOrCreateKaspiPaymentForShopOrder` → возвращает QR/ссылку. Страница поллит `GET /api/shop/[slug]/order-status?orderId=...` каждые 5с (тот же паттерн живого поллинга, что на `/view/[token]`, без cron-задержки) — как только `status='paid'`, показываем «Заказ оплачен, продавец с вами свяжется».

## Продавцу

- Новая `/kaspi-shop/storefront` — тумблер публикации, поле slug (проверка уникальности при сохранении), готовая публичная ссылка с кнопкой «Скопировать». Если Kaspi Pay Кассир не подключён (`kaspi_connections` нет активного) — вместо тумблера понятная подсказка со ссылкой на `/profile/kaspi-pay`. Публикация недоступна (тумблер задизейблен), пока оба подключения не активны.
- Новая `/kaspi-shop/storefront-orders` («Заказы витрины») — список заказов этого продавца по всем его подключениям: товар, покупатель (имя/телефон/адрес), цена, статус оплаты, дата. Только чтение в v1 — без смены статуса вручную (доставка/отмена вне рамок).
- Обе страницы — в существующем nav-разделе Kaspi Shop (`SiteNav.tsx`), тот же `adminOnly`-гейт, что весь раздел сейчас.

## Вне рамок v1 (осознанно)

- Фото и текстовые описания товаров — нет колонки в БД, ручная загрузка не строится сейчас.
- Отдельный выбор «что показывать на витрине» вне поля `enabled` (которое уже используется для репрайсера — совмещение осознанное для v1).
- Статусы после оплаты (доставлено/отменено), любая логистика.
- Несколько витрин на одно подключение, кастомизация темы/дизайна витрины.
- Уведомление продавцу о новом заказе (email/Telegram) — в v1 продавец сам заходит на «Заказы витрины».

## Тестирование

Новая чистая логика: резолв slug → доступные товары (фильтр `enabled && (stock_count > 0 || stock_count is null)`) — пишем как чистую функцию с unit-тестами. `getOrCreateKaspiPaymentForShopOrder` копирует уже проверенную структуру `getOrCreateKaspiPaymentForInvoice` (rate-limit, wallet-проверка, race на insert) — тестируем аналогично существующим тестам этого модуля, если они есть, иначе ручная проверка по той же схеме, что уже применялась к оригиналу. Ручная живая проверка: опубликовать витрину → открыть публичную ссылку в приватном окне → оформить тестовый заказ → оплатить реальным Kaspi Pay → убедиться, что заказ появился в «Заказы витрины» со статусом `paid`.
