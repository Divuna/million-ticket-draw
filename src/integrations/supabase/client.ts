import { createClient } from '@supabase/supabase-js'
import { createMonitoredFetch } from '@/lib/monitoring'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'onemil-auth'
  },
  global: {
    fetch: createMonitoredFetch(supabaseUrl),
  },
})
