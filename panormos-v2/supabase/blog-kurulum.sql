-- ============================================================
-- PANORMOS MEDYA — BLOG
-- panormosmedya.com/blog yazıları ve yazı görselleri.
-- Panormos projesinde (kmxhsyjtyukrxrzoowag) SQL Editor'de bir kez çalıştırılır; yeniden çalıştırmak zarar vermez.
-- ============================================================

-- 1) Yazılar: herkes yalnızca yayındaki yazıları okur; yazma yetkisi yalnızca yöneticidedir
create table if not exists public.blog_yazilari (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  baslik text not null,
  ozet text not null default '',
  icerik text not null default '',
  kategori text not null default 'Genel',
  kapak text,
  yayinda boolean not null default false,
  yayin_tarihi timestamptz not null default now(),
  created_at timestamptz not null default now(),
  guncellenme timestamptz not null default now()
);
create index if not exists blog_yazilari_yayin_idx on public.blog_yazilari (yayinda, yayin_tarihi desc);

alter table public.blog_yazilari enable row level security;
grant select on public.blog_yazilari to anon, authenticated;
grant insert, update, delete on public.blog_yazilari to authenticated;

drop policy if exists "blog_okuma" on public.blog_yazilari;
create policy "blog_okuma" on public.blog_yazilari for select
  using (yayinda = true or public.panel_yoneticisi());
drop policy if exists "blog_ekleme" on public.blog_yazilari;
create policy "blog_ekleme" on public.blog_yazilari for insert to authenticated
  with check (public.panel_yoneticisi());
drop policy if exists "blog_guncelleme" on public.blog_yazilari;
create policy "blog_guncelleme" on public.blog_yazilari for update to authenticated
  using (public.panel_yoneticisi()) with check (public.panel_yoneticisi());
drop policy if exists "blog_silme" on public.blog_yazilari;
create policy "blog_silme" on public.blog_yazilari for delete to authenticated
  using (public.panel_yoneticisi());

-- 2) Yazı görselleri: herkese açık depo (görseller sitede gösterilir); yüklemeyi yalnızca yönetici yapar
insert into storage.buckets (id, name, public) values ('blog', 'blog', true)
  on conflict (id) do update set public = true;

drop policy if exists "blog_gorsel_ekleme" on storage.objects;
create policy "blog_gorsel_ekleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'blog' and public.panel_yoneticisi());
drop policy if exists "blog_gorsel_guncelleme" on storage.objects;
create policy "blog_gorsel_guncelleme" on storage.objects for update to authenticated
  using (bucket_id = 'blog' and public.panel_yoneticisi());
drop policy if exists "blog_gorsel_silme" on storage.objects;
create policy "blog_gorsel_silme" on storage.objects for delete to authenticated
  using (bucket_id = 'blog' and public.panel_yoneticisi());
