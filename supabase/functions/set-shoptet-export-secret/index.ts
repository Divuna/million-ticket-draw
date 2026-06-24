import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Superadmin-only: store a partner's Shoptet CSV export URL in Vault.
 * The URL is written via the SECURITY DEFINER RPC set_shoptet_export_secret
 * (service-role) and is NEVER returned, echoed, or logged. Only the secret
 * NAME is returned for confirmation.
 */
async function requireSuperadmin(req: Request, admin: ReturnType<typeof createClient>) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "missing_authorization" };
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return { status: 401, error: "invalid_authorization_token" };
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "superadmin")
    .maybeSingle();
  if (!roleRow) return { status: 403, error: "access_denied_superadmin_only" };
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authFailure = await requireSuperadmin(req, admin);
  if (authFailure) return json({ success: false, error: authFailure.error }, authFailure.status);

  let body: { partner_id?: string; export_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_json" }, 400);
  }

  const partnerId = (body.partner_id ?? "").trim();
  const exportUrl = (body.export_url ?? "").trim();
  if (!partnerId || !exportUrl) {
    return json({ success: false, error: "partner_id and export_url are required" }, 400);
  }
  // Basic shape guard only — never log the URL itself.
  if (!/^https:\/\//i.test(exportUrl)) {
    return json({ success: false, error: "export_url must be https" }, 400);
  }

  const { data, error } = await admin.rpc("set_shoptet_export_secret", {
    p_partner_id: partnerId,
    p_url: exportUrl,
  });
  if (error) {
    // Do not include the URL in error output.
    console.error("set_shoptet_export_secret failed:", error.message);
    return json({ success: false, error: "failed_to_store_secret" }, 400);
  }

  // Return only the secret NAME, never the URL.
  return json({ success: true, secret_name: data });
});
