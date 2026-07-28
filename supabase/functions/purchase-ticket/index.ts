import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// In-process rate limiter — sliding window, per user
// Works for a single warm instance. For multi-instance deployments the DB
// fallback counter (tickets created in the last window) is used as a
// secondary check, ensuring correctness even across cold starts.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX    = 5;   // max purchases allowed …
const RATE_LIMIT_WINDOW = 5000; // … per this many milliseconds

interface WindowEntry {
  timestamps: number[]; // ring of request timestamps within the current window
}

const rateLimitStore = new Map<string, WindowEntry>();

/**
 * Returns true when the request is allowed; false when the limit is exceeded.
 * Uses a sliding-window algorithm: only timestamps inside [now-window, now]
 * are counted, so bursts cannot be reset by straddling a fixed window boundary.
 */
function allowRequest(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW;

  let entry = rateLimitStore.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(userId, entry);
  }

  // Drop timestamps older than the sliding window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    return false; // rate limit exceeded
  }

  entry.timestamps.push(now);
  return true;
}

// Periodically evict idle entries to prevent unbounded memory growth.
// Runs every 60 s; removes users whose last request is older than 2× the window.
setInterval(() => {
  const evictBefore = Date.now() - RATE_LIMIT_WINDOW * 2;
  for (const [userId, entry] of rateLimitStore.entries()) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < evictBefore) {
      rateLimitStore.delete(userId);
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// DB-based secondary check — counts tickets issued in the last window.
// Catches cases where in-memory state is stale (cold start / new instance).
// No schema changes required: uses the existing tickets table.
// ---------------------------------------------------------------------------
/** UUID validation for the verified customer id and requested contest id. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeRpcUuid(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  return UUID_RE.test(s) ? s.toLowerCase() : null;
}

async function dbWindowCount(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await serviceClient
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString());

  if (error) {
    // If the count query fails, do not block the purchase — fail open to avoid
    // a DB outage causing a total purchase blackout.
    console.warn("Rate limit DB check failed, failing open:", error.message);
    return 0;
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // ── Auth: read Authorization, extract Bearer JWT, resolve user (anon client) ──
    // Service-role clients calling auth.getUser(jwt) are unreliable in Edge; use
    // anon key + global Authorization header + getUser() like other functions.
    const authHeaderRaw = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeaderRaw?.trim()) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const bearerMatch = authHeaderRaw.match(/^\s*Bearer\s+(\S+)/i);
    const jwt = bearerMatch?.[1]?.trim() ?? "";
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing or invalid Bearer token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const user = authUser;
    if (!user.id?.trim()) {
      return new Response(JSON.stringify({ error: "Authenticated user has no id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const userId = user.id;

    // This client is never exposed to the caller. It is created only after the
    // customer JWT has been independently verified above.
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // ── Rate limit check (in-memory, primary) ──────────────────────────────
    if (!allowRequest(userId)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a few seconds." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        },
      );
    }

    // ── Rate limit check (DB, secondary — guards against cold-start bypass) ─
    const recentCount = await dbWindowCount(serviceClient, userId);
    if (recentCount >= RATE_LIMIT_MAX) {
      // Also update the in-memory store so subsequent requests on this
      // instance are blocked without an extra DB round-trip.
      const entry = rateLimitStore.get(userId);
      if (entry) {
        // Pad the timestamp ring to the limit so the in-memory check fires next time
        while (entry.timestamps.length < RATE_LIMIT_MAX) {
          entry.timestamps.push(Date.now());
        }
      }
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a few seconds." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        },
      );
    }

    // ── Request body validation ────────────────────────────────────────────
    const body = await req.json();
    const contest_id = body?.contest_id;

    if (contest_id == null || contest_id === "") {
      return new Response(JSON.stringify({ error: "contest_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const p_contest_id = normalizeRpcUuid(contest_id);
    const p_user_id = normalizeRpcUuid(user.id);
    if (!p_contest_id) {
      return new Response(JSON.stringify({ error: "contest_id must be a UUID string" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!p_user_id) {
      return new Response(JSON.stringify({ error: "Invalid authenticated user id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // ── Contest status check ───────────────────────────────────────────────
    const { data: contestRow, error: contestFetchError } = await serviceClient
      .from("contests")
      .select("status")
      .eq("id", p_contest_id)
      .maybeSingle();

    if (contestFetchError) {
      console.error("Contest status fetch error:", contestFetchError.message);
      return new Response(JSON.stringify({ error: "Nelze ověřit stav soutěže" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (!contestRow) {
      return new Response(JSON.stringify({ error: "Soutěž nenalezena" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    if (contestRow.status !== "active") {
      return new Response(JSON.stringify({ error: "Soutěž není aktivní" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Only contest_id comes from the body. p_user_id always comes from the
    // verified JWT, so a body.user_id value cannot select another account.
    const payload = {
      p_contest_id,
      p_user_id,
    };

    // ── Ensure wallet row exists before ticket purchase ───────────────────
    await serviceClient.rpc("ensure_wallet_exists", { p_user_id: userId });

    // ── Ticket purchase ────────────────────────────────────────────────────
    // The internal atomic RPC remains inaccessible to customer roles. The
    // service-only bridge supplies the verified JWT identity and preserves the
    // existing atomic contest/wallet logic.
    const { data, error: purchaseError } = await serviceClient.rpc(
      "buy_ticket_atomic_service",
      payload,
    );

    if (purchaseError) {
      return new Response(JSON.stringify({ error: purchaseError.message ?? "RPC error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const {
      ticket_number: _ticketNumber,
      next_bonus_position: _nextBonusPosition,
      distance_to_next_bonus: _distanceToNextBonus,
      remaining_tickets: _remainingTickets,
      ...publicData
    } = data ?? {};

    return new Response(JSON.stringify(publicData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("purchase-ticket error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
