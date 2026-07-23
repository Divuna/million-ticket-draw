const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: false,
      disabled: true,
      sent: 0,
      message: "This reminder is no longer used.",
    }),
    { status: 410, headers: corsHeaders },
  );
});
