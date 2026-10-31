-- Reklamlar (31.10.2026): panelden Meta (Instagram/Facebook) reklamı verme.
-- Tüm müşterilerin reklamları Panormos Medya'nın reklam hesabından (act_1254894623405686) çıkar;
-- ödeme Panormos kartından, müşteriden önden tahsil edilir. Supabase SQL Editor'de bir kez çalıştırın.

alter table public.clients add column if not exists fb_sayfa_id text;  -- Instagram hesabına bağlı Facebook sayfası (ilk reklamda otomatik bulunur)

create table if not exists public.reklamlar (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  baslik text not null default '',
  amac text not null default 'erisim' check (amac in ('erisim','etkilesim','trafik','profil')),
  kaynak text not null default 'gonderi' check (kaynak in ('gonderi','yeni')),  -- mevcut Instagram gönderisi | yeni görsel/video
  ig_medya_id text,                                  -- kaynak=gonderi: öne çıkarılan Instagram gönderisi
  dosya jsonb,                                       -- kaynak=yeni: { "yol": "...", "tur": "video"|"resim", "ad": "..." }
  metin text not null default '',
  baglanti text,                                     -- tıklanınca açılacak adres (trafik için zorunlu)
  hedef jsonb not null default '{}'::jsonb,          -- { konumlar:[{key,name,type}], yas_min, yas_max, cinsiyet, ilgi:[{id,name}], platform }
  butce_gunluk numeric not null default 0,           -- TL / gün
  baslangic timestamptz not null,
  bitis timestamptz,
  durum text not null default 'olusturuluyor' check (durum in ('olusturuluyor','inceleme','aktif','duraklatildi','bitti','reddedildi','hata','iptal')),
  adim text,                                         -- olusturuluyor iken sıradaki adım
  meta jsonb not null default '{}'::jsonb,           -- Meta kimlikleri: kampanya_id, reklam_seti_id, kreatif_id, reklam_id, video_id, image_hash, sayfa_id
  hata text,
  sonuc jsonb,                                       -- { gosterim, erisim, tiklama, linkTiklama, etkilesim, harcama, siklik, videoIzleme, profilZiyareti }
  sonuc_guncellendi_at timestamptz,
  olusturan_id uuid,
  olusturan_ad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reklamlar_musteri on public.reklamlar (client_id, created_at desc);
create index if not exists reklamlar_durum on public.reklamlar (durum);

alter table public.reklamlar enable row level security;
drop policy if exists panel_okur on public.reklamlar;
create policy panel_okur on public.reklamlar for select to authenticated using (public.panel_uyesi());
-- Yazma yalnızca sunucu işlevinden (service role) yapılır; Meta'ya giden kayıtlar panelden doğrudan değiştirilmez.
