import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

export function serveLegacyGone(functionName: string): void {
  serve((req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        error: `${functionName} is disabled`,
        message: "This legacy test/debug/Sofinity endpoint is no longer available.",
      }),
      {
        status: 410,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  });
}
