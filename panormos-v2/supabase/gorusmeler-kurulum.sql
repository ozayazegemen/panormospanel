-- Görüşmeler: görüşülen / randevu alınan firmaların kayıtları
-- (firma adı, yetkili, telefon, sosyal medya hesapları, randevu tarihi, durum, notlar).
-- Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak zararsızdır.

create table if not exists public.gorusmeler (
  id uuid primary key default gen_random_uuid(),
  firma_adi text not null,
  yetkili text not null default '',
  telefon text not null default '',
  eposta text not null default '',
  instagram text not null default '',
  facebook text not null default '',
  tiktok text not null default '',
  web text not null default '',
  sektor text not null default '',
  adres text not null default '',
  randevu_zamani timestamptz,                         -- randevu tarihi ve saati (yoksa boş)
  durum text not null default 'bekliyor' check (durum in ('bekliyor','gorusuldu','anlasildi','olumsuz')),
  notlar text not null default '',
  gecmis jsonb not null default '[]'::jsonb,         -- [{ "at": "...", "not": "...", "by": "..." }]
  ekleyen text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gorusmeler_randevu on public.gorusmeler (durum, randevu_zamani);

alter table public.gorusmeler enable row level security;
drop policy if exists panel_uyeleri on public.gorusmeler;
create policy panel_uyeleri on public.gorusmeler for all to authenticated
  using (public.panel_uyesi()) with check (public.panel_uyesi());
