import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kmxhsyjtyukrxrzoowag.supabase.co'
const supabaseAnonKey = 'sb_publishable_8FkJ2hortwsLn57lLZMEwQ_vS29JgwT'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Oturumu sessionStorage'da tut: sekme/tarayıcı kapanınca otomatik silinir.
    // Sayfa yenilemede (Cmd+R) oturum korunur, sadece sekme tamamen kapanınca çıkış olur.
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Günlük oturum: panel, giriş yapılan "iş günü" boyunca açık kalır (gün 04:00'te değişir).
export const LOGIN_DAY_STORE = "panormos_login_day";
export const loginDayKey = (d = new Date()) => { const x = new Date(d.getTime() - 4 * 60 * 60 * 1000); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
