import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SECRET_MIN_LENGTH = 32;
const MAX_LEAD_IDS = 100;
const MAX_DISCOVERY_JOB_IDS = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Action =
  | "approve_backend_verified_proposals"
  | "create_e_shopy_discovery_job"
  | "get_e_shopy_discovery_job_results"
  | "get_e_shopy_morning_discovery_state"
  | "create_next_e_shopy_morning_discovery_job";

type RequestBody = {
  schema_version?: number;
  action?: Action;
  lead_ids?: unknown;
  discovery_job_ids?: unknown;
  requested_count?: unknown;
  target_count?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;

  for (let i = 0; i < length; i += 1) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return mismatch === 0;
}

function authorize(req: Request): Response | null {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  const configuredSecret = Deno.env.get("SALES_LEAD_MAGIN_SUPPLY_AGENT_SECRET") ?? "";

  if (configuredSecret.length < SECRET_MIN_LENGTH) {
    return jsonResponse({ success: false, error: "agent_secret_not_configured" }, 500);
  }

  const header = req.headers.get("authorization") ?? "";
  const providedSecret = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";

  if (!timingSafeEqual(providedSecret, configuredSecret)) {
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }

  return null;
}

function getClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_service_not_configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getApprovedActorUserId(): string {
  const actorUserId = Deno.env.get("SALES_LEAD_MAGIN_SUPPLY_APPROVER_USER_ID") ?? "";

  if (!UUID_PATTERN.test(actorUserId)) {
    throw new Error("approved_actor_not_configured");
  }

  return actorUserId;
}

function parseLeadIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("lead_ids_required");
  }

  if (value.length === 0) {
    throw new Error("lead_ids_required");
  }

  if (value.length > MAX_LEAD_IDS) {
    throw new Error("too_many_leads");
  }

  for (const leadId of value) {
    if (typeof leadId !== "string" || !UUID_PATTERN.test(leadId)) {
      throw new Error("invalid_lead_id");
    }
  }

  return value;
}

function parseDiscoveryJobIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("discovery_job_ids_required");
  }

  if (value.length === 0) {
    throw new Error("discovery_job_ids_required");
  }

  if (value.length > MAX_DISCOVERY_JOB_IDS) {
    throw new Error("too_many_discovery_jobs");
  }

  for (const jobId of value) {
    if (typeof jobId !== "string" || !UUID_PATTERN.test(jobId)) {
      throw new Error("invalid_discovery_job_id");
    }
  }

  return value;
}

function parseTargetCount(value: unknown): number {
  if (!Number.isInteger(value)) {
    throw new Error("target_count_required");
  }

  if ((value as number) < 1 || (value as number) > 90) {
    throw new Error("target_count_out_of_range");
  }

  return value as number;
}

function parseRequestedCount(value: unknown): number {
  if (!Number.isInteger(value)) {
    throw new Error("requested_count_required");
  }

  if ((value as number) < 1 || (value as number) > 25) {
    throw new Error("requested_count_out_of_range");
  }

  return value as number;
}

async function handle(body: RequestBody): Promise<Response> {
  if (body.schema_version !== 1) {
    return jsonResponse({ success: false, error: "unsupported_schema_version" }, 400);
  }

  const supabase = getClient();
  const actorUserId = getApprovedActorUserId();

  if (body.action === "approve_backend_verified_proposals") {
    let leadIds: string[];

    try {
      leadIds = parseLeadIds(body.lead_ids);
    } catch (error) {
      return jsonResponse({ success: false, error: (error as Error).message }, 400);
    }

    const { data, error } = await supabase.rpc(
      "sales_lead_magin_approve_backend_verified_proposals",
      {
        p_lead_ids: leadIds,
        p_actor_user_id: actorUserId,
      },
    );

    if (error) {
      return jsonResponse({
        success: false,
        error: "approval_rpc_failed",
        details: error.message,
      }, 500);
    }

    return jsonResponse(data as Record<string, unknown>);
  }

  if (body.action === "get_e_shopy_discovery_job_results") {
    let discoveryJobIds: string[];

    try {
      discoveryJobIds = parseDiscoveryJobIds(body.discovery_job_ids);
    } catch (error) {
      return jsonResponse({ success: false, error: (error as Error).message }, 400);
    }

    const { data, error } = await supabase.rpc(
      "sales_lead_magin_get_discovery_job_results",
      {
        p_job_ids: discoveryJobIds,
        p_actor_user_id: actorUserId,
      },
    );

    if (error) {
      return jsonResponse({
        success: false,
        error: "discovery_results_rpc_failed",
        details: error.message,
      }, 500);
    }

    return jsonResponse(data as Record<string, unknown>);
  }

  if (body.action === "get_e_shopy_morning_discovery_state") {
    let targetCount: number;

    try {
      targetCount = parseTargetCount(body.target_count);
    } catch (error) {
      return jsonResponse({ success: false, error: (error as Error).message }, 400);
    }

    const { data, error } = await supabase.rpc(
      "sales_lead_magin_get_e_shopy_morning_discovery_state",
      {
        p_target_count: targetCount,
        p_actor_user_id: actorUserId,
      },
    );

    if (error) {
      return jsonResponse({ success: false, error: "morning_discovery_state_rpc_failed" }, 500);
    }

    return jsonResponse(data as Record<string, unknown>);
  }

  if (body.action === "create_next_e_shopy_morning_discovery_job") {
    let targetCount: number;

    try {
      targetCount = parseTargetCount(body.target_count);
    } catch (error) {
      return jsonResponse({ success: false, error: (error as Error).message }, 400);
    }

    const { data, error } = await supabase.rpc(
      "sales_lead_magin_create_next_e_shopy_morning_discovery_job",
      {
        p_target_count: targetCount,
        p_actor_user_id: actorUserId,
      },
    );

    if (error) {
      return jsonResponse({ success: false, error: "morning_discovery_create_rpc_failed" }, 500);
    }

    return jsonResponse(data as Record<string, unknown>);
  }

  if (body.action === "create_e_shopy_discovery_job") {
    let requestedCount: number;

    try {
      requestedCount = parseRequestedCount(body.requested_count);
    } catch (error) {
      return jsonResponse({ success: false, error: (error as Error).message }, 400);
    }

    const { data, error } = await supabase.rpc(
      "sales_lead_magin_create_e_shopy_discovery_job",
      {
        p_requested_count: requestedCount,
        p_actor_user_id: actorUserId,
      },
    );

    if (error) {
      return jsonResponse({
        success: false,
        error: "discovery_rpc_failed",
        details: error.message,
      }, 500);
    }

    return jsonResponse(data as Record<string, unknown>);
  }

  return jsonResponse({ success: false, error: "unsupported_action" }, 400);
}

serve(async (req) => {
  const authError = authorize(req);

  if (authError) {
    return authError;
  }

  let body: RequestBody;

  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  try {
    return await handle(body);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "internal_error",
    }, 500);
  }
});
