-- 23.10.2026: Reels в Instagram-черновиках. Идемпотентно (if not exists).
-- Старый поток картинок/каруселей работает и без этой миграции; без неё
-- /api/instagram/draft на видео-черновик отвечает 409 «примените миграцию».
--
-- media_kind: image / carousel / reel. Существующие строки получают 'image'
--   (карусель отличается длиной image_urls, как и раньше; новое значение
--   'carousel' зарезервировано, код пока его не пишет).
-- video_url / cover_url: публичные адреса файлов в бакете instagram-drafts
--   (папка reels/). Для Reel image_url (NOT NULL) = обложка или само видео.
-- share_to_feed: показывать Reel и в ленте профиля, не только во вкладке Reels.
--
-- Статус «в работе» не добавляется: пока Reel публикуется, строка держит
-- status = 'approved' (его допускает instagram_drafts_status_check).
alter table public.instagram_drafts
  add column if not exists media_kind text not null default 'image',
  add column if not exists video_url text,
  add column if not exists cover_url text,
  add column if not exists share_to_feed boolean default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.instagram_drafts'::regclass
      and conname = 'instagram_drafts_media_kind_check'
  ) then
    alter table public.instagram_drafts
      add constraint instagram_drafts_media_kind_check
      check (media_kind in ('image', 'carousel', 'reel'));
  end if;
end $$;
