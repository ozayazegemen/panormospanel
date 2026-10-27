-- ============================================================
-- VETERİNER MARKET — firma kendi kaydını yapar (27.10.2026)
-- /vet-giris'te kayıt olan İLK kişi mağaza sahibi olur; sonra gelen kayıtlar mağazaya erişemez.
-- Sahip, kendi panelinden (Mağaza ayarları → Ekip) önce kayıt olmuş çalışanlarını e-postayla ekler / kaldırır.
-- veteriner-firma.sql'den sonra çalıştırılır; yeniden çalıştırmak zarar vermez.
-- ============================================================

-- Mağazanın henüz sahibi yoksa giriş yapan kişiyi sahip yapar; her durumda yetkili olup olmadığını döner
create or replace function public.vet_sahiplik_al() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from public.vet_yetkililer) then
    insert into public.vet_yetkililer (user_id, eposta)
      values (auth.uid(), coalesce((select email from auth.users where id = auth.uid()), ''))
      on conflict do nothing;
  end if;
  return public.vet_yetkili();
end $$;
revoke all on function public.vet_sahiplik_al() from public, anon;
grant execute on function public.vet_sahiplik_al() to authenticated;

-- Ekip: mağaza yetkilisi, kayıt olmuş bir kişiyi e-postasıyla ekler
create or replace function public.vet_yetkili_ekle(p_eposta text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.vet_yetkili() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_eposta)) limit 1;
  if uid is null then raise exception 'Bu e-postayla kayıtlı hesap yok. Çalışanınız önce panormosmedya.com/vet-giris adresinden kayıt olmalı.'; end if;
  insert into public.vet_yetkililer (user_id, eposta) values (uid, lower(trim(p_eposta))) on conflict (user_id) do nothing;
  return json_build_object('ok', true);
end $$;
revoke all on function public.vet_yetkili_ekle(text) from public, anon;
grant execute on function public.vet_yetkili_ekle(text) to authenticated;

-- Ekip: yetki kaldırma (kişi kendini kaldıramaz, mağaza sahipsiz kalmasın)
create or replace function public.vet_yetkili_kaldir(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.vet_yetkili() then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  if p_user = auth.uid() then raise exception 'Kendi yetkinizi kaldıramazsınız.'; end if;
  delete from public.vet_yetkililer where user_id = p_user;
  return json_build_object('ok', true);
end $$;
revoke all on function public.vet_yetkili_kaldir(uuid) from public, anon;
grant execute on function public.vet_yetkili_kaldir(uuid) to authenticated;

-- Ekip listesini mağaza yetkilileri görebilsin
drop policy if exists "vet_yetkili_okuma" on public.vet_yetkililer;
create policy "vet_yetkili_okuma" on public.vet_yetkililer for select to authenticated
  using (public.vet_yetkili());
