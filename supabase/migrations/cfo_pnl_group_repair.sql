-- CFO: разовая починка групп БДР после круга переключения режимов (QA 17.10.2026, P1-1).
--
-- До 17.10.2026 переключение «бизнес → семья» перезаписывало pnl_group стартовых
-- бизнес-статей (familyRegroup в src/lib/cfo/mode.ts), а обратный переход их не
-- возвращал. Из-за этого на «Обзоре» пропадала себестоимость (валовая маржа 100%)
-- и «Прочие доходы» попадали в «Выручку». Код теперь группы не трогает — семейная
-- группировка считается в отчёте (reportPnlGroup), а здесь возвращаются уже
-- испорченные строки.
--
-- Что меняет — только стартовые статьи cfo_bootstrap(): по названию без учёта
-- регистра, нужного вида, и только строки из стартовой партии компании
-- (created_at = самое раннее created_at среди статей компании: cfo_bootstrap()
-- вставляет все статьи одним insert, у них одна отметка времени). Статьи,
-- добавленные позже — вручную или семейным стартовым набором при смене режима
-- (например «Прочие доходы» семейного набора с группой revenue) — не трогаются.
-- И только там, где группа отличается от исходной:
--   «Закупка товаров и материалов»  → cogs     (было opex)
--   «Налог на доход (ИПН ИП / КПН)»  → tax      (было opex)
--   «НДС к уплате»                   → tax      (было opex)
--   «Прочие доходы» (доход)          → finance  (было revenue)
--   «Проценты по кредитам» (расход)  → finance  (было opex)
-- Остальные стартовые статьи старый код не менял (revenue/opex/null оставались
-- как есть). Повторный запуск ничего не меняет (where pnl_group is distinct from …).
-- Проверка перед запуском — те же условия с select вместо update
-- (сухой прогон 17.10.2026 на проде: 0 строк под условия — все пострадавшие строки
-- уже были возвращены руками во время QA; миграция остаётся как страховка).

with first_batch as (
  select company_id, min(created_at) as created_at from public.cfo_articles group by company_id
)
update public.cfo_articles a
set pnl_group = 'cogs'
from first_batch f
where f.company_id = a.company_id and f.created_at = a.created_at
  and lower(a.name) = 'закупка товаров и материалов' and a.kind = 'expense' and a.pnl_group is distinct from 'cogs';

with first_batch as (
  select company_id, min(created_at) as created_at from public.cfo_articles group by company_id
)
update public.cfo_articles a
set pnl_group = 'tax'
from first_batch f
where f.company_id = a.company_id and f.created_at = a.created_at
  and lower(a.name) in ('налог на доход (ипн ип / кпн)', 'ндс к уплате') and a.kind = 'expense' and a.pnl_group is distinct from 'tax';

with first_batch as (
  select company_id, min(created_at) as created_at from public.cfo_articles group by company_id
)
update public.cfo_articles a
set pnl_group = 'finance'
from first_batch f
where f.company_id = a.company_id and f.created_at = a.created_at
  and ((lower(a.name) = 'прочие доходы' and a.kind = 'income') or (lower(a.name) = 'проценты по кредитам' and a.kind = 'expense'))
  and a.pnl_group is distinct from 'finance';
