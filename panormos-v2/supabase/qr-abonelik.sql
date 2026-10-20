-- QR Menü aboneliği (21.10.2026): işletme kendisi kaydolur, 14 gün dener, aylık 249 / yıllık 2.490 TL + KDV öder.
-- Süre dolunca düzenleme kapanır; 7 gün içinde ödeme gelmezse menü kapanır.
-- abonelik_bitis boş olan menüler (Panormos'un kurup yönettikleri) süresizdir; bu kurallar onları etkilemez.
begin;

alter table public.qr_menuler add column if not exists abonelik_bitis date;
alter table public.qr_menuler add column if not exists abonelik_donem text not null default '';
alter table public.qr_menuler add column if not exists kendi_kaydi boolean not null default false;
alter table public.qr_menuler add column if not exists sahip_telefon text not null default '';
alter table public.qr_menuler add column if not exists kayit_ip text not null default '';

create table if not exists public.qr_odemeler (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.qr_menuler(id) on delete cascade,
  olusturan_id uuid,
  donem text not null check (donem in ('aylik', 'yillik')),
  tutar numeric(10, 2) not null,
  toplam numeric(10, 2) not null,
  yontem text not null check (yontem in ('kart', 'havale')),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi', 'basarisiz', 'reddedildi')),
  iyzico_token text,
  iyzico_odeme_no text,
  aciklama text not null default '',
  sozlesme_onay boolean not null default false,
  sozlesme_ip text,
  created_at timestamptz not null default now(),
  sonuc_tarihi timestamptz
);
create index if not exists qr_odemeler_menu on public.qr_odemeler (menu_id, created_at desc);
alter table public.qr_odemeler enable row level security;

-- Menü sahibi kendi ödemelerini görür ve yalnızca "havale bildirimi" ekleyebilir; onaylamak Panormos'a aittir
drop policy if exists qr_odeme_sahip_oku on public.qr_odemeler;
create policy qr_odeme_sahip_oku on public.qr_odemeler for select to authenticated
  using (exists (select 1 from public.qr_menuler m where m.id = menu_id and m.sahip_user_id = auth.uid()));
drop policy if exists qr_odeme_sahip_havale on public.qr_odemeler;
create policy qr_odeme_sahip_havale on public.qr_odemeler for insert to authenticated
  with check (yontem = 'havale' and durum = 'bekliyor' and olusturan_id = auth.uid()
    and exists (select 1 from public.qr_menuler m where m.id = menu_id and m.sahip_user_id = auth.uid()));
drop policy if exists qr_odeme_panel on public.qr_odemeler;
create policy qr_odeme_panel on public.qr_odemeler for all to authenticated
  using (public.panel_uyesi()) with check (public.panel_uyesi());

-- İşletme kendi menüsünü düzenleyebilir ama abonelik süresini, sahipliğini ve kayıt türünü değiştiremez
create or replace function public.qr_menu_abonelik_koru() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.abonelik_bitis is distinct from old.abonelik_bitis
      or new.abonelik_donem is distinct from old.abonelik_donem
      or new.kendi_kaydi is distinct from old.kendi_kaydi
      or new.sahip_user_id is distinct from old.sahip_user_id
      or new.kayit_ip is distinct from old.kayit_ip)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not public.panel_uyesi() then
    raise exception 'Abonelik bilgileri yalnızca Panormos Medya tarafından değiştirilebilir.';
  end if;
  return new;
end $$;
drop trigger if exists qr_menu_abonelik_koru on public.qr_menuler;
create trigger qr_menu_abonelik_koru before update on public.qr_menuler
  for each row execute function public.qr_menu_abonelik_koru();

commit;

select polname, cmd from (select policyname as polname, cmd from pg_policies where schemaname = 'public' and tablename in ('qr_menuler', 'qr_odemeler')) p order by 1;
