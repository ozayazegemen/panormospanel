-- Paylaşım Planlayıcı: bir müşteriye birden fazla Instagram hesabı (09.11.2026)
-- Örnek: Mobydick / Balena Bianca tek müşteri, iki Instagram hesabı; Ozarlar dört hesap.
-- Birincil hesap clients.ig_user_id'de kalır (reklam modülü ve takipçi arşivi onu kullanır);
-- ek hesaplar clients.ig_ek_hesaplar'da tutulur: [{ "ig_user_id": "...", "ig_kullanici_adi": "..." }]
-- Her planlı paylaşım hangi hesaba gideceğini planli_paylasimlar.ig_user_id'de taşır (boşsa birincil).
-- Supabase SQL Editor'de bir kez çalıştırın; tekrar çalıştırılabilir.

alter table public.clients add column if not exists ig_ek_hesaplar jsonb not null default '[]'::jsonb;
alter table public.planli_paylasimlar add column if not exists ig_user_id text;
create index if not exists planli_paylasimlar_hesap on public.planli_paylasimlar (ig_user_id, zaman);
