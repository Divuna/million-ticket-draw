import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sofinity-key, x-signature, x-timestamp, x-idempotency-key, x-internal-token",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({ ok: true, noop: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
