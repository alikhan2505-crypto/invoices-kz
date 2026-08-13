# Kaspi Финансы — Live Check for a Real Payout/Commission Endpoint

Checked live 2026-08-13 against a real Kaspi Магазин seller account (session already established this session via phone login). Result: **no real payout/commission endpoint found within the Магазин cabinet itself.** One adjacent system exists but was not pursued — see below.

## 1. Настройки (Settings) — CONFIRMED, no finance content

`https://kaspi.kz/mc/#/settings` has six tabs: Общая информация, Склады и магазины, Kaspi Доставка, Моя доставка, Расписание в праздники, Токен API. Checked "Общая информация" directly (store name, partner ID, logo, phone numbers, working hours) — no revenue, payout, or commission figures anywhere. The other tabs are delivery/logistics configuration, not finance, based on their names and this session's earlier findings about what each area covers.

## 2. ОСТАЛЬНОЕ → Показатели качества (Quality metrics) — CONFIRMED, no finance content

`https://kaspi.kz/mc/#/main-quality-control` shows a single quality score ("Нормально") backed by four metrics: Рейтинг (customer rating), Задержки при передачах (transmission delays), Возвраты по качеству (quality-related returns), Отмены по вашей вине (seller-fault cancellations) — all percentages/ratings, zero money figures. The remaining ОСТАЛЬНОЕ items (Пользователи, Kaspi Marketing) were not individually re-checked this session, but were seen in earlier live captures and are clearly user-management and ad-marketing tools respectively, not finance.

## 3. merchant.kaspi.kz — NOT PURSUED, genuinely separate system

Navigating to `https://merchant.kaspi.kz` redirects to `https://merchant.kaspi.kz/new/Account/Entrance` — a completely separate login page ("Kaspi.kz — Кабинет партнера", "Вход/Регистрация" via its own phone + SMS code flow, no shared session with the Магазин cabinet's `idmc.shop.kaspi.kz`/`mc.shop.kaspi.kz` login). Per the plan's own time-box instruction, this was **not pursued further**: it would cost another real SMS code for an uncertain payoff, since "Кабинет партнера" (Partner Cabinet) is not confirmed to even be the right destination for seller payout/commission data — the name suggests it could be a different Kaspi partner program entirely, unrelated to Магазин sellers' own payouts.

## Conclusion

**No real payout/commission endpoint is confirmed accessible from the same session Kaspi Shop already authenticates with.** Финансы v1 correctly ships on `listOrders`-derived revenue only, per the design doc. Whether `merchant.kaspi.kz`'s "Кабинет партнера" is relevant to seller payouts is a genuine open question for a dedicated future session — it needs its own login investigation (separate SMS cost, separate session model) before anything else about it can be known, and shouldn't be guessed at.
