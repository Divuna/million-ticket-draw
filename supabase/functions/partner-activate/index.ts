import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ status: "error", error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: "error", error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Support both "Bearer <key>" and raw key formats
    const apiKey = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ status: "error", error: "Invalid API key format" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let body: { reward_code?: string; external_order_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ status: "error", error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { reward_code, external_order_id } = body;

    if (!reward_code) {
      return new Response(
        JSON.stringify({ status: "error", error: "Missing reward_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Step 1: Resolve partner by API key
    const { data: partnerId, error: resolveError } = await supabaseAdmin.rpc(
      "resolve_partner_by_api_key",
      { p_key: apiKey }
    );

    if (resolveError || !partnerId) {
      console.error("API key resolution failed:", resolveError);
      return new Response(
        JSON.stringify({ status: "error", error: "Invalid or expired API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Get key_id for logging (query the key by hash match)
    const { data: keyData, error: keyError } = await supabaseAdmin
      .from("partner_api_keys")
      .select("id")
      .eq("partner_id", partnerId)
      .is("revoked_at", null)
      .limit(1)
      .single();

    if (keyError || !keyData) {
      console.error("Failed to get key_id:", keyError);
      return new Response(
        JSON.stringify({ status: "error", error: "API key lookup failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Call activate_partner_reward_sql
    const { data: activationResult, error: activationError } = await supabaseAdmin.rpc(
      "activate_partner_reward_sql",
      {
        p_api_key: apiKey,
        p_partner_id: partnerId,
        p_reward_code: reward_code,
      }
    );

    if (activationError) {
      console.error("Activation failed:", activationError);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          error: activationError.message || "Activation failed" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Log API key usage
    const { error: logError } = await supabaseAdmin.rpc(
      "log_partner_api_key_usage",
      {
        p_key_id: keyData.id,
        p_partner_id: partnerId,
      }
    );

    if (logError) {
      console.error("Failed to log API key usage:", logError);
      // Non-fatal error, continue with response
    }

    // Step 5: Parse activation result and return success response
    const result = typeof activationResult === "string" 
      ? JSON.parse(activationResult) 
      : activationResult;

    return new Response(
      JSON.stringify({
        status: "ok",
        coins: result?.coins ?? null,
        activation_id: result?.activation_id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ status: "error", error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
