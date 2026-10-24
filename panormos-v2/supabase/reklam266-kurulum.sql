-- ============================================================
-- 266DIGITALE — REKLAM ALANLARI
-- Her reklam alanına (yer) bir görsel ve tıklanınca gidilecek bağlantı. Görseller "haber266" deposunda (reklam/ klasörü).
-- Panormos projesinde (kmxhsyjtyukrxrzoowag) SQL Editor'de bir kez çalıştırılır; yeniden çalıştırmak zarar vermez.
-- ============================================================

create table if not exists public.reklam266 (
  yer text primary key check (yer in ('ust', 'ara', 'yan_kare', 'yan_dikey', 'haber_ici')),
  gorsel text,
  baglanti text,
  aktif boolean not null default true,
  guncellenme timestamptz not null default now()
);

alter table public.reklam266 enable row level security;
grant select on public.reklam266 to anon, authenticated;
grant insert, update, delete on public.reklam266 to authenticated;

drop policy if exists "reklam266_okuma" on public.reklam266;
create policy "reklam266_okuma" on public.reklam266 for select
  using (aktif = true or public.panel_yoneticisi());
drop policy if exists "reklam266_ekleme" on public.reklam266;
create policy "reklam266_ekleme" on public.reklam266 for insert to authenticated
  with check (public.panel_yoneticisi());
drop policy if exists "reklam266_guncelleme" on public.reklam266;
create policy "reklam266_guncelleme" on public.reklam266 for update to authenticated
  using (public.panel_yoneticisi()) with check (public.panel_yoneticisi());
drop policy if exists "reklam266_silme" on public.reklam266;
create policy "reklam266_silme" on public.reklam266 for delete to authenticated
  using (public.panel_yoneticisi());
