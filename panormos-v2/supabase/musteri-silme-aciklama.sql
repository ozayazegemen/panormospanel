-- Müşteri silme: açıklama alanı + ayrılan müşterinin reklamlarını işaretleme
-- (müşteri silinince planlı paylaşımlar iptal edilir, reklamlar durdurulur; tekrar aktif edilince geri açılır).
-- Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak zararsızdır.

alter table public.clients add column if not exists delete_note text;                       -- silme açıklaması
alter table public.reklamlar add column if not exists musteri_ayrildi boolean not null default false;  -- müşteri ayrıldığı için durduruldu
