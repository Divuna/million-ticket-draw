import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const CONFIRMATION_TEXT =
  "Váš dotaz jsem předal podpoře. Ta vás bude co nejdříve kontaktovat a pomůže vám s řešením."

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json(405, { error: "Method not allowed" })

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Missing Supabase env" })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  })
  const {
    data: { user },
    error: authErr,
  } = await authClient.auth.getUser()
  if (authErr || !user) return json(401, { error: "Unauthorized" })

  let originalText = ""
  try {
    const body = (await req.json()) as { originalText?: unknown; message?: unknown }
    if (typeof body.message === "string") {
      originalText = body.message.trim()
    } else {
      originalText = typeof body.originalText === "string" ? body.originalText.trim() : ""
    }
  } catch {
    originalText = ""
  }

  const nowIso = new Date().toISOString()
  const msg = originalText || "Uživatel chce kontaktovat podporu."
  const adminContent = `SUPPORT REQUEST
User: ${user.id}
Time: ${nowIso}

User message:
"${msg}"`

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Best-effort dedupe: if the last two messages already match, do nothing.
  const { data: lastRows } = await adminClient
    .from("messages")
    .select("id, sender, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(4)

  const last = Array.isArray(lastRows) ? lastRows : []
  const already =
    last.length >= 2 &&
    last[0]?.sender === "ai" &&
    typeof last[0]?.content === "string" &&
    last[0].content.includes(CONFIRMATION_TEXT) &&
    last[1]?.sender === "admin" &&
    last[1]?.content === adminContent

  if (already) {
    return json(200, { success: true, deduped: true })
  }

  const { error: adminErr } = await adminClient.from("messages").insert({
    user_id: user.id,
    sender: "admin",
    content: adminContent,
    read: false,
  })
  if (adminErr) return json(500, { error: adminErr.message })

  const aiContent = JSON.stringify({ text: CONFIRMATION_TEXT })
  const { error: aiErr } = await adminClient.from("messages").insert({
    user_id: user.id,
    sender: "ai",
    content: aiContent,
    read: false,
  })
  if (aiErr) return json(500, { error: aiErr.message })

  return json(200, { success: true })
})

