-- Panormos paneli: veritabanını dışarıya kapatır. (muhasebe-guvenlik.sql'in yerini alır, onu da kapsar.)
--
-- Sonuç:
--   * Giriş yapmamış kişiler hiçbir tabloyu okuyamaz, değiştiremez.
--   * Kendi kendine hesap açan ama çalışan listesinde olmayan kişiler de hiçbir şey göremez.
--   * Muhasebe tabloları ve e-posta kutusu yalnızca YÖNETİCİYE açıktır.
--   * Çalışan kayıtlarını yalnızca yönetici / "Çalışan Yönetimi" yetkisi olan değiştirir;
--     yönetici yetkisini yalnızca yönetici verebilir.
--   * Şifre belirleme işlevi artık dışarıdan çağrılamaz.
-- Bir adım hata verirse hiçbir değişiklik uygulanmaz. Tekrar çalıştırmak zararsızdır.

begin;

-- Kilit: giriş hesabı bağlı bir yönetici yoksa dur (kendimizi dışarıda bırakmayalım)
do $$
begin
  if not exists (select 1 from public.staff where is_admin = true and auth_id is not null and deleted_at is null) then
    raise exception 'Giriş hesabı bağlı bir yönetici bulunamadı; hiçbir değişiklik yapılmadı.';
  end if;
end $$;

-- ───────────── 1) Yardımcı işlevler ─────────────

-- Giriş yapan kişi aktif bir çalışan mı?
create or replace function public.panel_uyesi() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where auth_id = auth.uid() and deleted_at is null);
$$;

-- Giriş yapan kişi yönetici mi?
create or replace function public.panel_yoneticisi() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where auth_id = auth.uid() and is_admin = true and deleted_at is null);
$$;

-- Giriş yapan kişi çalışan yönetebilir mi? (yönetici ya da "Çalışan Yönetimi" yetkisi)
create or replace function public.panel_calisan_yonetir() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where auth_id = auth.uid() and deleted_at is null and (is_admin = true or perm_manage_staff = true));
$$;

-- Kayıt ekranı: bu e-posta yöneticinin eklediği bir çalışana mı ait? (yalnızca evet/hayır döner)
create or replace function public.panel_eposta_kayitli(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(trim(p_email), '') <> ''
     and exists (select 1 from public.staff where lower(email) = lower(trim(p_email)) and deleted_at is null);
$$;

-- Giriş sonrası: oturumu çalışan kaydına bağlar ve kaydı döndürür (çalışan değilse null)
create or replace function public.panel_hesap_bagla() returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  r public.staff;
begin
  if v_uid is null then return null; end if;
  select * into r from public.staff where auth_id = v_uid and deleted_at is null limit 1;
  if found then return to_json(r); end if;

  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null or v_email = '' then return null; end if;

  update public.staff s set auth_id = v_uid
   where s.id = (
     select st.id from public.staff st
      where lower(st.email) = v_email and st.deleted_at is null
        and (st.auth_id is null or not exists (select 1 from auth.users u where u.id = st.auth_id))
      limit 1)
  returning * into r;
  if found then return to_json(r); end if;
  return null;
end;
$$;

-- Şifre belirleme: yalnızca yönetici / çalışan yöneticisi çağırabilir, yalnızca kayıtlı çalışanlar için
create or replace function public.create_staff_login(staff_email text, staff_password text)
returns json language plpgsql security definer
set search_path to 'public', 'auth', 'extensions' as $function$
declare
  v_email text := lower(trim(staff_email));
  v_user_id uuid;
  v_existing uuid;
  v_target_admin boolean;
begin
  if not public.panel_calisan_yonetir() then
    raise exception 'Bu islem icin yetkiniz yok';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'E-posta bos olamaz';
  end if;
  if staff_password is null or length(staff_password) < 6 then
    raise exception 'Sifre en az 6 karakter olmali';
  end if;

  select bool_or(coalesce(is_admin, false)) into v_target_admin
    from public.staff where lower(email) = v_email and deleted_at is null;
  if v_target_admin is null then
    raise exception 'Bu e-posta ile kayitli calisan yok';
  end if;
  if v_target_admin and not public.panel_yoneticisi() then
    raise exception 'Yonetici hesabinin sifresini yalnizca yonetici degistirebilir';
  end if;

  select id into v_existing from auth.users where email = v_email;

  if v_existing is not null then
    update auth.users
      set encrypted_password = crypt(staff_password, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
    where id = v_existing;
    update public.staff set auth_id = v_existing where lower(email) = v_email;
    return json_build_object('status', 'updated', 'user_id', v_existing);
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(staff_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"email_verified": true}'::jsonb,
    '', '', '', '', ''
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_email, v_user_id,
    json_build_object('sub', v_user_id::text, 'email', v_email)::jsonb, 'email',
    now(), now(), now()
  );

  update public.staff set auth_id = v_user_id where lower(email) = v_email;

  return json_build_object('status', 'created', 'user_id', v_user_id);
end;
$function$;

-- Çalışan kayıtlarında yönetici yetkisinin korunması
create or replace function public.staff_yetki_korumasi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sunucu tarafı (SQL Editor, servis anahtarı) ve yönetici serbest
  if auth.uid() is null or public.panel_yoneticisi() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if coalesce(old.is_admin, false) then raise exception 'Yönetici kaydını yalnızca yönetici silebilir'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.is_admin, false) then
    raise exception 'Yönetici kaydını yalnızca yönetici değiştirebilir';
  end if;
  if coalesce(new.is_admin, false) then
    raise exception 'Yönetici yetkisini yalnızca yönetici verebilir';
  end if;
  return new;
end;
$$;
drop trigger if exists staff_yetki_korumasi on public.staff;
create trigger staff_yetki_korumasi before insert or update or delete on public.staff
  for each row execute function public.staff_yetki_korumasi();

-- İşlevleri kimler çağırabilir
revoke all on function public.panel_uyesi() from public, anon;
revoke all on function public.panel_yoneticisi() from public, anon;
revoke all on function public.panel_calisan_yonetir() from public, anon;
revoke all on function public.panel_hesap_bagla() from public, anon;
revoke all on function public.panel_eposta_kayitli(text) from public;
revoke all on function public.create_staff_login(text, text) from public, anon;
revoke all on function public.staff_yetki_korumasi() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.panel_uyesi() to authenticated;
grant execute on function public.panel_yoneticisi() to authenticated;
grant execute on function public.panel_calisan_yonetir() to authenticated;
grant execute on function public.panel_hesap_bagla() to authenticated;
grant execute on function public.panel_eposta_kayitli(text) to anon, authenticated;
grant execute on function public.create_staff_login(text, text) to authenticated;

-- ───────────── 2) Tablolar ─────────────
-- Her tabloda: eski kurallar kaldırılır, erişim denetimi açılır, yeni kural yazılır, girişsiz erişim kesilir.
do $$
declare
  t text;
  p record;
  yalniz_yonetici text[] := array[
    'client_payments', 'client_invoices', 'company_expenses', 'company_incomes',
    'accounting_entries', 'accounting_documents', 'staff_leave',
    'received_mails', 'mail_folders'
  ];
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);

    if t = 'integration_tokens' then
      null; -- kural yok: yalnızca sunucu (servis anahtarı) erişir
    elsif t = any (yalniz_yonetici) then
      execute format('create policy yalniz_yonetici on public.%I for all to authenticated using (public.panel_yoneticisi()) with check (public.panel_yoneticisi())', t);
    elsif t = 'staff' then
      create policy calisanlar_okur on public.staff for select to authenticated using (public.panel_uyesi());
      create policy calisan_yoneten_ekler on public.staff for insert to authenticated with check (public.panel_calisan_yonetir());
      create policy calisan_yoneten_gunceller on public.staff for update to authenticated using (public.panel_calisan_yonetir()) with check (public.panel_calisan_yonetir());
      create policy calisan_yoneten_siler on public.staff for delete to authenticated using (public.panel_calisan_yonetir());
    elsif t = 'sent_mails' then
      -- Çalışan müşteriye e-posta gönderince kayıt düşer; gönderilenler listesini yalnızca yönetici görür
      create policy calisan_kayit_dusur on public.sent_mails for insert to authenticated with check (public.panel_uyesi());
      create policy yonetici_okur on public.sent_mails for select to authenticated using (public.panel_yoneticisi());
      create policy yonetici_gunceller on public.sent_mails for update to authenticated using (public.panel_yoneticisi()) with check (public.panel_yoneticisi());
      create policy yonetici_siler on public.sent_mails for delete to authenticated using (public.panel_yoneticisi());
    else
      execute format('create policy panel_calisanlari on public.%I for all to authenticated using (public.panel_uyesi()) with check (public.panel_uyesi())', t);
    end if;
  end loop;
end $$;

-- İleride eklenecek tablolar da girişsiz erişime kapalı doğsun
alter default privileges in schema public revoke all on tables from anon;

-- ───────────── 3) Dosyalar ─────────────
drop policy if exists "client_media_public_read" on storage.objects;  -- girişsiz dosya listeleme
drop policy if exists "client_media_select" on storage.objects;
drop policy if exists "client_media_insert" on storage.objects;
drop policy if exists "client_media_update" on storage.objects;
drop policy if exists "client_media_delete" on storage.objects;
drop policy if exists "auth read mail attachments" on storage.objects;
drop policy if exists "panel_medya_okur" on storage.objects;
drop policy if exists "panel_medya_yukler" on storage.objects;
drop policy if exists "panel_medya_gunceller" on storage.objects;
drop policy if exists "panel_medya_siler" on storage.objects;
drop policy if exists "panel_eposta_eki_okur" on storage.objects;
drop policy if exists "panel_eposta_eki_siler" on storage.objects;

create policy "panel_medya_okur" on storage.objects for select to authenticated
  using (bucket_id = 'client-media' and public.panel_uyesi());
create policy "panel_medya_yukler" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-media' and public.panel_uyesi());
create policy "panel_medya_gunceller" on storage.objects for update to authenticated
  using (bucket_id = 'client-media' and public.panel_uyesi());
create policy "panel_medya_siler" on storage.objects for delete to authenticated
  using (bucket_id = 'client-media' and public.panel_uyesi());
create policy "panel_eposta_eki_okur" on storage.objects for select to authenticated
  using (bucket_id = 'mail-attachments' and public.panel_yoneticisi());
create policy "panel_eposta_eki_siler" on storage.objects for delete to authenticated
  using (bucket_id = 'mail-attachments' and public.panel_yoneticisi());

commit;
