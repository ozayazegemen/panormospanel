-- Müşteri sözleşmeleri: Müşteriler → müşteri → "Sözleşme" sekmesinden paket seçilince
-- otomatik hazırlanan hizmet sözleşmelerinin kaydı (yazdırılan belge aynen saklanır).
-- Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak zararsızdır.

create table if not exists public.sozlesmeler (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sozlesme_no text not null default '',
  paket_adi text not null default '',
  aylik_ucret numeric not null default 0,
  kdv_orani numeric not null default 20,
  baslangic date not null,
  sure_ay int not null default 12,
  odeme_gunu int not null default 1,
  musteri_yetkili text not null default '',
  kapsam jsonb not null default '[]'::jsonb,        -- hizmet maddeleri
  ek_hizmetler jsonb not null default '[]'::jsonb,  -- [{ "ad": "...", "fiyat": "..." }]
  ozel_sartlar text not null default '',
  durum text not null default 'taslak' check (durum in ('taslak','imzalandi','bitti','iptal')),
  html text not null default '',                    -- yazdırılan belgenin aynısı
  olusturan text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sozlesmeler_musteri on public.sozlesmeler (client_id, created_at desc);

alter table public.sozlesmeler enable row level security;
drop policy if exists panel_uyeleri on public.sozlesmeler;
create policy panel_uyeleri on public.sozlesmeler for all to authenticated
  using (public.panel_uyesi()) with check (public.panel_uyesi());
