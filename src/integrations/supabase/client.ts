import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DEBUG
declare global {
  interface Window {
    supabase: typeof supabase;
  }
}

if (typeof window !== "undefined") {
  window.supabase = supabase;
}
