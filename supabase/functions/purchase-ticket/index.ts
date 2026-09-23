import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ---------------------------------------------------------------------------
// VYŘAZENO (Fáze 1, 23. 9. 2026).
//
// Tato funkce dřív kupovala samotný tiket přes buy_ticket_atomic. Od nasazení
// garantovaných nákupních benefitů je jediná zákaznická cesta
// `purchase_guaranteed_benefit_bundle_atomic` (benefit + tiket zdarma v jedné
// transakci) a migrace 20260922143000 odebrala roli `authenticated` právo volat
// buy_ticket_atomic. Endpoint proto už nic nekupuje, nesahá do databáze a vždy
// vrací 410 Gone — aby nemohl sloužit jako obchvat garantovaného benefitu.
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
    JSON.stringify({
      success: false,
      error: "endpoint_retired",
      message:
        "Samostatný nákup tiketu už není dostupný. Tiket se získává zdarma k garantovanému nákupnímu benefitu.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
