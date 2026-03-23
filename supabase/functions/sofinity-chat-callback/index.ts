import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token, x-signature, x-timestamp",
};

type CallbackBody = {
  callback_id: string;
  user_id: string;
  content: string;
  fallback?: boolean;
  topic?: string | null;
  event?: string | null;
  private?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(message);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, msgData);
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isValidIsoDate(value: string | undefined | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
    const callbackSecret = Deno.env.get("SOFINITY_CALLBACK_SECRET") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: "Missing Supabase env" }, 500);
    }

    const rawBody = await req.text();
    const providedInternal = req.headers.get("x-internal-token") ?? "";
    const providedTimestamp = req.headers.get("x-timestamp") ?? "";
    const providedSignature = req.headers.get("x-signature") ?? "";

    let authorized = false;

    if (internalToken && providedInternal === internalToken) {
      authorized = true;
    } else if (callbackSecret && providedTimestamp && providedSignature) {
      const timestampMs = Number(providedTimestamp);
      if (!Number.isFinite(timestampMs)) {
        return jsonResponse({ success: false, error: "Invalid x-timestamp" }, 401);
      }

      const skewMs = Math.abs(Date.now() - timestampMs);
      if (skewMs > 5 * 60 * 1000) {
        return jsonResponse({ success: false, error: "Expired signature timestamp" }, 401);
      }

      const expected = await hmacSha256Hex(
        callbackSecret,
        `${providedTimestamp}.${rawBody}`,
      );
      authorized = timingSafeHexEqual(expected, providedSignature);
    }

    if (!authorized) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const body = JSON.parse(rawBody) as CallbackBody;
    if (!body || typeof body !== "object") {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    if (!body.callback_id || typeof body.callback_id !== "string") {
      return jsonResponse({ success: false, error: "Missing callback_id" }, 400);
    }

    if (!body.user_id || typeof body.user_id !== "string") {
      return jsonResponse({ success: false, error: "Missing user_id" }, 400);
    }

    if (!body.content || typeof body.content !== "string") {
      return jsonResponse({ success: false, error: "Missing content" }, 400);
    }

    const fallback = body.fallback === true;
    const sender = fallback ? "admin" : "ai";
    const createdAt =
      isValidIsoDate(body.created_at) ? body.created_at! : new Date().toISOString();

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing, error: existingError } = await supabase
      .from("messages")
      .select("id")
      .eq("user_id", body.user_id)
      .eq("sender", sender)
      .eq("payload->>sofinity_callback_id", body.callback_id)
      .maybeSingle();

    if (existingError) {
      return jsonResponse({ success: false, error: existingError.message }, 500);
    }

    if (existing?.id) {
      return jsonResponse({ success: true, idempotent: true, message_id: existing.id }, 200);
    }

    const payload = {
      ...(body.metadata ?? {}),
      sofinity_callback_id: body.callback_id,
      sofinity_fallback: fallback,
      sofinity_received_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({
        user_id: body.user_id,
        sender,
        content: body.content,
        topic: body.topic ?? null,
        event: body.event ?? "sofinity_callback",
        private: typeof body.private === "boolean" ? body.private : true,
        created_at: createdAt,
        payload,
      })
      .select("id")
      .single();

    if (insertError) {
      return jsonResponse({ success: false, error: insertError.message }, 500);
    }

    return jsonResponse(
      { success: true, idempotent: false, message_id: inserted.id, sender },
      200,
    );
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
