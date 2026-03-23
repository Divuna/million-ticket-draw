import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const internalFunctionToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? ""

const supabase = createClient(supabaseUrl, serviceRoleKey)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
}

const BATCH_LIMIT = 50
const DEFAULT_TIMEOUT_MS = Number(Deno.env.get("EVENT_QUEUE_WORKER_TIMEOUT_MS") ?? "15000")

function categorizeError(params: { httpStatus?: number | null; err?: unknown; isAbort?: boolean }): string {
  const { httpStatus, err, isAbort } = params
  if (isAbort) return "timeout"
  if (typeof httpStatus === "number") {
    if (httpStatus === 401 || httpStatus === 403) return "auth"
    if (httpStatus >= 400 && httpStatus < 500) return "4xx"
    if (httpStatus >= 500 && httpStatus < 600) return "5xx"
    return "unknown"
  }

  const msg = err instanceof Error ? err.message : String(err ?? "")
  const lower = msg.toLowerCase()
  if (lower.includes("timeout") || lower.includes("aborted")) return "timeout"
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed")) return "network"
  return "unknown"
}

async function safeJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}))
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const providedInternal = req.headers.get("x-internal-token") ?? ""
    if (internalFunctionToken && providedInternal !== internalFunctionToken) {
      return new Response(
        JSON.stringify({ success: false, errors: ["Unauthorized worker call"] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const timeoutMs =
      Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0 ? DEFAULT_TIMEOUT_MS : 15000

    const candidateResp = await supabase
      .from("event_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT)

    if (candidateResp.error) {
      return new Response(
        JSON.stringify({ success: false, fetched: 0, processed: 0, errors: [candidateResp.error.message] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const candidates = candidateResp.data ?? []

    const eligible = candidates.filter((r: any) => {
      const retry = typeof r.retry_count === "number" ? r.retry_count : 0
      const maxRetry = typeof r.max_retry_count === "number" ? r.max_retry_count : 0
      return retry < maxRetry
    })

    const rows: any[] = eligible.slice(0, BATCH_LIMIT)

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, fetched: 0, processed: 0, errors: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const sendEndpoint = `${supabaseUrl}/functions/v1/send_event_to_sofinity`

    let processed = 0
    const errors: string[] = []

    for (const row of rows) {
      const startAtMs = Date.now()
      const attemptNowIso = new Date().toISOString()

      const rowId: string = row.id
      const rowStatus: string = row.status
      const rowRetry: number = typeof row.retry_count === "number" ? row.retry_count : 0
      const rowMaxRetry: number = typeof row.max_retry_count === "number" ? row.max_retry_count : 0

      // Helper functions (called exactly as requested)
      const update_event_queue_on_success = async (id: string) => {
        const durationMs = Date.now() - startAtMs
        await supabase
          .from("event_queue")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            last_attempt_at: attemptNowIso,
            processing_time_ms: durationMs,
          })
          .eq("id", id)
      }

      const update_event_queue_on_failure = async (id: string, error: string, http_status: number | null) => {
        const durationMs = Date.now() - startAtMs
        const nextRetry = rowRetry + 1
        const isDead = nextRetry >= rowMaxRetry
        const category = categorizeError({ httpStatus: http_status, err: error })

        const nextRetryAt = isDead
          ? null
          : new Date(Date.now() + Math.min(3600_000, Math.pow(2, nextRetry - 1) * 30_000)).toISOString()

        const updateFields: Record<string, any> = {
          status: isDead ? "dead" : "failed",
          last_attempt_at: attemptNowIso,
          last_error: error,
          last_http_status: http_status,
          error_category: category,
          retry_count: nextRetry,
          processing_time_ms: durationMs,
        }

        if (isDead) {
          updateFields.dead_lettered_at = new Date().toISOString()
          updateFields.next_retry_at = null
        } else {
          updateFields.next_retry_at = nextRetryAt
        }

        await supabase
          .from("event_queue")
          .update(updateFields)
          .eq("id", id)
      }

      // Take ownership: pending/failed -> processing
      const takeResp = await supabase
        .from("event_queue")
        .update({ status: "processing", last_attempt_at: attemptNowIso })
        .eq("id", rowId)
        .in("status", ["pending", "failed"])
        .select("id")
        .maybeSingle()

      const takeData = takeResp.data
      if (!takeData) {
        continue
      }

      let finalOutcome: "success" | "failure" = "failure"
      let finalError = "Unknown error"
      let finalHttpStatus: number | null = null

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        const response = await fetch(sendEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "x-internal-token": internalFunctionToken,
          },
          body: JSON.stringify({ event: row }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId))

        finalHttpStatus = response.status
        const json = await response.json().catch(() => ({}))

        const ok = response.ok === true && json && json.success === true
        if (!ok) {
          const msg =
            (json && typeof json.error === "string" && json.error) ||
            response.statusText ||
            `Sofinity/worker error HTTP ${response.status}`
          finalOutcome = "failure"
          finalError = msg
        } else {
          finalOutcome = "success"
        }
      } catch (e: any) {
        const isAbort = e && typeof e.name === "string" && e.name.toLowerCase().includes("abort")
        finalOutcome = "failure"
        finalError = e?.message ? String(e.message) : "Network error"
        finalHttpStatus = null

        // ensure category set as timeout vs network in update helper
        if (isAbort) {
          // overwrite error category by using error string "timeout"
          finalError = "timeout"
        }
      } finally {
        // Guarantee we NEVER leave the event in "processing"
        try {
          if (finalOutcome === "success") {
            await update_event_queue_on_success(rowId)
            processed += 1
          } else {
            await update_event_queue_on_failure(rowId, finalError, finalHttpStatus)
          }
        } catch (updateErr: any) {
          // Last resort: revert to failed (best-effort)
          const msg = updateErr instanceof Error ? updateErr.message : String(updateErr)
          errors.push(`[${rowId}] failed to finalize processing: ${msg}`)
          try {
            await supabase
              .from("event_queue")
              .update({
                status: "failed",
                last_attempt_at: attemptNowIso,
                last_error: msg,
                last_http_status: finalHttpStatus,
                error_category: "unknown",
                retry_count: rowRetry + 1,
                next_retry_at: new Date(Date.now() + 60_000).toISOString(),
              })
              .eq("id", rowId)
          } catch {
            // ignore
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: errors.length === 0, fetched: rows.length, processed, errors }),
      { status: errors.length === 0 ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ success: false, fetched: 0, processed: 0, errors: [msg] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
