-- ============================================================
-- VETERİNER MARKET — roller (27.10.2026)
-- Sahip: Panormos panelinde bir kez yazılan e-postayla kayıt olan kişi. Ekibi yönetir, rolleri belirler.
-- Yönetici: ürün, sipariş, mağaza ayarları. Çalışan: siparişleri görür ve durumunu günceller, ürünleri yalnızca görür.
-- veteriner-kendi-kayit.sql'deki "ilk kayıt sahip olur" kuralının yerini alır.
-- ============================================================

alter table public.vet_yetkililer add column if not exists rol text not null default 'calisan';
alter table public.vet_yetkililer drop constraint if exists vet_yetkililer_rol_check;
alter table public.vet_yetkililer add constraint vet_yetkililer_rol_check check (rol in ('sahip', 'yonetici', 'calisan'));

-- Mağaza sahibinin e-postası: yalnızca Panormos yöneticisi görür ve yazar
create table if not exists public.vet_magaza (
  id integer primary key default 1 check (id = 1),
  sahip_eposta text not null default ''
);
insert into public.vet_magaza (id) values (1) on conflict (id) do nothing;
alter table public.vet_magaza enable row level security;
grant select, update on public.vet_magaza to authenticated;
drop policy if exists "vet_magaza_yonetim" on public.vet_magaza;
create policy "vet_magaza_yonetim" on public.vet_magaza for all to authenticated
  using (public.panel_yoneticisi()) with check (public.panel_yoneticisi());

-- Giriş yapanın rolü: 'panormos' (Panormos yöneticisi), 'sahip', 'yonetici', 'calisan' ya da null
create or replace function public.vet_rol() returns text
language sql stable security definer set search_path = public as $$
  select case when public.panel_yoneticisi() then 'panormos'
              else (select rol from public.vet_yetkililer where user_id = auth.uid()) end;
$$;
revoke all on function public.vet_rol() from public, anon;
grant execute on function public.vet_rol() to anon, authenticated;

-- Ürün ve ayar düzenleyebilir mi? (Panormos, sahip, yönetici)
create or replace function public.vet_duzenleyici() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.vet_rol() in ('panormos', 'sahip', 'yonetici'), false);
$$;
revoke all on function public.vet_duzenleyici() from public, anon;
grant execute on function public.vet_duzenleyici() to anon, authenticated;

-- Giriş: sahip e-postasıyla gelen kişi sahip olarak eklenir; rolü döner (eski sürüm boolean döndürüyordu)
drop function if exists public.vet_sahiplik_al() cascade;
create or replace function public.vet_sahiplik_al() returns text
language plpgsql security definer set search_path = public as $$
declare e text; s text;
begin
  if auth.uid() is null then return null; end if;
  select lower(email) into e from auth.users where id = auth.uid();
  select lower(trim(sahip_eposta)) into s from public.vet_magaza where id = 1;
  if s <> '' and e = s then
    insert into public.vet_yetkililer (user_id, eposta, rol) values (auth.uid(), e, 'sahip')
      on conflict (user_id) do update set rol = 'sahip';
  end if;
  return public.vet_rol();
end $$;
revoke all on function public.vet_sahiplik_al() from public, anon;
grant execute on function public.vet_sahiplik_al() to authenticated;

-- Ekip yönetimi: yalnızca sahip (ve Panormos yöneticisi)
drop function if exists public.vet_yetkili_ekle(text);
create or replace function public.vet_yetkili_ekle(p_eposta text, p_rol text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if coalesce(public.vet_rol() in ('panormos', 'sahip'), false) = false then raise exception 'Ekibi yalnızca mağaza sahibi yönetebilir.'; end if;
  if p_rol not in ('yonetici', 'calisan') then raise exception 'Geçersiz rol.'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_eposta)) limit 1;
  if uid is null then raise exception 'Bu e-postayla kayıtlı hesap yok. Kişi önce panormosmedya.com/vet-giris adresinden "Hesap oluşturun" ile kayıt olmalı.'; end if;
  if exists (select 1 from public.vet_yetkililer where user_id = uid and rol = 'sahip') then raise exception 'Mağaza sahibinin rolü değiştirilemez.'; end if;
  insert into public.vet_yetkililer (user_id, eposta, rol) values (uid, lower(trim(p_eposta)), p_rol)
    on conflict (user_id) do update set rol = excluded.rol;
  return json_build_object('ok', true);
end $$;
revoke all on function public.vet_yetkili_ekle(text, text) from public, anon;
grant execute on function public.vet_yetkili_ekle(text, text) to authenticated;

create or replace function public.vet_yetkili_kaldir(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.vet_rol() in ('panormos', 'sahip'), false) = false then raise exception 'Ekibi yalnızca mağaza sahibi yönetebilir.'; end if;
  if exists (select 1 from public.vet_yetkililer where user_id = p_user and rol = 'sahip') then raise exception 'Mağaza sahibi çıkarılamaz.'; end if;
  delete from public.vet_yetkililer where user_id = p_user;
  return json_build_object('ok', true);
end $$;
revoke all on function public.vet_yetkili_kaldir(uuid) from public, anon;
grant execute on function public.vet_yetkili_kaldir(uuid) to authenticated;

-- Yetki kuralları: ürün ve ayar düzenleme sahip/yönetici; sipariş görme ve güncelleme tüm ekip, silme sahip/yönetici
drop policy if exists "vet_urun_yazma" on public.vet_urunler;
create policy "vet_urun_yazma" on public.vet_urunler for all to authenticated
  using (public.vet_duzenleyici()) with check (public.vet_duzenleyici());
drop policy if exists "vet_ayar_yazma" on public.vet_ayarlar;
create policy "vet_ayar_yazma" on public.vet_ayarlar for update to authenticated
  using (public.vet_duzenleyici()) with check (public.vet_duzenleyici());
drop policy if exists "vet_siparis_yonetim" on public.vet_siparisler;
drop policy if exists "vet_siparis_okuma" on public.vet_siparisler;
create policy "vet_siparis_okuma" on public.vet_siparisler for select to authenticated using (public.vet_yetkili());
drop policy if exists "vet_siparis_guncelleme" on public.vet_siparisler;
create policy "vet_siparis_guncelleme" on public.vet_siparisler for update to authenticated
  using (public.vet_yetkili()) with check (public.vet_yetkili());
drop policy if exists "vet_siparis_silme" on public.vet_siparisler;
create policy "vet_siparis_silme" on public.vet_siparisler for delete to authenticated using (public.vet_duzenleyici());
drop policy if exists "vet_gorsel_ekleme" on storage.objects;
create policy "vet_gorsel_ekleme" on storage.objects for insert to authenticated
  with check (bucket_id = 'veteriner' and public.vet_duzenleyici());
drop policy if exists "vet_gorsel_silme" on storage.objects;
create policy "vet_gorsel_silme" on storage.objects for delete to authenticated
  using (bucket_id = 'veteriner' and public.vet_duzenleyici());
