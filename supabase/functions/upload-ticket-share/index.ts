import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deprecated privacy tombstone.
//
// Publicly uploaded winner images created an overwrite and unbounded-storage
// surface. Sharing now uses the fixed-content og-ticket-share renderer with an
// opaque UUID, so this endpoint never accepts bytes or accesses privileged
// credentials, storage, or database state.
serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "This upload endpoint is no longer available." }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
