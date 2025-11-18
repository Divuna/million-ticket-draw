import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://rrmvxsldrjgbdxluklka.supabase.co"; // ✅ správné pro OneMil
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJybXZ4c2xkcmpnYmR4bHVrbGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDE1OTUsImV4cCI6MjA3MzQxNzU5NX0.y5YDPFP7l5VbkhY27ihny8wT2bwnOcuqfDsJvRAmw4o";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
