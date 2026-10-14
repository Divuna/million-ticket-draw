import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ---------------------------------------------------------------------------
// VYŘAZENO (předstartovní audit, 29. 9. 2026).
//
// Původní funkce byla veřejná (verify_jwt=false, bez vlastní autorizace),
// používala service-role klíč a s `upsert: true` nahrávala PNG do veřejného
// bucketu `ticket-shares` pod klíčem `<ticketId>.png` — stejným, jaký používá
// `upload-ticket-share` pro legitimní sdílecí obrázky. Kdokoli tak mohl přepsat
// sdílecí obrázek cizího tiketu textem podle své volby.
//
// Aplikace ji nikde nevolá (frontend, Edge Functions, DB funkce, triggery ani
// crony — ověřeno v repu i v produkci). Sdílení tiketu řeší `upload-ticket-share`
// (vyžaduje JWT) a náhledy `og-ticket-share`. Endpoint proto nic nedělá,
// nesahá do storage ani databáze a vždy vrací 410 Gone.
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
