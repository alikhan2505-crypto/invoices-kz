-- 30.10.2026: шаги страницы входа (/login) и клик «Следить за этим БИН» в своей
-- аналитике, чтобы увидеть, где теряются люди между «нажал регистрацию» и «получил
-- письмо» (с 25.10 по DM-ссылкам: 5 нажали кнопку регистрации, ни одного запроса
-- письма). Строки login_* пишутся с tool = 'none' (он уже разрешён CHECK по tool).
--   login_open             - форма входа показана
--   login_email_press      - нажата «Получить ссылку для входа»
--   login_captcha_missing  - нажата, но токен капчи ещё не получен (капча не прошла)
--   login_link_sent        - письмо отправлено (в т.ч. повторная отправка)
--   login_send_error       - отправка письма вернула ошибку
--   login_google / login_facebook / login_passkey - нажата соответствующая кнопка
--   tool_watch_click       - нажато «Следить за этим БИН» невошедшим (tool = 'kontragent')
-- Без расширения CHECK такие строки молча не пишутся (сервер отвечает 204 и логирует
-- сбой), страницы при этом работают. Имя ограничения tool_events_event_check
-- предполагается (умолчание Postgres); проверка:
--   select conname from pg_constraint where conrelid = 'public.tool_events'::regclass and contype = 'c';
-- Идемпотентно; ничего из существующих данных не меняет.
alter table public.tool_events drop constraint if exists tool_events_event_check;
alter table public.tool_events add constraint tool_events_event_check
  check (event in ('view', 'doc', 'cta', 'limit', 'lead', 'signup',
                   'tool_form_autofill_bin', 'tool_form_more_open', 'tool_form_saved_applied',
                   'tool_watch_click',
                   'login_open', 'login_email_press', 'login_captcha_missing', 'login_link_sent',
                   'login_send_error', 'login_google', 'login_facebook', 'login_passkey'));
