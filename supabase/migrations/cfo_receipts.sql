-- CFO: фото чеков к операциям (applied 2026-10-08). Приватный бакет, папка = user_id:
-- читать, загружать и удалять файлы может только их владелец; ссылки — временные (signed URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cfo-receipts', 'cfo-receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "cfo receipts: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'cfo-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cfo receipts: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'cfo-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cfo receipts: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'cfo-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.cfo_operations add column attachment_path text;
