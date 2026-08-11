// Denní vstup externího agenta (Magin) pro přípravu a aktivaci jedné dávky
// prvních obchodních e-mailů.
//
// Bezpečnostní hranice:
// - Autorizace je vlastní sdílený secret SALES_LEAD_BATCH_AGENT_SECRET v hlavičce
//   Authorization: Bearer. Agent NIKDY nedostane service-role klíč ani přihlášení
//   admina; service-role klíč zůstává jen uvnitř této funkce.
// - Agent posílá POUZE datum a požadovaný počet. Skupinu (e-shopy), šablonu,
//   výběr leadů i všechny kontroly způsobilosti určuje server v RPC
//   sales_lead_email_batch_agent_run().
// - Funkce sama NEODESÍLÁ e-maily a nevolá Resend. Rozesílání a rozložení do okna
//   08:30–16:30 Europe/Prague dělá výhradně existující worker.
// - Idempotence na den je v databázi. Opakované volání pro stejné datum vrátí
//   existující dávku a druhou nevytvoří.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const MIN_SECRET_LENGTH = 32;
const MAX_REQUESTED_COUNT = 90;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Stejný vzor jako sales-lead-work-intake: délka napřed, pak porovnání hashů
// v konstantním čase, aby odpověď neprozradila prefix secretu.
async function authorized(request: Request): Promise<boolean> {
  const configured = Deno.env.get("SALES_LEAD_BATCH_AGENT_SECRET") ?? "";
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (configured.length < MIN_SECRET_LENGTH || supplied.length !== configured.length) return false;
  const [a, b] = await Promise.all([sha256(configured), sha256(supplied)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!await authorized(request)) return json({ error: "unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);

  const payload = body as Record<string, unknown>;
  const allowedKeys = ["schema_version", "target_date", "requested_count"];
  if (!Object.keys(payload).every((key) => allowedKeys.includes(key))) {
    return json({ error: "unexpected_field" }, 400);
  }
  if (payload.schema_version !== 1) return json({ error: "unsupported_schema_version" }, 400);
  if (!isIsoDate(payload.target_date)) return json({ error: "invalid_target_date" }, 400);

  const requestedCount = payload.requested_count;
  if (
    typeof requestedCount !== "number"
    || !Number.isInteger(requestedCount)
    || requestedCount < 1
    || requestedCount > MAX_REQUESTED_COUNT
  ) {
    return json({ error: "invalid_requested_count" }, 400);
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data, error } = await client.rpc("sales_lead_email_batch_agent_run", {
    p_scheduled_date: payload.target_date,
    p_requested_count: requestedCount,
  });

  if (error) {
    // Nikdy nevracet detail databázové chyby ani cokoli, co by mohlo nést secret.
    console.error("sales_lead_email_batch_agent_run failed", { code: error.code });
    return json({ error: "batch_agent_run_failed" }, 502);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.success !== true) return json({ ...result, success: false }, 409);
  return json(result, 200);
});
