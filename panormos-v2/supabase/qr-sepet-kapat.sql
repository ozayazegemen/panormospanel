-- QR Menü: sepet / WhatsApp siparişi kaldırıldı (Egemen, 21.10.2026). Demolara sipariş için eklenen WhatsApp numarası da geri alındı.
update public.qr_menuler set whatsapp_siparis = false;
update public.qr_menuler set whatsapp = '' where slug in ('cafe', 'burger', 'lokanta');
select slug, whatsapp, whatsapp_siparis from public.qr_menuler order by slug;
