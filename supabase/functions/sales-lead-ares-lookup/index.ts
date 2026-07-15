import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { aresByIco } from "../_shared/companyRegistryEnrich.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "missing_authorization_header" }, 401);
    }
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.slice("Bearer ".length).trim(),
    );
    const caller = userData?.user;
    if (userError || !caller) {
      return jsonResponse({ success: false, error: "invalid_authorization_token" }, 401);
    }

    const { data: canManage, error: permissionError } = await supabaseAdmin.rpc("has_admin_permission", {
      check_key: "sales_leads.manage",
      check_user_id: caller.id,
    });
    if (permissionError || canManage !== true) {
      return jsonResponse({ success: false, error: "access_denied_sales_leads_manage_only" }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ success: false, error: "invalid_json" }, 400);
    }

    const ico = typeof body.ico === "string" ? body.ico.trim() : "";
    if (!/^\d{8}$/.test(ico)) {
      return jsonResponse({
        success: false,
        error: "invalid_ico_format",
        message: "IČO musí obsahovat přesně 8 číslic",
      }, 422);
    }

    const company = await aresByIco(ico);
    if (!company) {
      return jsonResponse({
        success: false,
        error: "ares_not_found",
        message: "Firma nebyla v ARES nalezena",
      }, 404);
    }

    return jsonResponse({
      success: true,
      company_name: company.legalName,
      ico: company.ico,
      dic: company.dic,
      address: company.address,
      city: company.city,
    });
  } catch {
    return jsonResponse({ success: false, error: "ares_lookup_failed" }, 503);
  }
});
