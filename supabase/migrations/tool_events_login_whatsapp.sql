-- 15.11.2026: нажатие «Войти через WhatsApp» на странице входа пишется в свою аналитику (tool = 'none').
-- Без расширения CHECK такие строки молча не пишутся (сервер отвечает 204 и логирует сбой).
-- Список = то, что стояло в tool_events_event_check на 15.11 (tool_events_login.sql) + login_whatsapp.
alter table public.tool_events drop constraint if exists tool_events_event_check;
alter table public.tool_events add constraint tool_events_event_check
  check (event in ('view', 'doc', 'cta', 'limit', 'lead', 'signup',
                   'tool_form_autofill_bin', 'tool_form_more_open', 'tool_form_saved_applied',
                   'tool_watch_click',
                   'login_open', 'login_email_press', 'login_captcha_missing', 'login_link_sent',
                   'login_send_error', 'login_google', 'login_facebook', 'login_passkey', 'login_whatsapp'));
