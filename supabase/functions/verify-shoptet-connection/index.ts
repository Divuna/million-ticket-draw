import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getSupabaseSecretKey } from "../_shared/supabaseSecretKey.ts";
import { snapshotShoptetExport } from "../_shared/shoptetExportSnapshot.ts";

// Partner si sám ověří Shoptet napojení PŘED jeho aktivací — část C issue #289.
//
// Co funkce dělá:
//   1. ZNEPLATNÍ předchozí ověření (razítko i předběžnou baseline),
//   2. stáhne export z PENDING Vault klíče odeslaného požadavku,
//   3. zkontroluje dostupnost, povinné hlavičky a použitelnost řádků,
//   4. uloží nalezená čísla objednávek jako PŘEDBĚŽNOU baseline (NEAKTIVNÍ),
//   5. orazítkuje `verified_at` — teprve pak smí admin napojení schválit.
//
// ⚠️ Tohle je předběžný dry-run, ne pořízení závazné historie. Mezi ověřením a
// schválením může v e-shopu přibýt další objednávka, takže ZÁVAZNOU baseline
// pořizuje až `approve-shoptet-connection` vlastním čerstvým snímkem exportu.
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

  // ── 5. Zneplatnění předchozího ověření ─────────────────────────────────────
  // MUSÍ proběhnout dřív, než se cokoli zkusí. Kdyby se `verified_at` mazalo až
  // v neúspěšných větvích, každý předčasný `return` (nedostupný export, chyba
  // Vaultu) by nechal viset staré razítko z dřívějšího úspěšného pokusu a admin
  // by napojení schválil nad exportem, který se mezitím rozbil.
  const invalidate = await admin
    .from("shoptet_connection_requests")
    .update({ verified_at: null, verified_order_count: null })
    .eq("id", requestId)
    .eq("partner_id", partner.id)
    .eq("status", "submitted");
  if (invalidate.error) {
    console.error("verify invalidate:", invalidate.error.message);
    return err(500, "verify_error", "Ověření se nepodařilo spustit.");
  }
  const wipe = await admin
    .from("shoptet_connection_baseline_orders")
    .delete()
    .eq("request_id", requestId);
  if (wipe.error) {
    console.error("baseline wipe:", wipe.error.message);
    return err(500, "baseline_error", "Ověření se nepodařilo spustit.");
  }

  /** Neúspěch. `verified_at` je už zneplatněné, takže žádost není schvalitelná. */
  const notVerified = (snapshot: {
    reachable: boolean;
    httpStatus: number | null;
    headersOk: boolean;
    missingHeaders: string[];
    rowsTotal: number;
    rowsValid: number;
    rowsInvalid: number;
    reason: string | null;
  }) =>
    ok({
      success: true,
      request_id: requestId,
      verified: false,
      export_reachable: snapshot.reachable,
      http_status: snapshot.httpStatus,
      headers_ok: snapshot.headersOk,
      missing_headers: snapshot.missingHeaders,
      rows_total: snapshot.rowsTotal,
      rows_valid: snapshot.rowsValid,
      rows_invalid: snapshot.rowsInvalid,
      baseline_orders: 0,
      reason: snapshot.reason,
    });

  // ── 6. Snímek exportu ──────────────────────────────────────────────────────
  const { data: url, error: urlErr } = await admin.rpc("get_shoptet_pending_url", {
    p_request_id: requestId,
  });
  if (urlErr || !url || typeof url !== "string") {
    // Chyba se loguje bez URL — v logu smí být jen důvod.
    console.error("pending url unavailable:", urlErr?.message ?? "empty");
    return err(400, "export_url_unavailable", "Uložený exportní odkaz se nepodařilo načíst.");
  }

  const snapshot = await snapshotShoptetExport(url);
  if (!snapshot.usable) {
    return notVerified({
      reachable: snapshot.reachable,
      httpStatus: snapshot.httpStatus,
      headersOk: snapshot.headersOk,
      missingHeaders: snapshot.missingHeaders,
      rowsTotal: snapshot.rowsTotal,
      rowsValid: snapshot.rowsValid,
      rowsInvalid: snapshot.rowsInvalid,
      reason: snapshot.reason,
    });
  }

  // ── 7. Předběžná baseline ──────────────────────────────────────────────────
  // Je to jen náhled pro partnera. ZÁVAZNOU baseline pořizuje až schválení
  // vlastním, čerstvým snímkem — mezi ověřením a schválením může v e-shopu
  // přibýt další objednávka a ta by jinak zůstala mimo historii.
  //
  // `activated_at` zůstává NULL, takže tahle sada nikdy nic neblokuje.
  const baselineRows = snapshot.orderIds.map((orderId) => ({
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
      await admin.from("shoptet_connection_baseline_orders").delete().eq("request_id", requestId);
      return err(500, "baseline_error", "Ověření se nepodařilo dokončit.");
    }
  }

  // Razítko až úplně nakonec — do téhle chvíle je žádost neschvalitelná.
  const { error: stampErr } = await admin
    .from("shoptet_connection_requests")
    .update({
      verified_at: new Date().toISOString(),
      verified_order_count: snapshot.orderIds.length,
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
    http_status: snapshot.httpStatus,
    headers_ok: true,
    missing_headers: [],
    rows_total: snapshot.rowsTotal,
    rows_valid: snapshot.rowsValid,
    rows_invalid: 0,
    baseline_orders: snapshot.orderIds.length,
    reason: null,
  });
});
