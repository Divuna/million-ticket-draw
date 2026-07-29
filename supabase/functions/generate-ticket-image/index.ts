import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Deprecated privacy tombstone. The old implementation wrote caller-selected
// share objects with a privileged storage client. Public sharing is now served
// by the read-only, fixed-content og-ticket-share renderer.
serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "This image generation endpoint is no longer available." }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
