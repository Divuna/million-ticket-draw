import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (!internalToken || req.headers.get("x-internal-token") !== internalToken) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: corsHeaders },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      disabled: true,
      sent: 0,
      skipped: 0,
      message: "This reminder is no longer used.",
    }),
    { status: 200, headers: corsHeaders },
  );
});
