import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Chybí autorizace" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service-role client for all privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user identity
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Chybí autorizace" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin via user_roles (canonical role source)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError || !roleData || !["admin", "superadmin"].includes(roleData.role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Nedostatečná oprávnění" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { partner_id } = await req.json();

    if (!partner_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Chybí partner_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify partner exists and is approved
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .select("id, status, name")
      .eq("id", partner_id)
      .single();

    if (partnerError || !partner) {
      return new Response(
        JSON.stringify({ success: false, error: "Partner nenalezen" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (partner.status !== "approved") {
      return new Response(
        JSON.stringify({ success: false, error: "Partner musí být schválen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Revoke all existing active keys for this partner
    const { error: revokeError } = await supabaseAdmin
      .from("partner_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("partner_id", partner_id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("Error revoking keys:", revokeError);
      return new Response(
        JSON.stringify({ success: false, error: "Nepodařilo se zneplatnit existující klíče" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Generate new API key via RPC
    const { data: keyData, error: keyError } = await supabaseAdmin.rpc(
      "generate_partner_api_key",
      { p_partner_id: partner_id }
    );

    if (keyError || !keyData || keyData.length === 0) {
      console.error("Error generating key:", keyError);
      return new Response(
        JSON.stringify({ success: false, error: "Nepodařilo se vygenerovat nový klíč" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the new API key (shown only once)
    return new Response(
      JSON.stringify({
        success: true,
        api_key: keyData[0].api_key,
        key_prefix: keyData[0].key_prefix,
        created_at: keyData[0].created_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Rotation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Interní chyba serveru" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
