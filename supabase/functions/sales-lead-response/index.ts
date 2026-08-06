import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const PUBLIC_PAGE_URL = "https://onemil.cz/partner-response.html";
const ALLOWED_ORIGINS = new Set([
  "https://onemil.cz",
  "https://www.onemil.cz",
  "http://localhost:5173",
  "http://localhost:8080",
]);
const ALLOWED_PROJECT_REFS = new Set([
  "dxmowysntemfqfnanxua",
  "xkzhjldrojjlrkezorey",
]);

type Action = "interest" | "decline";

type SubmitResult = {
  success?: boolean;
  error?: string;
  action?: Action;
  idempotent_replay?: boolean;
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function validToken(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function validAction(value: string): value is Action {
  return value === "interest" || value === "decline";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getProjectRef(): string | null {
  const rawUrl = Deno.env.get("SUPABASE_URL") ?? "";
  try {
    const hostname = new URL(rawUrl).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    const projectRef = match?.[1]?.toLowerCase() ?? "";
    return ALLOWED_PROJECT_REFS.has(projectRef) ? projectRef : null;
  } catch {
    return null;
  }
}

function redirectToPublicPage(
  req: Request,
  token: string,
  action: Action,
): Response {
  const projectRef = getProjectRef();
  if (!projectRef) {
    return jsonResponse(req, { success: false, error: "project_not_allowed" }, 503);
  }
  const target = new URL(PUBLIC_PAGE_URL);
  target.searchParams.set("project", projectRef);
  target.searchParams.set("token", token);
  target.searchParams.set("action", action);
  return new Response(null, {
    status: 302,
    headers: {
      "Location": target.toString(),
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = await req.json().catch(() => ({}));
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, String(value)]),
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const result: Record<string, string> = {};
  for (const key of ["token", "action", "name", "phone"]) {
    const value = form.get(key);
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, { success: false, error: "method_not_allowed" }, 405, {
      "Allow": "GET, POST, OPTIONS",
    });
  }

  const client = getClient();
  if (!client) {
    return jsonResponse(req, { success: false, error: "service_unavailable" }, 503);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") ?? "").trim().toLowerCase();
    const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();
    const wantsJson =
      url.searchParams.get("format") === "json"
      || (req.headers.get("accept") ?? "").includes("application/json");

    if (!validToken(token) || !validAction(action)) {
      return jsonResponse(req, { success: false, error: "invalid_token" }, 404);
    }

    // Direct e-mail links are redirected to the public OneMil page because
    // hosted Supabase Edge Functions rewrite GET text/html responses to text/plain.
    if (!wantsJson) {
      return redirectToPublicPage(req, token, action);
    }

    const tokenHash = await sha256Hex(token);
    const { data, error } = await client
      .from("sales_lead_email_response_tokens")
      .select("status,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) {
      return jsonResponse(req, { success: false, error: "invalid_token" }, 404);
    }
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      return jsonResponse(req, { success: false, error: "expired_token" }, 410);
    }
    if (!["pending", "interested", "declined"].includes(data.status)) {
      return jsonResponse(req, { success: false, error: "response_unavailable" }, 409);
    }

    // GET is intentionally read-only. It never calls the submit RPC.
    return jsonResponse(req, {
      success: true,
      status: data.status,
      action,
      expires_at: data.expires_at,
    });
  }

  const body = await readBody(req);
  const token = (body.token ?? "").trim().toLowerCase();
  const action = (body.action ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();

  if (!validToken(token) || !validAction(action)) {
    return jsonResponse(req, { success: false, error: "invalid_token" }, 404);
  }

  const tokenHash = await sha256Hex(token);
  const { data, error } = await client.rpc("sales_lead_email_response_submit", {
    p_token_hash: tokenHash,
    p_action: action,
    p_name: action === "interest" ? name : null,
    p_phone: action === "interest" ? phone : null,
  });
  const result = (data ?? {}) as SubmitResult;

  if (error || result.success !== true) {
    const code = result.error ?? "submit_failed";
    const status = code === "expired_token"
      ? 410
      : code === "invalid_token"
      ? 404
      : code === "response_already_recorded" || code === "lead_not_actionable"
      ? 409
      : code === "invalid_name" || code === "invalid_phone" || code === "invalid_action"
      ? 400
      : 500;
    return jsonResponse(req, { success: false, error: code }, status);
  }

  return jsonResponse(req, {
    success: true,
    action: result.action ?? action,
    idempotent_replay: result.idempotent_replay === true,
  });
});
