import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: jsonHeaders,
  });
}

function jsonSuccess(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ success: true, ...body }), {
    status: 200,
    headers: jsonHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("missing_session", 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return jsonError("missing_session", 401);
    }

    let body: { password?: string };
    try {
      body = await req.json();
    } catch {
      return jsonError("invalid_request", 400);
    }

    if (!body.password) {
      return jsonError("password_required", 400);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
      email: user.email!,
      password: body.password,
    });

    if (signInError) {
      return jsonError("invalid_password", 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Partner-side rotation is intentionally scoped to the logged-in partner.
    // Do not accept partner_id from the client; derive it from auth_user_id.
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .select("id, status")
      .eq("auth_user_id", user.id)
      .single();

    if (partnerError || !partner) {
      return jsonError("partner_link_missing", 404);
    }

    if (partner.status !== "approved") {
      return jsonError("partner_not_approved", 403);
    }

    const { error: revokeError } = await supabaseAdmin
      .from("partner_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("partner_id", partner.id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("partner_api_key_revoke_failed", revokeError);
      return jsonError("key_rotation_failed", 500);
    }

    const { data: keyData, error: keyError } = await supabaseAdmin.rpc(
      "generate_partner_api_key",
      { p_partner_id: partner.id },
    );

    if (keyError || !keyData || keyData.length === 0) {
      console.error("partner_api_key_generation_failed", keyError);
      return jsonError("key_generation_failed", 500);
    }

    return jsonSuccess({
      api_key: keyData[0].api_key,
      key_prefix: keyData[0].key_prefix,
      created_at: keyData[0].created_at,
    });
  } catch (error) {
    console.error("partner_api_key_rotation_unexpected_error", error);
    return jsonError("key_rotation_failed", 500);
  }
});
