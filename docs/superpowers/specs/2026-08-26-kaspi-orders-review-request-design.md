# Kaspi Shop: «Запросить отзыв» на карточке заказа — Design

## Context

From the 2026-08-22 competitor research ("Отзывы → WhatsApp после доставки" — rec #4 for Kaspi Bot) and the 2026-08-26 follow-up review. The originally-imagined shape (Kaspi delivers an order → we auto-send a WhatsApp review request) turned out to be **not buildable with what this codebase has**, confirmed by direct investigation, not assumption:

- Kaspi's own order API **masks the customer's phone number** (`+0(000)-000-00-00`) — `cabinetApi.ts`'s `OrderDetail` type doesn't even carry a phone field because of this (the query explicitly `@skip`s it). No customer phone number is obtainable programmatically from any order.
- Orders aren't stored locally at all (fetched live per page load from Kaspi's cabinet API) — no table, no cron, no webhook. There is also no "delivered" status in `orderStatuses.ts`'s real constants — the modeled lifecycle stops at "передан курьеру."
- `sendWhatsAppMessage` only ever replies inside an active 24h customer-service window — this codebase has zero WhatsApp *template* message code (Meta requires an approved template for any business-initiated message outside that window), and Kaspi Shop has no connection to the AI-агент's WhatsApp channel at all (separate tables, separate ownership scoping, AI-агент is admin-only).

Founder chose the honest reduced scope: **a manual assistant, not automation.** The seller already knows the customer's real phone (visible in Kaspi's own cabinet UI, just not our API) and already knows when an order was actually delivered (Kaspi's masked API can't tell us). This feature just removes the "open WhatsApp, type a good message" friction — it does not claim to know anything Kaspi hides from us.

## What this is

A small button on every order card: **«Отзыв»** (WhatsApp icon). Click opens a modal:
1. Phone input — the seller types the customer's real number (they already have it from Kaspi's own order screen).
2. Editable message textarea, pre-filled with a template naming the order's first item.
3. «Открыть WhatsApp» button — enabled only once the phone normalizes to a valid KZ number — opens `https://wa.me/{phone}?text={encoded message}` in a new tab.

Sending happens in the seller's own WhatsApp (personal or Business app, whichever they're logged into) — invoices.kz never touches the WhatsApp Business API for this, so none of the 24h-window/template-approval constraints apply. This is the same class of feature as a `mailto:` link — a deep link into a tool the user already has, not a message we send on their behalf.

## Zero backend

No new table, no new API route, no new column. Orders already aren't persisted server-side, and nothing here needs to survive a page reload — if the seller navigates away, the typed phone/edited text is simply gone (same as closing a `mailto:` compose window). This is a pure client-side addition to the existing `src/app/kaspi-shop/orders/page.tsx`.

## Phone normalization

Reuses the EXISTING `normalizeKzPhone` from `src/lib/kaspiPay/phone.ts` verbatim (accepts `+7`/`8`/`7`-prefixed input in any punctuation, returns `77071234567` or `null`). This is exactly the digit shape `wa.me` needs (no `+`, no spaces). The module path (`kaspiPay/`) doesn't matter functionally — it's a pure, dependency-free function, safe to import from the orders page same as any other util.

## UI details

- Button: small WhatsApp icon (reuse the existing inline SVG glyph already used elsewhere in this codebase, e.g. `SiteNav.tsx`/review pages' `WhatsAppIcon`) placed next to the price on each order card, `onClick` with `e.stopPropagation()` so it never triggers the card's existing bulk-select toggle.
- Shown on every order card regardless of status — the seller decides when it's appropriate (they know the real delivery state; we don't).
- Modal follows the existing «Цена и остатки»-style modal pattern already used elsewhere on Kaspi Shop pages (`nav-glass` card, backdrop click-to-close, explicit close button) — a NEW small modal component local to the orders page, not a shared component (this codebase's existing convention: page-local modals for page-specific one-off flows).
- Default message template (editable before opening WhatsApp):
  > `Здравствуйте! Спасибо за заказ «{firstItem.name}» 🙏 Будем очень благодарны, если оставите отзыв на Kaspi — это помогает нам и другим покупателям.`
  Falls back to `«Заказ №{order.code}»` when the order has no first item name (mirrors the card's own existing `firstItem?.name || `Заказ №${o.code}`` fallback).
- Small caption under the button/in the modal: «Откроется WhatsApp с готовым текстом — отправляете вы сами» — explicit, honest framing that this is not automated sending.
- Phone input shows a validation hint (red border / disabled submit) when `normalizeKzPhone` returns `null` for non-empty input — mirrors this codebase's existing inline-validation visual language.

## Out of scope (deliberate)

- Persisting the phone number anywhere (per-order or otherwise) — v1 is fully ephemeral, matches this feature's "assistant, not a system of record" framing.
- Any link to Kaspi's real delivery status or a "delivered" trigger — doesn't exist in this codebase and the button is available unconditionally instead.
- Editable/configurable default message text saved in settings — the textarea itself is the editing surface, per-use, no persistence.
- WhatsApp Business API / template messages / any programmatic send — explicitly ruled out by the investigation above.

## Testing

The only new logic is UI wiring around an already-tested pure function — `normalizeKzPhone` already has `src/lib/kaspiPay/phone.test.ts`, unchanged by this feature. No new pure functions are introduced by this design — the message-template string interpolation is a one-line inline expression, not extracted into its own testable unit. Manual live verification: open an order card's «Отзыв» modal, type a phone in each accepted format (+7/8/7-prefixed), confirm the WhatsApp link opens with the correct number and pre-filled text.
