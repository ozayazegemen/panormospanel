-- Paylaşım Planlayıcı: müşterilerin Reels / Post / Kaydırmalı / Hikaye paylaşımları
-- Panelden yüklenir, tarih-saat seçilir; netlify/functions/planlayici-zamanli.cjs her 5 dakikada
-- zamanı gelenleri Instagram'a gönderir. Paylaşılınca publishes tablosuna kayıt düşer (müşterinin aylık hakkından düşer).
-- Supabase SQL Editor'de bir kez çalıştırın.

-- Müşterinin bağlı Instagram işletme hesabı
alter table public.clients add column if not exists ig_user_id text;
alter table public.clients add column if not exists ig_kullanici_adi text;

create table if not exists public.planli_paylasimlar (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform text not null default 'instagram',
  icerik_turu text not null check (icerik_turu in ('reels','post','carousel','story')),
  aciklama text not null default '',
  dosyalar jsonb not null default '[]'::jsonb,   -- [{ "yol": "...", "tur": "video"|"resim", "ad": "..." }]
  zaman timestamptz not null,
  durum text not null default 'bekliyor' check (durum in ('bekliyor','hazirlaniyor','paylasildi','hata','iptal')),
  hata text,
  meta jsonb not null default '{}'::jsonb,       -- Instagram kapsayıcı kimlikleri
  ig_medya_id text,
  baglanti text,
  publish_id uuid,
  olusturan_id uuid,
  olusturan_ad text,
  paylasildi_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists planli_paylasimlar_zaman on public.planli_paylasimlar (durum, zaman);
create index if not exists planli_paylasimlar_musteri on public.planli_paylasimlar (client_id, zaman);

alter table public.planli_paylasimlar enable row level security;
drop policy if exists panel_uyeleri on public.planli_paylasimlar;
create policy panel_uyeleri on public.planli_paylasimlar for all to authenticated
  using (public.panel_uyesi()) with check (public.panel_uyesi());

-- Yüklenen videolar ve görseller (Instagram, kısa süreli imzalı bağlantıyla çeker)
insert into storage.buckets (id, name, public) values ('planlayici', 'planlayici', false)
  on conflict (id) do nothing;
drop policy if exists planlayici_panel on storage.objects;
create policy planlayici_panel on storage.objects for all to authenticated
  using (bucket_id = 'planlayici' and public.panel_uyesi())
  with check (bucket_id = 'planlayici' and public.panel_uyesi());
