-- 15.10.2026: подпись, печать и логотип не сохранялись НИ У КОГО:
-- «new row violates row-level security policy». Страница /profile/signature
-- загружает файл с upsert: true, а это INSERT ... ON CONFLICT DO UPDATE —
-- Postgres требует для него ещё и право SELECT на строку storage.objects.
-- У бакетов signatures, stamps и logos были политики INSERT/UPDATE/DELETE
-- для своей папки, но не было SELECT — поэтому любая загрузка с перезаписью
-- падала. Проверено тестовым аккаунтом: без upsert загрузка проходит, с
-- upsert — отказ во всех трёх бакетах.
--
-- Политика пускает только в СВОЮ папку (<uid>/...): чужие файлы через API не
-- видны и не перечисляются. Сами бакеты публичные, картинки в счетах и
-- дальше открываются по публичной ссылке — это не меняется.

create policy "Signature/stamp owner select"
  on storage.objects for select to authenticated
  using (bucket_id = any (array['signatures', 'stamps']) and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Logo owner select"
  on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Проверка: должно вернуть 2 строки.
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname in ('Signature/stamp owner select', 'Logo owner select');
