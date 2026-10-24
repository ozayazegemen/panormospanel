-- ============================================================
-- 266DIGITALE — HABER MASASI
-- Haberler panelden yazılır, 266digitale sitesinde yayınlanır.
-- Panormos projesinde (kmxhsyjtyukrxrzoowag) SQL Editor'de bir kez çalıştırılır; yeniden çalıştırmak zarar vermez.
-- Durumlar: taslak (yalnızca yazan ve yönetici görür), onay (muhabir gönderdi, yönetici onaylayacak), yayinda (herkes görür).
-- ============================================================

create table if not exists public.haber266 (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  baslik text not null,
  spot text not null default '',
  metin text not null default '',
  kategori text not null default 'Gündem',
  kapak text,
  galeri jsonb not null default '[]'::jsonb,
  video text,
  son_dakika boolean not null default false,
  manset boolean not null default false,
  durum text not null default 'taslak' check (durum in ('taslak', 'onay', 'yayinda')),
  yazar_id uuid default auth.uid(),
  yazar_ad text not null default '',
  yayin_tarihi timestamptz not null default now(),
  created_at timestamptz not null default now(),
  guncellenme timestamptz not null default now()
);
create index if not exists haber266_yayin_idx on public.haber266 (durum, yayin_tarihi desc);

alter table public.haber266 enable row level security;
grant select on public.haber266 to anon, authenticated;
grant insert, update, delete on public.haber266 to authenticated;

-- Okuma: yayındakileri herkes; taslak ve onay bekleyenleri yazan çalışan ve yönetici
drop policy if exists "haber266_okuma" on public.haber266;
create policy "haber266_okuma" on public.haber266 for select
  using (durum = 'yayinda' or public.panel_yoneticisi() or (yazar_id = auth.uid() and public.panel_uyesi()));
-- Ekleme: yönetici her durumda; çalışan (muhabir) yalnızca taslak ya da onaya gönderilmiş olarak
drop policy if exists "haber266_ekleme" on public.haber266;
create policy "haber266_ekleme" on public.haber266 for insert to authenticated
  with check (public.panel_yoneticisi() or (public.panel_uyesi() and yazar_id = auth.uid() and durum in ('taslak', 'onay')));
drop policy if exists "haber266_guncelleme" on public.haber266;
create policy "haber266_guncelleme" on public.haber266 for update to authenticated
  using (public.panel_yoneticisi() or (public.panel_uyesi() and yazar_id = auth.uid() and durum in ('taslak', 'onay')))
  with check (public.panel_yoneticisi() or (public.panel_uyesi() and yazar_id = auth.uid() and durum in ('taslak', 'onay')));
drop policy if exists "haber266_silme" on public.haber266;
create policy "haber266_silme" on public.haber266 for delete to authenticated
  using (public.panel_yoneticisi() or (public.panel_uyesi() and yazar_id = auth.uid() and durum <> 'yayinda'));

-- Haber fotoğrafları: herkese açık depo; yüklemeyi panel çalışanları yapar
insert into storage.buckets (id, name, public) values ('haber266', 'haber266', true)
  on conflict (id) do update set public = true;

drop policy if exists "haber266_gorsel_ekleme" on storage.objects;
create policy "haber266_gorsel_ekleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'haber266' and public.panel_uyesi());
drop policy if exists "haber266_gorsel_guncelleme" on storage.objects;
create policy "haber266_gorsel_guncelleme" on storage.objects for update to authenticated
  using (bucket_id = 'haber266' and public.panel_yoneticisi());
drop policy if exists "haber266_gorsel_silme" on storage.objects;
create policy "haber266_gorsel_silme" on storage.objects for delete to authenticated
  using (bucket_id = 'haber266' and public.panel_yoneticisi());
