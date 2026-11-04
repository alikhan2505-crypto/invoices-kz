-- Аудит 02.11.2026, решение основателя 04.11.2026 («1 да»). Применено на проде 04.11 миграцией
-- audit_2026_11_04_doc_numbers_unique.
--
-- У аккаунта 5c1f10eb были двойные документы из мая (двойной клик до атомарной claim_doc_number):
-- два АВР-0002 и две НАК-0016. Вторая копия каждой пары получает суффикс -2, как INV-0003-2 у счетов.
-- После этого номер документа уникален у пользователя для актов, накладных и КП (у счетов это
-- invoices_user_number_uniq). Все вставки берут номер из claim_doc_number, так что повтор возможен
-- только при ручной правке счётчика в настройках, и теперь он даст ошибку вместо тихого дубля.

set local lock_timeout = '3s';
update public.avr_documents set number = 'АВР-0002-2'
 where id = '8b955252-e226-477d-bb6e-bd3cc3d911a3' and number = 'АВР-0002';
update public.nakladnaya_documents set number = 'НАК-0016-2'
 where id = '5ddd7317-703a-4909-9c56-23bb3d1a66b5' and number = 'НАК-0016';
create unique index if not exists avr_documents_user_number_uniq on public.avr_documents (user_id, number);
create unique index if not exists nakladnaya_documents_user_number_uniq on public.nakladnaya_documents (user_id, number);
create unique index if not exists kp_documents_user_number_uniq on public.kp_documents (user_id, number);

-- Там же, решение «2 да»: у профиля e8c21bba счётчик счетов был '2026/100', claim_invoice_number
-- делает ::int и падал, создать счёт было нельзя. Записано '100' (выполнено отдельным запросом 04.11,
-- других профилей с нечисловым счётчиком нет):
-- update public.profiles set invoice_next_number = '100'
--  where id = 'e8c21bba-8e2b-47b0-9e62-c1b4bf2027eb' and invoice_next_number = '2026/100';
