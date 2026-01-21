import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Chybí autorizace" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify admin status
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is admin
    const { data: userData, error: userError } = await supabaseUser
      .from("users")
      .select("id, role")
      .single();

    if (userError || !userData || !["admin", "superadmin"].includes(userData.role)) {
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

    // Create service role client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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
