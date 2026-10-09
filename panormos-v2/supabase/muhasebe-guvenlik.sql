-- Panormos paneli: muhasebe tablolarını dışarıya kapatır.
-- Sonuç: bu tabloları yalnızca panele giriş yapmış YÖNETİCİ okuyup değiştirebilir.
-- Giriş yapmamış kişiler ve yönetici olmayan çalışanlar hiçbir satır göremez.
-- Bir adım hata verirse hiçbir değişiklik uygulanmaz.

begin;

-- Kilit: giriş hesabı bağlı bir yönetici yoksa dur (kendimizi dışarıda bırakmayalım)
do $$
begin
  if not exists (select 1 from public.staff where is_admin = true and auth_id is not null and deleted_at is null) then
    raise exception 'Giriş hesabı bağlı bir yönetici bulunamadı; hiçbir değişiklik yapılmadı.';
  end if;
end $$;

-- Giriş yapan kişi yönetici mi?
create or replace function public.panel_yoneticisi() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff
    where auth_id::text = auth.uid()::text and is_admin = true and deleted_at is null
  );
$$;
revoke all on function public.panel_yoneticisi() from public, anon;
grant execute on function public.panel_yoneticisi() to authenticated;

-- Her muhasebe tablosunda: eski erişim kurallarını kaldır, yalnızca yöneticiye izin ver
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'client_payments', 'client_invoices', 'company_expenses', 'company_incomes',
    'accounting_entries', 'accounting_documents', 'staff_leave'
  ] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy muhasebe_yalniz_yonetici on public.%I for all to authenticated using (public.panel_yoneticisi()) with check (public.panel_yoneticisi())', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

commit;
