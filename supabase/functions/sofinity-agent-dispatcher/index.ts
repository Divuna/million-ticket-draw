import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ---------------------------------------------------------------------------
// VYŘAZENO (předstartovní audit, 29. 9. 2026).
//
// V produkci OneMil byla nasazená (v39, bez zdroje v GitHubu) verze funkce
// patřící projektu Sofinity: bez jakékoli autorizace (verify_jwt=false) volala
// OpenAI gpt-4o s libovolným promptem z požadavku a zapisovala do tabulek
// `AIRequests`, `Campaigns`, `EventLogs` a `Projects` — ty v databázi OneMil
// vůbec neexistují. V OneMil ji nic nevolá (frontend, Edge Functions,
// DB funkce, triggery ani crony — ověřeno v repu i v produkci).
//
// Aktuální integrace OneMil → Sofinity (event pipeline, přeposílání zpráv,
// `send_event_to_sofinity`, `sofinity-chat-callback`, `from_sofinity_message`)
// touto funkcí neprochází a tato změna se jí nedotýká. Endpoint proto nic
// nedělá, nevolá OpenAI ani databázi a vždy vrací 410 Gone.
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ success: false, error: "endpoint_retired" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
