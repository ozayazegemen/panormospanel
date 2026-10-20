-- QR Menü aboneliği, ek koruma: kendi kaydolan işletmenin süresi dolunca (Panormos çalışanları hariç)
-- menü, kategori ve ürün değiştirilemez; kapanmış menü işletme tarafından yeniden yayına alınamaz.
begin;

create or replace function public.qr_menu_suresi_dolmus(m public.qr_menuler) returns boolean
language sql stable as $$
  select m.kendi_kaydi and m.abonelik_bitis is not null
         and m.abonelik_bitis < (now() at time zone 'Europe/Istanbul')::date
$$;

create or replace function public.qr_menu_abonelik_koru() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') or public.panel_uyesi() then
    return new;
  end if;
  if new.abonelik_bitis is distinct from old.abonelik_bitis
     or new.abonelik_donem is distinct from old.abonelik_donem
     or new.kendi_kaydi is distinct from old.kendi_kaydi
     or new.sahip_user_id is distinct from old.sahip_user_id
     or new.kayit_ip is distinct from old.kayit_ip then
    raise exception 'Abonelik bilgileri yalnızca Panormos Medya tarafından değiştirilebilir.';
  end if;
  if public.qr_menu_suresi_dolmus(old) then
    raise exception 'Abonelik süreniz doldu. Menünüzü düzenlemek için ödemenizi yapın.';
  end if;
  return new;
end $$;

-- Kategori ve ürün değişikliklerinde de aynı kural (menü, kategori üzerinden bulunur)
create or replace function public.qr_icerik_abonelik_koru() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hedef_menu uuid;
  m public.qr_menuler;
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') or public.panel_uyesi() then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'qr_kategoriler' then
    hedef_menu := coalesce(new.menu_id, old.menu_id);
  else
    select k.menu_id into hedef_menu from public.qr_kategoriler k where k.id = coalesce(new.kategori_id, old.kategori_id);
  end if;
  select * into m from public.qr_menuler where id = hedef_menu;
  if found and public.qr_menu_suresi_dolmus(m) then
    raise exception 'Abonelik süreniz doldu. Menünüzü düzenlemek için ödemenizi yapın.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists qr_kategori_abonelik_koru on public.qr_kategoriler;
create trigger qr_kategori_abonelik_koru before insert or update or delete on public.qr_kategoriler
  for each row execute function public.qr_icerik_abonelik_koru();
drop trigger if exists qr_urun_abonelik_koru on public.qr_urunler;
create trigger qr_urun_abonelik_koru before insert or update or delete on public.qr_urunler
  for each row execute function public.qr_icerik_abonelik_koru();

commit;
select tgname from pg_trigger where tgname like 'qr_%abonelik_koru' order by 1;
