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

/**
 * Edge functions that check INTERNAL_FUNCTION_TOKEN expect header `x-internal-token`.
 * Set VITE_INTERNAL_FUNCTION_TOKEN in .env to the same value as the Supabase secret INTERNAL_FUNCTION_TOKEN.
 */
export function withEdgeInternalToken(headers: Record<string, string>): Record<string, string> {
  const token = import.meta.env.VITE_INTERNAL_FUNCTION_TOKEN
  if (!token) return headers
  return { ...headers, 'x-internal-token': token }
}
