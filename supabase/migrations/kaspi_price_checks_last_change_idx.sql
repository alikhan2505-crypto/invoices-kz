-- Строка «цена изменена ... (750 → 600 ₸)» на карточке Демпинга (13.11.2026, P13) читает из журнала
-- проверок только строки action='updated': их единицы на товар, а всех проверок тысячи в сутки.
-- Частичный индекс держит такой запрос быстрым и сам почти ничего не весит.
CREATE INDEX IF NOT EXISTS kaspi_price_checks_last_change_idx
  ON public.kaspi_shop_price_checks (tracked_product_id, checked_at DESC)
  WHERE action = 'updated';
