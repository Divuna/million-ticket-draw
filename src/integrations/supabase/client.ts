import { createClient } from "@supabase/supabase-js";

// ---------- KONSTANTY PRO LOVABLE ----------
// V Lovable nepoužívej VITE_* proměnné. Použij přímo URL a ANON KEY projektu.
// Viz system context: project id xkzhjldrojjlrkezorey
const supabaseUrl = "https://xkzhjldrojjlrkezorey.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";

// ---------- VYTVOŘENÍ KLIENTA ----------
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---------- DEBUG - ZPŘÍSTUPNĚNÍ PRO KONZOLI ----------
if (typeof window !== "undefined") {
  console.log("🔌 Supabase client injected into window");
  (window as any).supabase = supabase;
}
