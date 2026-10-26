-- ============================================================
-- VETERİNER MARKET — çiftlik hayvanları düzeni (26.10.2026)
-- Ürünler büyükbaş / küçükbaş / kanatlı hayvanlara göre; ilaçlar sepete eklenmez (online_satis = false), WhatsApp / telefonla sorulur.
-- veteriner-kurulum.sql'den sonra bir kez çalıştırılır; yeniden çalıştırmak zarar vermez.
-- ============================================================
alter table public.vet_urunler add column if not exists hayvanlar text[] not null default '{}';
alter table public.vet_urunler add column if not exists online_satis boolean not null default false;
alter table public.vet_urunler alter column fiyat drop not null;
alter table public.vet_urunler alter column kategori set default 'ilac';

-- Sipariş: yalnızca online satışı açık ve fiyatı olan ürünler
create or replace function public.vet_siparis_ver(p_ad text, p_telefon text, p_adres text, p_odeme text, p_not text, p_sepet jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  a public.vet_ayarlar;
  kalem jsonb;
  u public.vet_urunler;
  adet integer;
  kalemler jsonb := '[]'::jsonb;
  ara numeric(10,2) := 0;
  kargo numeric(10,2);
  yeni_id bigint;
begin
  if coalesce(trim(p_ad), '') = '' or coalesce(trim(p_telefon), '') = '' or coalesce(trim(p_adres), '') = '' then
    raise exception 'Ad, telefon ve adres zorunludur.';
  end if;
  if p_odeme not in ('havale', 'kapida', 'whatsapp') then raise exception 'Geçersiz ödeme yöntemi.'; end if;
  if jsonb_typeof(p_sepet) <> 'array' or jsonb_array_length(p_sepet) = 0 or jsonb_array_length(p_sepet) > 50 then
    raise exception 'Sepet boş.';
  end if;
  select * into a from public.vet_ayarlar where id = 1;
  if p_odeme = 'kapida' and not a.kapida_odeme then raise exception 'Kapıda ödeme şu an kapalı.'; end if;
  for kalem in select * from jsonb_array_elements(p_sepet) loop
    adet := greatest(1, least(99, coalesce((kalem->>'adet')::integer, 1)));
    select * into u from public.vet_urunler where id = (kalem->>'id')::bigint and aktif = true;
    if not found then raise exception 'Sepetteki bir ürün artık satışta değil.'; end if;
    if not u.online_satis or u.fiyat is null then raise exception '"%" online satılmıyor; bilgi için bizi arayın.', u.ad; end if;
    if u.stok is not null and u.stok < adet then raise exception '"%" için yeterli stok yok.', u.ad; end if;
    kalemler := kalemler || jsonb_build_object('id', u.id, 'ad', u.ad, 'fiyat', u.fiyat, 'adet', adet, 'tutar', u.fiyat * adet);
    ara := ara + u.fiyat * adet;
  end loop;
  kargo := case when a.bedava_kargo_siniri > 0 and ara >= a.bedava_kargo_siniri then 0 else a.kargo_ucreti end;
  insert into public.vet_siparisler (ad, telefon, adres, odeme, kalemler, ara_toplam, kargo, toplam, musteri_notu)
    values (left(trim(p_ad), 120), left(trim(p_telefon), 30), left(trim(p_adres), 500), p_odeme, kalemler, ara, kargo, ara + kargo, left(coalesce(p_not, ''), 500))
    returning id into yeni_id;
  update public.vet_urunler v set stok = v.stok - (k->>'adet')::integer
    from jsonb_array_elements(kalemler) k where v.id = (k->>'id')::bigint and v.stok is not null;
  return json_build_object('no', yeni_id, 'ara_toplam', ara, 'kargo', kargo, 'toplam', ara + kargo, 'kalemler', kalemler);
end $$;
revoke all on function public.vet_siparis_ver(text, text, text, text, text, jsonb) from public;
grant execute on function public.vet_siparis_ver(text, text, text, text, text, jsonb) to anon, authenticated;
