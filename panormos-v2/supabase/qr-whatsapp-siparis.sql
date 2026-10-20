-- QR Menü: WhatsApp'tan sipariş (sepet) ayarı; demolarda açık (siparişler Panormos'un WhatsApp'ına gelir). Bar demosu kapalı (alkol).
alter table public.qr_menuler add column if not exists whatsapp_siparis boolean not null default false;
update public.qr_menuler set whatsapp = '0536 471 60 12', whatsapp_siparis = true where slug in ('cafe', 'burger', 'lokanta', 'restoran');
select slug, whatsapp, whatsapp_siparis from public.qr_menuler where slug in ('restoran', 'cafe', 'burger', 'lokanta', 'bar') order by slug;
