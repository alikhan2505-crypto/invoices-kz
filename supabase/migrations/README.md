# Миграции базы

Миграции применяются через Supabase и в этом репозитории целиком не хранятся —
здесь записано только то, что важно знать, читая код приложения, и что иначе
существует лишь внутри панели Supabase.

## Лимит счетов в месяц — проверяется в базе, а не только в браузере

`enforce_invoice_limit_trigger` (BEFORE INSERT на `public.invoices`) плюс
функция `public.invoice_limit_for(uuid)`.

До 11.09.2026 лимит жил только в браузере: `src/app/create/page.tsx` сравнивал
число счетов за месяц с `getActivePlan().invoiceLimit`. Любой, у кого есть
своя сессия, мог вставлять счета прямо через API мимо этой проверки — RLS
такое разрешает, ведь вставлять собственные строки и есть то, что она
позволяет.

**`invoice_limit_for` — зеркало `getActivePlan()` из `src/lib/plan.ts`.
Менять их можно только вместе.** Правил мало и они меняются редко, поэтому
дублирование выбрано осознанно: альтернативой было провести создание счёта
через серверный маршрут — куда большая переделка ради того же результата.

Значения: Pro — без ограничения (`null`), Базовый и бонусные дни — 30,
пробный период — 10, бесплатный — 3. Истёкший платный план проваливается к
бесплатному, как и в коде.

Две тонкости, повторяющие поведение браузера:

- месяц считается **по времени Алматы**, не по UTC — иначе в первые часы
  нового месяца база расходилась бы с тем, что видит пользователь;
- **аннулированные счета учитываются**: если бы отмена освобождала место,
  ограничение стало бы формальностью.

Пропускаются мимо проверки служебная роль (крон повторяющихся счетов,
админские инструменты) и администраторы — так же, как в триггере
`protect_profile_privileged_columns`. Закрывалась именно браузерная дыра.

Ошибка приходит текстом `invoice_limit_reached: N of M this month`;
`/create` (и «Дублировать» в `/invoice/[id]`) ловит её и показывает то же
сообщение, что и собственная проверка. Браузерная сторона живёт в
`src/lib/invoiceLimit.ts` (`invoiceLimitWindow`, `checkInvoiceLimit`, `almatyMonthStart`).

`invoice_limit_pin_created_at.sql` (14.10.2026, применена основателем через SQL Editor 14.10, проверена вживую) — для
обычной сессии `created_at` на INSERT принудительно `now()`, а на UPDATE не
меняется: иначе счёт с датой задним числом выпадал из окна месяца и лимит
обходился прямым запросом. Там же `pg_advisory_xact_lock` по `user_id` перед
подсчётом — иначе пачка параллельных INSERT при «2 из 3» проходила целиком.

`invoice_limit_fair_windows.sql` (14.10.2026, применена основателем через SQL Editor 14.10) — окно
подсчёта больше не всегда «с 1-го числа». Новая функция
`public.invoice_limit_window(uuid)` возвращает лимит, начало окна и вид тарифа;
`invoice_limit_for` и триггер берут всё из неё. Браузерное зеркало —
`invoiceLimitWindow()` в `src/lib/invoiceLimit.ts`, **менять только вместе**:

- пробный — 10 счетов с начала пробного периода (`trial_expires_at − 7 суток`,
  начало нигде не хранится; так его выдаёт `/api/onboarding/grant`), а не за
  календарный месяц — раньше неделя на стыке месяцев давала до 20;
- бесплатный — 3 с `max(1-е число по Алматы, конец последнего
  пробного/бонусного/платного периода)`: счета, сделанные на большем тарифе,
  больше не съедают бесплатные 3;
- Базовый и бонусные дни — 30 за календарный месяц, Про — без лимита (как было).

`plan_expires_at`, `bonus_expires_at`, `invoices.created_at` — timestamp
without time zone в UTC; функция переводит их явно (`AT TIME ZONE 'UTC'`), а
браузер читает такие строки как UTC через `parseDbTimestamp()` из
`src/lib/plan.ts` (раньше — как местное время устройства, в Алматы на 5 часов
раньше базы).

Порядок выкладки: **сначала выполнить SQL, потом деплой кода.** Если код уйдёт
раньше, браузер после пробного периода покажет свободное место, которое старый
триггер ещё не даст — человек увидит обычное окно «лимит исчерпан» (ловится
`isInvoiceLimitError`), а не ошибку Postgres, но это всё равно расхождение.
На 14.10 по живым данным ни одного пользователя, у которого результат
поменялся бы, нет.

## Сайты салонов красоты

`salon_sites` и `salon_site_variants` — DDL лежит рядом, в
`supabase/migrations/salon_sites.sql`: его нужно один раз выполнить в SQL-
редакторе Supabase. Это исключение из правила выше — таблицы новые, и без
текста запроса воспроизвести их негде.

Обе таблицы с включённой RLS и **без единой политики**: обычная пользовательская
сессия не читает оттуда ничего. Весь доступ идёт через служебную роль в
маршрутах `/api/salon-sites/*`, которые проверяют `profiles.is_admin`.

`published_html` — снимок выбранного варианта на момент публикации, а не ссылка
на строку варианта: перегенерация черновика не должна менять то, что уже видят
клиенты салона.

## Планировщик записей салона + вход через Telegram QR

`supabase/migrations/planner_login.sql` и `supabase/migrations/salon_planner.sql`
— то же исключение из правила выше, DDL лежит рядом. Применены через Supabase
MCP 18.09.2026.

`planner_login.sql` добавляет `salon_sites.owner_profile_id` (кто распознаётся
владельцем при сканировании QR) и таблицу `planner_sessions` (одноразовые
коды входа с TTL 5 минут — `expires_at` в прошлом читается на лету как
истёкший код, отдельного статуса и уборщика для этого нет).

`salon_planner.sql` добавляет `ai_agents.salon_site_id` (какой агент отвечает
за какой салон), `salon_bookings` (сами брони) и `ai_agent_booking_drafts`
(черновики от ИИ на подтверждение владельцем — по образцу уже существующих
`ai_agent_invoice_drafts`).

Все три новые таблицы — RLS включён, **без единой политики**, тот же fail-closed
паттерн, что у `salon_sites`: весь доступ только через служебную роль в новых
маршрутах `/api/planner/*`, которые сами проверяют куку планировщика
(`src/lib/plannerAuth.ts`), а не сессию Supabase.

`ctwa_meta_capi.sql` (05.10.2026) добавляет `ai_agents.meta_pixel_id` и
`ai_agents.meta_capi_token_enc` (вручную вставленные Pixel ID + токен для
Meta Conversions API, токен шифруется своим собственным ключом
`META_CAPI_ENCRYPTION_KEY`) и `ai_agent_conversations.ctwa_clid` (Meta
Click-to-WhatsApp click id, пишется только на первое сообщение переписки —
см. `docs/superpowers/specs/2026-10-05-ctwa-meta-capi-design.md`).

## Витрина именных 3D-брелков — `print_orders`

Личный магазин founder'а (не мультитенантная фича), та же поза RLS-без-политик,
что у `salon_sites`/`planner_sessions` — доступ только через service-role.
`kaspi_payment_requests.print_order_id` — третья, взаимоисключающая с
`invoice_id`/`shop_order_id`, ветка `checkAndSettleKaspiPayment`
(`src/lib/kaspiPay/settlePayment.ts`). STL-файлы лежат в публичном Storage-
бакете `print-orders` (`<orderId>/base.stl`, `<orderId>/text.stl`). Дизайн:
`docs/superpowers/specs/2026-10-05-print-keychain-shop-design.md`.

Требует `PRINT_SHOP_OWNER_USER_ID` в Vercel (profiles.id founder'а) — без
него `getPrintShopOwnerUserId()` бросает ошибку, и чекаут не сможет
создать Kaspi-платёж ни для одного заказа.

## Шаблоны писем

См. `supabase/email-templates/` — там лежит шаблон письма со ссылкой для
входа и объяснение, почему он хранится в репозитории.

## CFO-кабинет — `cfo_cabinet.sql`

Кабинет финдиректора (`/cfo/*`, `cfo.invoices.kz`). Шесть таблиц `cfo_*`, в
каждой строке `user_id`; RLS — одна политика «только свои строки» на таблицу,
без `EXISTS`-подзапросов (урок аудита 04.09.2026). Ссылки — составные внешние
ключи `(x_id, user_id)`, так что база сама не даёт прицепить свою операцию к
чужому счёту или статье. `cfo_bootstrap()` (security invoker) одной транзакцией
создаёт компанию и 25 стартовых статей. Этап 1 — одна компания на пользователя
(`cfo_companies_one_per_user`), этап 2 снимает ограничение. Дизайн:
`docs/superpowers/specs/2026-10-07-cfo-cabinet-phase1-design.md`.

`cfo_account_deposit.sql` (07.10.2026) — четвёртый вид счёта `deposit` (депозит).

`cfo_telegram_digest.sql` (07.10.2026) — флаг `telegram_digest` у компании: утренняя сводка в Telegram.

`cfo_ask_quota.sql` (07.10.2026) — дневной лимит вопросов «Спроси CFO».

`cfo_demo_flag.sql` (08.10.2026) — флаг `is_demo` для данных примера.

`cfo_receipts.sql` (08.10.2026) — приватный бакет `cfo-receipts` и `cfo_operations.attachment_path`.

`cfo_mode_and_tour.sql` (08.10.2026) — `cfo_companies.mode` (business/family) и `tour_done_at`.

`revoke_definer_rpc.sql` (12.10.2026) — SECURITY DEFINER функции закрыты от REST RPC (у anon был доступ через дефолтный грант PUBLIC); `is_admin_user` оставлена authenticated для RLS-политик.

`tool_kontragent_checks.sql` (12.10.2026) — счётчик бесплатных проверок контрагента на /tools/kontragent (с 14.10 — 3 в квартал на IP, ключ = sha256(ip|квартал)). С 14.10 в той же таблице без изменения схемы живут счётчики /tools/kp: `kp:`+sha256(kp|ip|квартал) — 3 КП в квартал (в дневной предохранитель реестров не входят) и `kp-lookup:`+sha256(kp-lookup|ip|квартал) — 6 живых поисков названия в квартал (входят). Код — src/lib/toolQuota.ts.

`welcome_email_drips.sql` (12.10.2026) — welcome-цепочка: `email_drips` + `profiles.email_optout`; письма только новым аккаунтам (после 12.10), с suppression-проверкой и ссылкой отписки.

`signup_instant_ping.sql` (13.10.2026) — pg_net-триггер на INSERT profiles → /api/hooks/new-signup → мгновенный Telegram-пинг админам; идемпотентность через `profiles.signup_notified_at`.

`invoices_drop_user_delete_policy.sql` (14.10.2026, применена основателем через SQL Editor 14.10) — убрана политика «Users can delete own invoices»: удалением своих счетов прямым запросом можно было освобождать место в месячном лимите. Проверено вживую: DELETE пользователем возвращает 0 строк.

`tool_events.sql` (15.10.2026) — своя аналитика бесплатных инструментов: одна строка на событие (view/doc/cta/limit/lead/signup) по инструменту; пишет POST /api/tools/event, читает /admin → «Инструменты» через GET /api/admin/tool-funnel. Без сырого IP, email и содержимого документов. Пока не применена — события молча теряются (204), а вкладка показывает, какой файл запустить.

`signed_documents_private.sql` (15.10.2026) — бакет `signed-documents` закрыт: договоры и подписанные ЭЦП PDF больше не открываются по вечной публичной ссылке. Код уже хранит путь объекта (старые ссылки читаются как пути) и отдаёт файлы только сервером — `src/lib/signedDocuments.ts`, `/api/contracts/[id]/file` (владелец), `/api/public/contract/[token]/file` и `/api/public/signature/[token]/snapshot` (контрагент по токену), `/api/documents/[id]/[type]`. Работает и до, и после применения. Пока не применена — бакет остаётся публичным. Намеренно открытым остаётся `/api/documents/[id]/[type]`: подписанный ЭЦП документ отдаётся без входа по id подписи, который публикует страница проверки по номеру SIGEX — если подписанные договоры тоже нужно закрыть, это отдельное решение основателя.

`profile_bonus_wallet_plan.sql` (15.10.2026) — бонус за профиль и оплата тарифа с кошелька. `profile_bonus_grants` (RLS без политик, только service role): по 100 ₸ за реквизиты / банк / подпись, unique (user_id, block) и unique (block, bin) — реквизиты и банк платятся один раз на БИН на все аккаунты (user_id on delete set null, а не cascade: строки с БИН переживают удаление аккаунта); начисление — функция `claim_profile_bonus` (право + пополнение + журнал одной транзакцией); новые типы `wallet_ledger`: profile_bonus, plan_payment, plan_payment_refund; `payment_requests.wallet_amount` / `wallet_status` (held/applied/refunded, меняет только сервер — триггер `protect_payment_request_wallet_columns`); функции `pay_plan_from_wallet` (целиком с кошелька одной транзакцией), `start_plan_payment_with_wallet` (удержать часть и создать строку Kaspi-платежа на остаток; удержание несостоявшихся строк того же пользователя «переезжает» на новую без пары записей в журнале), `refund_plan_wallet_hold` / `refund_orphan_plan_wallet_holds` (возврат удержания ровно один раз, добирает крон kaspi-poll). Код — src/lib/profileBonusServer.ts, src/lib/plans/walletPlanPayment.ts, src/lib/kaspiPay/settlePlanPayment.ts. Пока не применена — бонусы не начисляются, кошелёк на /upgrade не предлагается, карточки «Готовность к счёту» нет.
- `storage_owner_select_images.sql` — 15.10.2026: SELECT своей папки в бакетах signatures/stamps/logos (без него загрузка подписи/печати/логотипа с перезаписью падала с RLS). Применяет основатель в SQL Editor.
