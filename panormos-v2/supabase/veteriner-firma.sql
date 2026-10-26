-- ============================================================
-- VETERİNER MARKET — firma paneli (26.10.2026)
-- Veteriner firmasının kendi kullanıcıları panormosmedya.com/vet-giris'ten girip ürün, sipariş ve ayarlarını yönetir.
-- Panormos yöneticisi de her şeyi görmeye devam eder. veteriner-kurulum.sql ve veteriner-ciftlik.sql'den sonra çalıştırılır.
-- ============================================================

create table if not exists public.vet_yetkililer (
  user_id uuid primary key references auth.users(id) on delete cascade,
  eposta text not null,
  created_at timestamptz not null default now()
);
alter table public.vet_yetkililer enable row level security;
grant select on public.vet_yetkililer to authenticated;
drop policy if exists "vet_yetkili_okuma" on public.vet_yetkililer;
create policy "vet_yetkili_okuma" on public.vet_yetkililer for select to authenticated
  using (user_id = auth.uid() or public.panel_yoneticisi());
-- Ekleme/silme yalnızca sunucu işleviyle (vet-yetkili-davet), gizli anahtarla yapılır

-- Giriş yapan kişi veteriner mağazasını yönetebilir mi? (Panormos yöneticisi ya da firmanın yetkilisi)
create or replace function public.vet_yetkili() returns boolean
language sql stable security definer set search_path = public as $$
  select public.panel_yoneticisi() or exists (select 1 from public.vet_yetkililer where user_id = auth.uid());
$$;
revoke all on function public.vet_yetkili() from public, anon;
grant execute on function public.vet_yetkili() to anon, authenticated;  -- anon: sitedeki ürün okuma kuralı bu işlevi çağırır (girişsiz kişi için false döner)

-- Kuralları firma yetkilisini de kapsayacak şekilde güncelle
drop policy if exists "vet_urun_okuma" on public.vet_urunler;
create policy "vet_urun_okuma" on public.vet_urunler for select using (aktif = true or public.vet_yetkili());
drop policy if exists "vet_urun_yazma" on public.vet_urunler;
create policy "vet_urun_yazma" on public.vet_urunler for all to authenticated
  using (public.vet_yetkili()) with check (public.vet_yetkili());

drop policy if exists "vet_ayar_yazma" on public.vet_ayarlar;
create policy "vet_ayar_yazma" on public.vet_ayarlar for update to authenticated
  using (public.vet_yetkili()) with check (public.vet_yetkili());

drop policy if exists "vet_siparis_yonetim" on public.vet_siparisler;
create policy "vet_siparis_yonetim" on public.vet_siparisler for all to authenticated
  using (public.vet_yetkili()) with check (public.vet_yetkili());

drop policy if exists "vet_gorsel_ekleme" on storage.objects;
create policy "vet_gorsel_ekleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'veteriner' and public.vet_yetkili());
drop policy if exists "vet_gorsel_silme" on storage.objects;
create policy "vet_gorsel_silme" on storage.objects for delete to authenticated
  using (bucket_id = 'veteriner' and public.vet_yetkili());
