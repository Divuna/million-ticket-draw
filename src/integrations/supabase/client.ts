import { createClient } from "@supabase/supabase-js";

// ---------- ENV PROMĚNNÉ ----------
// Musí být definované v .env souboru v projektu Lovable:
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

// ---------- VYTVOŘENÍ KLIENTA ----------
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---------- DEBUG - ZPŘÍSTUPNĚNÍ PRO KONZOLI ----------
if (typeof window !== "undefined") {
  console.log("🔌 Supabase client injected into window");
  (window as any).supabase = supabase;
}
