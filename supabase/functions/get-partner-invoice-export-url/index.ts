import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INVOICE_BUCKET = "partner-invoices";
const SIGNED_URL_TTL_SECONDS = 15 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function tokenFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { export_id?: string; invoice_id?: string; format?: string };
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ error: "invalid_json" }, 400);
  }

  const token = tokenFrom(req);
  if (!token) return json({ error: "missing_authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "invalid_authorization_token" }, 401);
  const userId = userData.user.id;

  let exportQuery = supabase
    .from("partner_invoice_exports")
    .select("id, invoice_id, format, storage_bucket, storage_path, created_at")
    .eq("storage_bucket", INVOICE_BUCKET)
    .not("storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (payload.export_id) {
    exportQuery = exportQuery.eq("id", payload.export_id);
  } else if (payload.invoice_id) {
    exportQuery = exportQuery.eq("invoice_id", payload.invoice_id).eq("format", payload.format ?? "pdf");
  } else {
    return json({ error: "missing_export_id_or_invoice_id" }, 400);
  }

  const { data: exportRow, error: exportError } = await exportQuery.maybeSingle();
  if (exportError) return json({ error: "export_lookup_failed" }, 500);
  if (!exportRow?.storage_path || exportRow.storage_bucket !== INVOICE_BUCKET) {
    return json({ error: "invoice_export_not_found" }, 404);
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("partner_invoices")
    .select("id, partner_id")
    .eq("id", exportRow.invoice_id)
    .maybeSingle();
  if (invoiceError) return json({ error: "invoice_lookup_failed" }, 500);
  if (!invoice) return json({ error: "invoice_not_found" }, 404);

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "superadmin"]);
  if (roleError) return json({ error: "role_lookup_failed" }, 500);
  const isAdmin = (roleRows ?? []).length > 0;

  if (!isAdmin) {
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id, auth_user_id")
      .eq("id", invoice.partner_id)
      .maybeSingle();
    if (partnerError) return json({ error: "partner_lookup_failed" }, 500);
    if (!partner || partner.auth_user_id !== userId) return json({ error: "access_denied" }, 403);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(exportRow.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) return json({ error: "signed_url_failed" }, 500);

  return json({
    success: true,
    signed_url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
    export_id: exportRow.id,
    invoice_id: exportRow.invoice_id,
    format: exportRow.format,
  });
});
