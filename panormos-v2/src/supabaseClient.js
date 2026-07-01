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
