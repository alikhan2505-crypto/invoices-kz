-- Аудит Kaspi 06.11.2026 (K19): неудачная отправка цены в Kaspi пишется в
-- историю проверок отдельным действием 'push_failed', а не как 'updated'.
-- В исходной схеме у kaspi_shop_price_checks.action стоит CHECK из четырёх
-- значений, поэтому его нужно расширить. Применять вручную в SQL Editor.
--
-- До применения код не ломается: checkCycle при отказе CHECK пишет строку с
-- action = 'error' и тем же текстом причины (см. insertPriceCheckRow).
--
-- Баланс кошелька и функцию debit_wallet_balance миграция не трогает.

DO $$
DECLARE
  c record;
BEGIN
  -- Имя ограничения могло быть любым (автоимя или своё): снимаем все CHECK
  -- таблицы, в которых упоминается колонка action.
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.kaspi_shop_price_checks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE public.kaspi_shop_price_checks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.kaspi_shop_price_checks
  ADD CONSTRAINT kaspi_shop_price_checks_action_check
  CHECK (action IN ('updated', 'held_at_floor', 'no_change', 'error', 'push_failed'));
