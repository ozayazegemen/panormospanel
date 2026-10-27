-- Panormos paneli: Muhasebe > Finans / Raporlar / Tanımlar bölümleri (27.10.2026)
-- Apsiyon'un finans düzeni örnek alınarak eklenen tablolar. Hepsi yalnızca YÖNETİCİYE açıktır.
--   fin_kalemler          gelir / gider kalemleri ve grupları (Tanımlar)
--   fin_cariler           tedarikçiler (Tanımlar)
--   fin_gider_faturalari  tedarikçi gider faturaları (açık = vadeli, kapalı = peşin)
--   fin_odeme_plani       açık faturaların taksit / vade satırları
--   fin_tekrarlanan       her ay kendiliğinden açılan gider faturaları (kira, internet…)
--   fin_transferler       kasalar arası transfer / virman
-- bank_accounts'a nakit kasa türü ve açılış bakiyesi, bank_transactions'a eşleştirme alanı eklenir.
-- Bir adım hata verirse hiçbir değişiklik uygulanmaz. Tekrar çalıştırmak zararsızdır.

begin;

-- ───────────── Kasa ve banka hesapları ─────────────
alter table public.bank_accounts add column if not exists acilis_bakiye numeric not null default 0;
alter table public.bank_accounts add column if not exists acilis_tarihi date;
-- "kind" sütununda tür kısıtı varsa nakit kasayı da kabul edecek biçimde yeniden kurulur
do $$
declare k text;
begin
  for k in select conname from pg_constraint
           where conrelid = 'public.bank_accounts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.bank_accounts drop constraint %I', k);
  end loop;
  alter table public.bank_accounts add constraint bank_accounts_kind_check check (kind in ('banka', 'kredi_karti', 'nakit'));
end $$;

-- Banka hareketinin hangi kayıtla eşleştirildiği: 'odeme:<id>', 'plan:<id>', 'yok' (eşleşmeyecek) ya da boş
alter table public.bank_transactions add column if not exists eslesme text;

-- ───────────── Tanımlar ─────────────
create table if not exists public.fin_kalemler (
  id bigserial primary key,
  tur text not null check (tur in ('gelir', 'gider')),
  kod text,
  ad text not null,
  grup text,
  aciklama text,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_cariler (
  id bigserial primary key,
  kod text,
  ad text not null,
  vergi_dairesi text,
  vergi_no text,
  yetkili text,
  telefon text,
  eposta text,
  adres text,
  iban text,
  notlar text,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────── Gider faturaları ─────────────
create table if not exists public.fin_gider_faturalari (
  id bigserial primary key,
  tarih date not null,                       -- işlem tarihi
  belge_tarihi date,
  belge_no text,
  cari_id bigint references public.fin_cariler(id) on delete set null,
  odeme_tipi text not null default 'acik' check (odeme_tipi in ('acik', 'kapali')),
  kasa_id bigint,                            -- kapalı (peşin) faturada paranın çıktığı kasa
  stopaj_orani numeric not null default 0,
  kalemler jsonb not null default '[]'::jsonb, -- [{ kalem_id, aciklama, tutar }]
  toplam numeric not null default 0,
  aciklama text,
  tekrar_id bigint,                          -- tekrarlanan giderden açıldıysa
  donem text,                                -- tekrarlanan giderin ayı (YYYY-AA)
  created_at timestamptz not null default now()
);
create unique index if not exists fin_gider_tekrar_donem on public.fin_gider_faturalari (tekrar_id, donem) where tekrar_id is not null;

create table if not exists public.fin_odeme_plani (
  id bigserial primary key,
  fatura_id bigint not null references public.fin_gider_faturalari(id) on delete cascade,
  vade date not null,
  tutar numeric not null,
  aciklama text,
  odendi boolean not null default false,
  odeme_tarihi date,
  kasa_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_tekrarlanan (
  id bigserial primary key,
  ad text not null,
  cari_id bigint references public.fin_cariler(id) on delete set null,
  kalem_id bigint references public.fin_kalemler(id) on delete set null,
  tutar numeric not null,
  gun integer not null default 1 check (gun between 1 and 28),  -- her ayın kaçında açılır
  vade_gun integer not null default 0,                           -- açıldıktan kaç gün sonra ödenir
  baslangic date not null,
  bitis date,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_transferler (
  id bigserial primary key,
  tarih date not null,
  kaynak_id bigint not null,
  hedef_id bigint not null,
  tutar numeric not null check (tutar > 0),
  aciklama text,
  created_at timestamptz not null default now()
);

-- ───────────── Erişim: yalnızca yönetici ─────────────
do $$
declare t text;
begin
  foreach t in array array['fin_kalemler', 'fin_cariler', 'fin_gider_faturalari', 'fin_odeme_plani', 'fin_tekrarlanan', 'fin_transferler']
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'yalniz_yonetici') then
      execute format('create policy yalniz_yonetici on public.%I for all to authenticated using (public.panel_yoneticisi()) with check (public.panel_yoneticisi())', t);
    end if;
  end loop;
end $$;

-- ───────────── Başlangıç kalemleri (yalnızca tablo boşsa) ─────────────
insert into public.fin_kalemler (tur, kod, ad, grup)
select * from (values
  ('gider', 'G01', 'Ofis Kirası', 'Sabit Giderler'),
  ('gider', 'G02', 'Elektrik', 'Faturalar'),
  ('gider', 'G03', 'Su', 'Faturalar'),
  ('gider', 'G04', 'Doğalgaz', 'Faturalar'),
  ('gider', 'G05', 'İnternet / Telefon', 'Faturalar'),
  ('gider', 'G06', 'Yazılım / Abonelik', 'Yazılım ve Reklam'),
  ('gider', 'G07', 'Reklam Bütçesi', 'Yazılım ve Reklam'),
  ('gider', 'G08', 'Ekipman', 'Demirbaş'),
  ('gider', 'G09', 'Yakıt / Ulaşım', 'Operasyon'),
  ('gider', 'G10', 'Yemek', 'Operasyon'),
  ('gider', 'G11', 'Muhasebe / Mali Müşavir', 'Hizmet Alımları'),
  ('gider', 'G12', 'Dış Hizmet (serbest çalışan)', 'Hizmet Alımları'),
  ('gider', 'G13', 'Diğer Gider', 'Diğer'),
  ('gelir', 'M01', 'Aylık Hizmet Bedeli', 'Müşteri Gelirleri'),
  ('gelir', 'M02', 'Parça Başı İş', 'Müşteri Gelirleri'),
  ('gelir', 'M03', 'Çekim / Prodüksiyon', 'Müşteri Gelirleri'),
  ('gelir', 'M04', 'Diğer Gelir', 'Diğer')
) as v(tur, kod, ad, grup)
where not exists (select 1 from public.fin_kalemler);

commit;
