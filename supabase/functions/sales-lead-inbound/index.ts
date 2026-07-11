import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.17.2";

// ============================================================================
// sales-lead-inbound — příjem PŘÍCHOZÍCH odpovědí firem na sales lead e-maily.
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §18 (příjem odpovědí)
//
// Odpovědi chodí na `reply+LEAD_ID@ulduuzoul.resend.app` (bezplatná Resend
// receiving doména; per-lead reply_to nastavuje EF `send-sales-lead-email`).
// Resend pošle webhook `email.received`, který obsahuje JEN METADATA — nikoli
// tělo zprávy. Tělo se musí dotáhnout z Receiving API přes `data.email_id`.
//
// Tok:
//   1) ověří podpis webhooku (Svix, secret SALES_LEAD_INBOUND_WEBHOOK_SECRET),
//   2) vytáhne LEAD_ID z adresy příjemce (`reply+<uuid>@…`),
//   3) dedup proti opakovanému doručení téhož webhooku (message_id / email_id),
//   4) přes RESEND_RECEIVING_API_KEY načte celý e-mail:
//      resend.emails.receiving.get(email_id),
//   5) zapíše aktivitu `reply_received` (text, fallback html, subject, from),
//   6) zavolá service-role RPC `sales_lead_mark_replied` (posun na `odpovedel`
//      jen z raných/oslovovacích stavů; jinak stav beze změny).
//
// Dedup se vyhodnocuje PŘED voláním Resendu, takže replay webhooku nestojí
// žádný API request. Tvrdá pojistka je unikátní index na
// (lead_id, email_message_id) WHERE activity_type='reply_received'.
//
// Klíče jsou ZÁMĚRNĚ oddělené (least privilege):
//   • RESEND_API_KEY            = sending_access — jen odesílací funkce
//     (`send-sales-lead-email`, `process-email-queue`, …). Tato funkce ho nečte.
//   • RESEND_RECEIVING_API_KEY  = full_access    — jen tato funkce; čtení
//     přijatého e-mailu (`GET /emails/receiving/{id}`) je read operace, kterou
//     sending_access klíč neumí.
//
// Tato funkce NIKDY neodesílá e-mail — pouze přijímá a čte. Zápis přes
// service_role (obchází RLS). Nedotýká se wallets/payments/contests/tickets/
// winners/Stripe/buy_ticket_atomic/email_queue.
//
// config.toml: verify_jwt = false (autorizace = ověření podpisu webhooku uvnitř).
// ============================================================================

const REPLY_INBOUND_DOMAIN = "ulduuzoul.resend.app";

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

// Normalizuje pole adres z různých tvarů Resend payloadu na plain stringy.
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

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Bezpečné logování selhání Receiving API.
// Loguje POUZE identifikátory a chybový kód/status/zprávu z Resendu.
// NIKDY nesmí zalogovat API klíč, hlavičky, tělo e-mailu ani celý payload —
// proto se z chyby vytahují jen vyjmenovaná skalární pole.
function logReceivingFailure(emailId: string, leadId: string, err: unknown): void {
  let name: string | null = null;
  let message: string | null = null;
  let statusCode: number | null = null;

  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    name = asString(e.name);
    message = asString(e.message);
    if (typeof e.statusCode === "number") statusCode = e.statusCode;
  } else if (typeof err === "string") {
    message = err;
  }

  console.error(
    "sales-lead-inbound receiving_api_access_failed",
    JSON.stringify({
      lead_id: leadId,
      email_id: emailId,
      resend_error_name: name,
      resend_error_message: message,
      resend_status_code: statusCode,
    }),
  );
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

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Doručovací události od stejného, už nakonfigurovaného Resend webhooku.
  // Původní email_sent snapshot zůstává beze změny; přidává se auditní aktivita.
  const eventType = asString(payload.type);
  const deliveryTypes: Record<string,string> = {
    "email.delivered":"email_delivered", "email.delivery_delayed":"email_delivery_delayed",
    "email.bounced":"email_bounced", "email.failed":"email_failed", "email.suppressed":"email_suppressed",
  };
  if (eventType && deliveryTypes[eventType]) {
    const eventData=(payload.data??{}) as Record<string,unknown>;
    const outboundId=asString(eventData.email_id);
    if (!outboundId) return jsonResponse({success:true,ignored:true,reason:"missing_email_id"});
    const {data:sent}=await supabaseAdmin.from("sales_lead_activities").select("lead_id,subject,body_snapshot").eq("activity_type","email_sent").eq("email_message_id",outboundId).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (!sent) return jsonResponse({success:true,ignored:true,reason:"email_not_linked"});
    const eventKey=req.headers.get("svix-id")??`${eventType}:${outboundId}`;
    const {data:seen}=await supabaseAdmin.from("sales_lead_activities").select("id").eq("activity_type",deliveryTypes[eventType]).eq("email_message_id",eventKey).maybeSingle();
    if (seen) return jsonResponse({success:true,duplicate:true});
    const {error}=await supabaseAdmin.from("sales_lead_activities").insert({lead_id:sent.lead_id,activity_type:deliveryTypes[eventType],direction:"internal",subject:sent.subject,body_snapshot:sent.body_snapshot,email_message_id:eventKey,metadata:{event_type:eventType,event_id:eventKey,email_id:outboundId,message_id:eventData.message_id??null,created_at:payload.created_at??null,to:eventData.to??null,from:eventData.from??null}});
    if (error) return jsonResponse({success:false,error:"activity_insert_failed"},500);
    if (["email.bounced","email.failed","email.suppressed"].includes(eventType)) await supabaseAdmin.from("sales_leads").update({next_action_at:null}).eq("id",sent.lead_id);
    return jsonResponse({success:true,lead_id:sent.lead_id});
  }
  if (eventType && eventType !== "email.received") {
    return jsonResponse({ success: true, ignored: true, reason: "unsupported_event_type" });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;

  const emailId = asString(data.email_id);
  if (!emailId) {
    // Webhook přijmeme (ať Resend neretryuje), ale nemáme co načíst.
    return jsonResponse({ success: true, ignored: true, reason: "missing_email_id" });
  }

  // ── 2. LEAD_ID z adresy příjemce (webhook metadata už `to` obsahují) ─────
  const recipients = [
    ...toAddressList(data.to),
    ...toAddressList(data.received_for),
    ...toAddressList(data.cc),
  ];
  const leadId = extractLeadId(recipients);
  if (!leadId) {
    // Není to odpověď na lead (žádná reply+<uuid> adresa) — přijmeme, ignorujeme.
    return jsonResponse({ success: true, ignored: true, reason: "no_lead_token" });
  }

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

  // ── 4. Dedup PŘED voláním Resendu (replay webhooku nestojí API request) ──
  // Stejný klíč se použije i při INSERTu, aby seděl s unikátním indexem.
  const dedupKey = asString(data.message_id) ?? emailId;
  const { data: existing } = await supabaseAdmin
    .from("sales_lead_activities")
    .select("id")
    .eq("lead_id", leadId)
    .eq("activity_type", "reply_received")
    .eq("email_message_id", dedupKey)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return jsonResponse({ success: true, duplicate: true, lead_id: leadId });
  }

  // ── 5. Načtení celého e-mailu z Resend Receiving API ─────────────────────
  // Webhook `email.received` neobsahuje tělo — jen metadata.
  //
  // ⚠️ Čtení přijatého e-mailu (`GET /emails/receiving/{id}`) vyžaduje Resend
  // klíč s oprávněním `full_access`. Odesílací klíč `RESEND_API_KEY` je záměrně
  // `sending_access` (least privilege) a tuto operaci NEUMÍ. Proto má inbound
  // vlastní secret `RESEND_RECEIVING_API_KEY` — nikdy nesahat na `RESEND_API_KEY`.
  const receivingApiKey = Deno.env.get("RESEND_RECEIVING_API_KEY");
  if (!receivingApiKey) {
    // Řízený stav — nic nezapisujeme, Resend webhook zopakuje.
    return jsonResponse({ success: false, error: "receiving_api_not_configured" }, 503);
  }

  let received: Record<string, unknown>;
  try {
    const resend = new Resend(receivingApiKey);
    const res = await resend.emails.receiving.get(emailId);
    if (res.error || !res.data) {
      // Bezpečné logování: jen název/zpráva chyby a status. NIKDY API klíč,
      // hlavičky, tělo e-mailu ani obsah odpovědi.
      logReceivingFailure(emailId, leadId, res.error);
      return jsonResponse({ success: false, error: "receiving_api_access_failed" }, 502);
    }
    received = res.data as unknown as Record<string, unknown>;
  } catch (err) {
    logReceivingFailure(emailId, leadId, err);
    return jsonResponse({ success: false, error: "receiving_api_access_failed" }, 502);
  }

  // Tělo: text, při jeho absenci fallback html.
  const textBody = asString(received.text) ?? asString(received.html);
  const subject = asString(received.subject) ?? asString(data.subject);
  const fromAddr = (toAddressList(received.from)[0] ?? toAddressList(data.from)[0] ?? "").trim();
  const rfcMessageId = asString(received.message_id);

  // ── 6. Zápis aktivity reply_received ─────────────────────────────────────
  const { error: insertErr } = await supabaseAdmin.from("sales_lead_activities").insert({
    lead_id: leadId,
    activity_type: "reply_received",
    direction: "inbound",
    subject,
    body_snapshot: textBody,
    email_message_id: dedupKey,
    performed_by: null,
    metadata: {
      from: fromAddr,
      to: `reply+${leadId}@${REPLY_INBOUND_DOMAIN}`,
      email_id: emailId,
      message_id: rfcMessageId,
    },
  });
  if (insertErr) {
    // Souběžný retry téhož webhooku → DB-level unikátní index (Postgres 23505).
    if (insertErr.code === "23505") {
      return jsonResponse({ success: true, duplicate: true, lead_id: leadId });
    }
    return jsonResponse({ success: false, error: "activity_insert_failed" }, 500);
  }

  // ── 7. Best-effort posun stavu na `odpovedel` ────────────────────────────
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
