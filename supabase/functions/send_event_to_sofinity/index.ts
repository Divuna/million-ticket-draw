import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(async (req) => {
  try {
    const internalToken = req.headers.get("x-internal-token");
    const expectedToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");

    if (!internalToken || internalToken !== expectedToken) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    const url = Deno.env.get("SOFINITY_API_URL");
    const key = Deno.env.get("SOFINITY_API_KEY");

    const res = await fetch(`${url}/sofinity-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
