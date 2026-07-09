import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ============================================================================
// sales-lead-inbound — příjem PŘÍCHOZÍCH odpovědí firem na sales lead e-maily.
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §18 (příjem odpovědí)
//
// Odpovědi chodí na adresu `reply+LEAD_ID@reply.onemil.cz` (dynamický reply_to
// nastavuje EF `send-sales-lead-email`). Resend inbound POSTuje sem parsovanou
// zprávu. Tato funkce:
//   1) ověří podpis webhooku (Svix schéma, secret SALES_LEAD_INBOUND_WEBHOOK_SECRET),
//   2) vytáhne LEAD_ID z adresy příjemce (`reply+<uuid>@…`),
//   3) dedup proti opakovanému doručení téhož webhooku (email_message_id),
//   4) zapíše aktivitu `reply_received` (inbound: subject, odesílatel, text),
//   5) zavolá service-role RPC `sales_lead_mark_replied` (posun na `odpovedel`
//      jen z raných/oslovovacích stavů; jinak stav beze změny).
//
// AI NIKDY neodesílá e-mail — tato funkce jen PŘIJÍMÁ odpovědi a nikdy nic
// neodesílá. Zápis přes service_role (obchází RLS). Nedotýká se wallets/
// payments/contests/tickets/winners/Stripe/buy_ticket_atomic/email_queue.
//
// config.toml: verify_jwt = false (autorizace = ověření podpisu webhooku uvnitř).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Svix / Resend webhook podpis (HMAC-SHA256, base64) ──────────────────────
// signedContent = `${svix_id}.${svix_timestamp}.${rawBody}`
// secret: `whsec_<base64>` → HMAC klíč = base64-decode části po `whsec_`.
// svix-signature: mezerami oddělené položky `v1,<base64sig>` — stačí jedna shoda.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretBytes = Uint8Array.from(
    atob(secret.startsWith("whsec_") ? secret.slice(6) : secret),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Kterákoli z podepsaných verzí smí sedět.
  for (const part of svixSignature.split(" ")) {
    const [, value] = part.split(",");
    if (value && timingSafeEqual(value, expected)) return true;
  }
  return false;
}

// Vytáhne LEAD_ID (uuid) z jakékoli `reply+<uuid>@…` adresy v poli hodnot.
function extractLeadId(candidates: string[]): string | null {
  const re = /reply\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;
  for (const c of candidates) {
    const m = re.exec(c ?? "");
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// Normalizuje pole příjemců z různých tvarů Resend payloadu na plain stringy.
function toAddressList(v: unknown): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return String(o.address ?? o.email ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("SALES_LEAD_INBOUND_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    // Řízený stav — bez secretu nic nezpracujeme.
    return jsonResponse({ success: false, error: "inbound_not_configured" }, 503);
  }

  // Raw body MUSÍME číst před parsováním (podpis se počítá z raw těla).
  const rawBody = await req.text();

  // ── 1. Ověření podpisu webhooku ──────────────────────────────────────────
  const valid = await verifySvixSignature(rawBody, req.headers, secret);
  if (!valid) {
    return jsonResponse({ success: false, error: "invalid_signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  // Resend obaluje užitečná data do `data`; podpoříme i plochý tvar.
  const data = (payload.data ?? payload) as Record<string, unknown>;

  // ── 2. LEAD_ID z adresy příjemce ─────────────────────────────────────────
  const recipients = [
    ...toAddressList(data.to),
    ...toAddressList(data.recipient),
    ...toAddressList((data as Record<string, unknown>).cc),
  ];
  const leadId = extractLeadId(recipients);
  if (!leadId) {
    // Není to odpověď na lead (žádná reply+<uuid> adresa) — přijmeme, ignorujeme.
    return jsonResponse({ success: true, ignored: true, reason: "no_lead_token" });
  }

  const fromList = toAddressList(data.from);
  const fromAddr = (fromList[0] ?? "").trim();
  const subject = typeof data.subject === "string" ? data.subject : null;
  const textBody =
    typeof data.text === "string"
      ? data.text
      : typeof data.html === "string"
      ? data.html
      : null;

  // Vlastní Message-ID příchozí zprávy (dedup). Fallback na svix-id webhooku.
  const headersObj = (data.headers ?? {}) as Record<string, unknown>;
  const inboundMessageId =
    (typeof (data as Record<string, unknown>).message_id === "string"
      ? ((data as Record<string, unknown>).message_id as string)
      : null) ??
    (typeof headersObj["message-id"] === "string" ? (headersObj["message-id"] as string) : null) ??
    (typeof headersObj["Message-ID"] === "string" ? (headersObj["Message-ID"] as string) : null) ??
    req.headers.get("svix-id");

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // ── 3. Ověření existence leadu ───────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("sales_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return jsonResponse({ success: false, error: "lead_lookup_failed" }, 500);
  if (!lead) {
    // Token nesedí na žádný lead — přijmeme, ale nic nezapisujeme.
    return jsonResponse({ success: true, ignored: true, reason: "lead_not_found" });
  }

  // ── 4. Dedup proti opakovanému webhooku ──────────────────────────────────
  if (inboundMessageId) {
    const { data: existing } = await supabaseAdmin
      .from("sales_lead_activities")
      .select("id")
      .eq("lead_id", leadId)
      .eq("activity_type", "reply_received")
      .eq("email_message_id", inboundMessageId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ success: true, duplicate: true, lead_id: leadId });
    }
  }

  // ── 5. Zápis aktivity reply_received ─────────────────────────────────────
  const { error: insertErr } = await supabaseAdmin.from("sales_lead_activities").insert({
    lead_id: leadId,
    activity_type: "reply_received",
    direction: "inbound",
    subject,
    body_snapshot: textBody,
    email_message_id: inboundMessageId,
    performed_by: null,
    metadata: { from: fromAddr, to: `reply+${leadId}@reply.onemil.cz` },
  });
  if (insertErr) return jsonResponse({ success: false, error: "activity_insert_failed" }, 500);

  // ── 6. Best-effort posun stavu na `odpovedel` ────────────────────────────
  // Odpověď je už zapsaná — pokud posun stavu selže, přijetí NEVRACÍME zpět.
  let statusChanged: unknown = null;
  try {
    const { data: rpcRes } = await supabaseAdmin.rpc("sales_lead_mark_replied", {
      p_lead_id: leadId,
      p_performed_by: null,
    });
    statusChanged = rpcRes;
  } catch {
    // best-effort — aktivita reply_received zůstává zdrojem pravdy
  }

  return jsonResponse({ success: true, lead_id: leadId, status: statusChanged });
});
