import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getSupabaseSecretKey } from "../_shared/supabaseSecretKey.ts";
import { decodeCsvBody } from "../import-shoptet-orders/encoding.ts";
import { parseShoptetCsv } from "../import-shoptet-orders/csv.ts";

// Partner si sám ověří Shoptet napojení PŘED jeho aktivací — část C issue #289.
//
// Co funkce dělá:
//   1. stáhne export z PENDING Vault klíče odeslaného požadavku,
//   2. zkontroluje dostupnost, povinné hlavičky a použitelnost řádků,
//   3. zapíše čísla nalezených objednávek jako baseline (zatím NEAKTIVNÍ),
//   4. orazítkuje `verified_at` — teprve pak smí admin napojení schválit.
//
// Co funkce NIKDY nedělá (jádro schváleného zadání):
//   - nevydá MioCoiny, nevytvoří `partner_reward_codes` řádek,
//   - neodešle ani nezařadí zákaznický e-mail,
//   - nevytvoří fakturační položku,
//   - nevrací zákaznické osobní údaje (e-mail, jméno, částku),
//   - nevrací ani neloguje exportní URL, její hash ani jiný secret.
// Jediné, co zapisuje, jsou baseline čísla objednávek a `verified_at`.
//
// Vydávání odměn zůstává výhradně v `import-shoptet-orders`; tahle funkce
// nevolá `create_partner_order_reward` ani `schedule_shoptet_partner_reward_status`.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = getSupabaseSecretKey();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function err(status: number, code: string, msg: string): Response {
  return new Response(JSON.stringify({ success: false, error: code, message: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Povinné hlavičky přeložené do řeči partnera. Klíče drží `parseShoptetCsv`. */
const HEADER_LABELS: Record<string, string> = {
  order_code: "číslo objednávky",
  total: "celková cena objednávky",
  email: "e-mail zákazníka",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "method_not_allowed", "POST required");

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return err(401, "missing_authorization", "Authorization Bearer required");
  }
  const token = authHeader.slice(7);

  const admin = createClient(SUPABASE_URL, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return err(401, "invalid_token", "Invalid or expired authorization token");

  // ── 2. Partner ─────────────────────────────────────────────────────────────
  const { data: partner, error: partnerErr } = await admin
    .from("partners")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (partnerErr) {
    console.error("partner lookup:", partnerErr.message);
    return err(500, "internal_error", "Internal error");
  }
  if (!partner) return err(403, "not_partner", "Caller does not have a partner account");

  // ── 3. Vstup ───────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_json", "Request body must be valid JSON");
  }
  const requestId = body.request_id;
  if (!requestId || typeof requestId !== "string") {
    return err(400, "missing_request_id", "request_id is required");
  }
  if (!UUID_RE.test(requestId)) {
    return err(400, "invalid_request_id", "request_id must be a valid UUID");
  }

  // ── 4. Vlastní odeslaný požadavek na PRVNÍ napojení ────────────────────────
  // Jen `initial`: změna URL (`url_change`) běží nad už živým napojením, kde
  // baseline nedává smysl a kde by se nesmělo měnit chování existujícího
  // partnera. Jen `submitted`: bez odeslané URL není co stahovat.
  const { data: scr, error: scrErr } = await admin
    .from("shoptet_connection_requests")
    .select("id, partner_id, status, request_kind, url_received")
    .eq("id", requestId)
    .eq("partner_id", partner.id)
    .eq("status", "submitted")
    .eq("request_kind", "initial")
    .eq("url_received", true)
    .maybeSingle();
  if (scrErr) {
    console.error("scr lookup:", scrErr.message);
    return err(500, "internal_error", "Internal error");
  }
  if (!scr) {
    return err(404, "request_not_verifiable", "No submitted initial connection request found");
  }

  // ── 5. Stažení exportu z Vaultu ────────────────────────────────────────────
  const { data: url, error: urlErr } = await admin.rpc("get_shoptet_pending_url", {
    p_request_id: requestId,
  });
  if (urlErr || !url || typeof url !== "string") {
    // Chyba se loguje bez URL — v logu smí být jen důvod.
    console.error("pending url unavailable:", urlErr?.message ?? "empty");
    return err(400, "export_url_unavailable", "Uložený exportní odkaz se nepodařilo načíst.");
  }

  let resp: Response;
  try {
    resp = await fetch(url, { redirect: "follow" });
  } catch (fetchErr) {
    console.warn("export fetch failed:", (fetchErr as Error).name);
    return ok({
      success: true,
      request_id: requestId,
      verified: false,
      export_reachable: false,
      // Bez HTTP stavu — spojení vůbec nevzniklo.
      http_status: null,
      headers_ok: false,
      missing_headers: [],
      rows_total: 0,
      rows_valid: 0,
      rows_invalid: 0,
      baseline_orders: 0,
      reason: "export_unreachable",
    });
  }

  if (!resp.ok) {
    return ok({
      success: true,
      request_id: requestId,
      verified: false,
      export_reachable: false,
      http_status: resp.status,
      headers_ok: false,
      missing_headers: [],
      rows_total: 0,
      rows_valid: 0,
      rows_invalid: 0,
      baseline_orders: 0,
      reason: "export_http_error",
    });
  }

  // ── 6. Kontrola obsahu ─────────────────────────────────────────────────────
  const text = decodeCsvBody(await resp.arrayBuffer(), resp.headers.get("content-type"));
  const parsed = parseShoptetCsv(text);

  const isEmpty = parsed.missingHeaders.length === 1 && parsed.missingHeaders[0] === "empty_csv";
  if (isEmpty) {
    return ok({
      success: true,
      request_id: requestId,
      verified: false,
      export_reachable: true,
      http_status: resp.status,
      headers_ok: false,
      missing_headers: [],
      rows_total: 0,
      rows_valid: 0,
      rows_invalid: 0,
      baseline_orders: 0,
      reason: "export_empty",
    });
  }

  if (parsed.missingHeaders.length > 0) {
    return ok({
      success: true,
      request_id: requestId,
      verified: false,
      export_reachable: true,
      http_status: resp.status,
      headers_ok: false,
      // Jen názvy chybějících polí, nic z obsahu exportu.
      missing_headers: parsed.missingHeaders.map((h) => HEADER_LABELS[h] ?? h),
      rows_total: parsed.dataRowCount,
      rows_valid: 0,
      rows_invalid: parsed.dataRowCount,
      baseline_orders: 0,
      reason: "missing_headers",
    });
  }

  const rowsValid = parsed.orders.length;
  const rowsInvalid = parsed.invalidRows.length;

  // Prázdný nebo celý nevalidní export se nesmí prohlásit za ověřený —
  // aktivace nad ním by pustila do provozu napojení, které nic nedodává.
  if (rowsValid === 0) {
    return ok({
      success: true,
      request_id: requestId,
      verified: false,
      export_reachable: true,
      http_status: resp.status,
      headers_ok: true,
      missing_headers: [],
      rows_total: parsed.dataRowCount,
      rows_valid: 0,
      rows_invalid: rowsInvalid,
      baseline_orders: 0,
      reason: "no_usable_rows",
    });
  }

  // ── 7. Baseline ────────────────────────────────────────────────────────────
  // Opakované ověření musí baseline přepsat, ne k němu přisypat — jinak by v ní
  // uvízly objednávky ze staršího, mezitím opraveného exportu.
  const { error: wipeErr } = await admin
    .from("shoptet_connection_baseline_orders")
    .delete()
    .eq("request_id", requestId);
  if (wipeErr) {
    console.error("baseline wipe:", wipeErr.message);
    return err(500, "baseline_error", "Ověření se nepodařilo dokončit.");
  }

  // Ukládá se VÝHRADNĚ číslo objednávky. `activated_at` zůstává NULL — baseline
  // začne platit teprve schválením napojení.
  const uniqueOrderIds = [...new Set(parsed.orders.map((o) => o.orderId))];
  const baselineRows = uniqueOrderIds.map((orderId) => ({
    request_id: requestId,
    partner_id: partner.id,
    external_order_id: orderId,
  }));

  for (let i = 0; i < baselineRows.length; i += 500) {
    const { error: insErr } = await admin
      .from("shoptet_connection_baseline_orders")
      .insert(baselineRows.slice(i, i + 500));
    if (insErr) {
      console.error("baseline insert:", insErr.message);
      // Nedokončená baseline nesmí projít jako ověření — jinak by se aktivace
      // otevřela nad neúplným seznamem historických objednávek.
      await admin.from("shoptet_connection_baseline_orders").delete().eq("request_id", requestId);
      return err(500, "baseline_error", "Ověření se nepodařilo dokončit.");
    }
  }

  const { error: stampErr } = await admin
    .from("shoptet_connection_requests")
    .update({
      verified_at: new Date().toISOString(),
      verified_order_count: uniqueOrderIds.length,
    })
    .eq("id", requestId)
    .eq("partner_id", partner.id)
    .eq("status", "submitted"); // race guard
  if (stampErr) {
    console.error("verify stamp:", stampErr.message);
    await admin.from("shoptet_connection_baseline_orders").delete().eq("request_id", requestId);
    return err(500, "verify_error", "Ověření se nepodařilo dokončit.");
  }

  return ok({
    success: true,
    request_id: requestId,
    verified: true,
    export_reachable: true,
    http_status: resp.status,
    headers_ok: true,
    missing_headers: [],
    rows_total: parsed.dataRowCount,
    rows_valid: rowsValid,
    rows_invalid: rowsInvalid,
    baseline_orders: uniqueOrderIds.length,
    reason: null,
  });
});
