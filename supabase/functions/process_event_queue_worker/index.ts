import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const internalFunctionToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? ""
const timeoutMs = Number(Deno.env.get("EVENT_QUEUE_WORKER_TIMEOUT_MS") ?? "15000")
const BATCH_LIMIT = 50

const supabase = createClient(supabaseUrl, serviceRoleKey)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
}

const sendEndpoint =
  Deno.env.get("SOFINITY_RELAY_URL") ??
  "https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/sofinity-event"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // CHECK 1 (Worker Protection): INTERNAL_FUNCTION_TOKEN set → require matching x-internal-token
  const providedInternal = req.headers.get("x-internal-token") ?? ""
  if (internalFunctionToken && providedInternal !== internalFunctionToken) {
    return new Response(
      JSON.stringify({ success: false, errors: ["Unauthorized worker call"] }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  // CHECK 2 (Config): shared HMAC secret for Sofinity webhook
  const sofinityApiKey = Deno.env.get("SOFINITY_API_KEY")
  if (!sofinityApiKey || sofinityApiKey.trim().length === 0) {
    return new Response("SOFINITY_API_KEY missing", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  try {
    const { data: rows, error: fetchError } = await supabase
      .from("event_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT)

    if (fetchError) {
      return new Response(
        JSON.stringify({
          success: false,
          fetched: 0,
          processed: 0,
          errors: [fetchError.message],
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, fetched: 0, processed: 0, errors: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const errors: string[] = []
    let processed = 0

    for (const row of rows) {
      const bodyText = JSON.stringify(row)

      console.log("[process_event_queue] Sending event to Sofinity", {
        event_id: row.id,
        event_name: row.event_name,
        user_id: row.user_id,
      })

      let responseStatus: number | null = null
      let responseBodyText = ""

      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)

        // Fresh timestamp for header + HMAC on every send (retries / old queue rows must not reuse a stale value)
        const timestamp = Date.now().toString()
        const payloadToSign = timestamp + bodyText

        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(sofinityApiKey),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        )

        const signatureBuffer = await crypto.subtle.sign(
          "HMAC",
          key,
          encoder.encode(payloadToSign),
        )

        const signature = Array.from(new Uint8Array(signatureBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")

        const response = await fetch(sendEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sofinity-key": sofinityApiKey,
            "x-signature": signature,
            "x-timestamp": timestamp,
            "x-idempotency-key": crypto.randomUUID(),
          },
          body: bodyText,
          signal: controller.signal,
        }).finally(() => clearTimeout(timer))

        responseStatus = response.status
        responseBodyText = await response.text().catch(() => "")

        const nowIso = new Date().toISOString()

        if (response.ok) {
          const { error: updateOkError } = await supabase
            .from("event_queue")
            .update({
              status: "completed",
              processed_at: nowIso,
              last_attempt_at: nowIso,
              last_http_status: responseStatus,
              last_error: null,
            })
            .eq("id", row.id)

          if (updateOkError) {
            errors.push(`[${row.id}] update completed failed: ${updateOkError.message}`)
          } else {
            processed += 1
          }
        } else {
          const nextRetry = (typeof row.retry_count === "number" ? row.retry_count : 0) + 1
          const { error: updateFailError } = await supabase
            .from("event_queue")
            .update({
              status: "failed",
              retry_count: nextRetry,
              last_attempt_at: nowIso,
              last_http_status: responseStatus,
              last_error: responseBodyText,
            })
            .eq("id", row.id)

          if (updateFailError) {
            errors.push(`[${row.id}] update failed status failed: ${updateFailError.message}`)
          } else {
            errors.push(`[${row.id}] failed HTTP ${responseStatus}`)
          }
        }
      } catch (err: unknown) {
        const nextRetry = (typeof row.retry_count === "number" ? row.retry_count : 0) + 1
        const errMsg = err instanceof Error ? err.message : String(err)
        const nowIso = new Date().toISOString()

        console.error("[process_event_queue] Request error", {
          event_id: row.id,
          error: errMsg,
        })

        const { error: updateErr } = await supabase
          .from("event_queue")
          .update({
            status: "failed",
            retry_count: nextRetry,
            last_attempt_at: nowIso,
            last_http_status: responseStatus,
            last_error: errMsg,
          })
          .eq("id", row.id)

        if (updateErr) {
          errors.push(`[${row.id}] update failed after exception: ${updateErr.message}`)
        } else {
          errors.push(`[${row.id}] request exception: ${errMsg}`)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        fetched: rows.length,
        processed,
        errors,
      }),
      {
        status: errors.length === 0 ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ success: false, fetched: 0, processed: 0, errors: [msg] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
