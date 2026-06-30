import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kmxhsyjtyukrxrzoowag.supabase.co'
const supabaseAnonKey = 'sb_publishable_8FkJ2hortwsLn57lLZMEwQ_vS29JgwT'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
