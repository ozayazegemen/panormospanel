-- Instagram takipçi arşivi ve istatistik önbelleği (30.10.2026)
-- Her gece netlify/functions/takipci-gunluk.cjs bağlı tüm müşterilerin takipçi sayısını ve
-- Instagram'ın verdiği günlük yeni/ayrılan takipçi sayılarını yazar. Instagram bu veriyi yalnız
-- 30 gün geriye verdiği için kendi arşivimizi tutuyoruz. Supabase SQL Editor'de bir kez çalıştırın.

create table if not exists public.ig_takipci_gunluk (
  client_id uuid not null references public.clients(id) on delete cascade,
  gun date not null,
  takipci integer,            -- gün sonu toplam takipçi
  yeni integer,               -- o gün kazanılan (Instagram follower_count / follows)
  ayrilan integer,            -- o gün ayrılan (Instagram unfollows; bazı hesaplarda gelmez)
  kaydedildi_at timestamptz not null default now(),
  primary key (client_id, gun)
);
alter table public.ig_takipci_gunluk enable row level security;
drop policy if exists panel_okur on public.ig_takipci_gunluk;
create policy panel_okur on public.ig_takipci_gunluk for select to authenticated using (public.panel_uyesi());

-- İstatistik önbelleği (Instagram sorgusu yavaş; 1 saat saklanır)
create table if not exists public.ig_istatistik_onbellek (
  client_id uuid not null references public.clients(id) on delete cascade,
  ay text not null,
  veri jsonb not null,
  guncellendi_at timestamptz not null default now(),
  primary key (client_id, ay)
);
alter table public.ig_istatistik_onbellek enable row level security;
drop policy if exists panel_okur on public.ig_istatistik_onbellek;
create policy panel_okur on public.ig_istatistik_onbellek for select to authenticated using (public.panel_uyesi());
