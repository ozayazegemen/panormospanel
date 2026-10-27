-- Panormos paneli: Muhasebe Apsiyon mantığı, 2. adım (27.10.2026)
--   * Bankadaki gerçek bakiye (ekstre yüklenince kendiliğinden ya da elle) → Özet'te "kasa ↔ banka farkı"
--   * Otomatik aylık borçlandırma: her müşteriye anlaşma gününde aylık borç (client_invoices.otomatik = true);
--     o ayın gerçek faturası yüklenince otomatik borç kendiliğinden kalkar.
-- finans-kurulum.sql'den sonra çalıştırılır. Bir adım hata verirse hiçbir değişiklik uygulanmaz. Tekrar çalıştırmak zararsızdır.

begin;

alter table public.bank_accounts add column if not exists banka_bakiyesi numeric;
alter table public.bank_accounts add column if not exists banka_bakiye_tarihi date;

alter table public.client_invoices add column if not exists otomatik boolean not null default false;

-- Müşteri başına otomatik borçlandırma kuralı (client_id, clients.id ile aynı türde kurulur)
do $$
declare tur text;
begin
  select case when data_type = 'USER-DEFINED' then udt_name else data_type end into tur
  from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'id';
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'fin_borclandirma') then
    execute format('create table public.fin_borclandirma (
      id bigserial primary key,
      client_id %s not null unique,
      aktif boolean not null default true,
      tutar numeric not null,            -- aylık borç (KDV dahil)
      gun integer not null default 1 check (gun between 1 and 28),
      baslangic date not null,           -- ilk borçlandırma günü
      bitis date,
      created_at timestamptz not null default now()
    )', tur);
  end if;
end $$;

alter table public.fin_borclandirma enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fin_borclandirma' and policyname = 'yalniz_yonetici') then
    create policy yalniz_yonetici on public.fin_borclandirma for all to authenticated using (public.panel_yoneticisi()) with check (public.panel_yoneticisi());
  end if;
end $$;

commit;
